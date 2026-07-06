import os
from pathlib import Path
from pydantic import BaseModel, Field
from chromadb import PersistentClient
import pymupdf4llm
import docx
from sentence_transformers import SentenceTransformer
from litellm import completion

DB_NAME = os.getenv("CHROMA_DB_PATH", "./chromadb_data")
collection_name = "docs"
AVERAGE_CHUNK_SIZE = 100

embedding_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

class Result(BaseModel):
    page_content: str
    metadata: dict

class Chunk(BaseModel):
    headline: str = Field(description="A brief heading for this chunk, typically a few words, that is most likely to be surfaced in a query")
    summary: str = Field(description="A few sentences summarizing the content of this chunk to answer common questions")
    original_text: str = Field(description="The original text of this chunk from the provided document, exactly as is, not changed in any way")

    def as_result(self, document):
        metadata = {"source": document["source"], "type": document["type"]}
        return Result(
            page_content=self.headline + "\n\n" + self.summary + "\n\n" + self.original_text,
            metadata=metadata,
        )

class Chunks(BaseModel):
    chunks: list[Chunk]

def process_file_to_markdown(file_path: str, filename: str) -> dict:
    """
    Reads a file from the given path, converts it to markdown format if necessary,
    and returns a dictionary containing its type, source filename, and extracted text.
    Supported formats: PDF, DOCX, TXT/Markdown.
    """
    if filename.endswith(".pdf"):
        md_text = pymupdf4llm.to_markdown(file_path)
        return {"type": "pdf", "source": filename, "text": md_text}
    elif filename.endswith(".docx") or filename.endswith(".doc"):
        doc = docx.Document(file_path)
        md_text = "\n".join([para.text for para in doc.paragraphs])
        return {"type": "docx", "source": filename, "text": md_text}
    else:
        with open(file_path, "r", encoding="utf-8") as f:
            md_text = f.read()
        return {"type": "txt", "source": filename, "text": md_text}

def make_prompt(document):
    """
    Generates the LLM prompt for dividing a given document into overlapping chunks.
    Calculates the approximate number of chunks required based on document length.
    """
    how_many = max((len(document["text"]) // AVERAGE_CHUNK_SIZE) + 1, 1)
    return f"""
You take a document and you split the document into overlapping chunks for a KnowledgeBase.
The document is of type: {document["type"]}
The document has been retrieved from: {document["source"]}

A chatbot will use these chunks to answer questions.
You should divide up the document as you see fit, being sure that the entire document is returned across the chunks - don't leave anything out.
This document should probably be split into at least {how_many} chunks, but you can have more or less as appropriate.
There should be overlap between the chunks as appropriate; typically about 25% overlap or about 50 words.

For each chunk, you should provide a headline, a summary, and the original text of the chunk.

Here is the document:

{document["text"]}

Respond with the chunks.
"""

def make_messages(document):
    """
    Wraps the generated chunking prompt into the message format required by LiteLLM.
    """
    return [{"role": "user", "content": make_prompt(document)}]

def process_document(document, model):
    """
    Calls the specified LLM to process the document text and structure it into chunks.
    Uses Pydantic's structured JSON output validation to enforce the schema.
    """
    messages = make_messages(document)
    # Using litellm for chunk generation
    try:
        response = completion(model=model, messages=messages, response_format=Chunks)
        reply = response.choices[0].message.content
        doc_as_chunks = Chunks.model_validate_json(reply).chunks
        return [chunk.as_result(document) for chunk in doc_as_chunks]
    except Exception as e:
        print(f"Error generating chunks with model {model}: {e}")
        # fallback: single chunk
        return [Chunk(headline=document["source"], summary="Summary", original_text=document["text"]).as_result(document)]

def create_embeddings(chunks):
    """
    Generates embeddings for the provided document chunks using the HuggingFace model,
    and stores them persistently in ChromaDB along with their metadata.
    """
    if not chunks:
        return
    chroma = PersistentClient(path=DB_NAME)
    texts = [chunk.page_content for chunk in chunks]
    
    vectors = embedding_model.encode(texts).tolist()

    collection = chroma.get_or_create_collection(collection_name)
    
    existing_count = collection.count()
    ids = [str(existing_count + i) for i in range(len(chunks))]
    metas = [chunk.metadata for chunk in chunks]

    collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metas)
    print(f"Vectorstore updated. Total documents: {collection.count()}")

def run_ingestion(file_path: str, filename: str, model: str):
    """
    Orchestrates the full ingestion pipeline for a single file:
    1. Converts the file to markdown.
    2. Processes the markdown into chunks using an LLM.
    3. Embeds and stores the chunks in ChromaDB.
    """
    document = process_file_to_markdown(file_path, filename)
    chunks = process_document(document, model)
    create_embeddings(chunks)
    return {"status": "success", "chunks_created": len(chunks)}
