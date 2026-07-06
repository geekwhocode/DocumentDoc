import os
from chromadb import PersistentClient
from litellm import completion
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

DB_NAME = os.getenv("CHROMA_DB_PATH", "./chromadb_data")
collection_name = "docs"

embedding_model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

chroma = PersistentClient(path=DB_NAME)
collection = chroma.get_or_create_collection(collection_name)

RETRIEVAL_K = 20
FINAL_K = 10

SYSTEM_PROMPT = """
You are a knowledgeable, friendly assistant representing our application.
You are chatting with a user.
Your answer will be evaluated for accuracy, relevance and completeness, so make sure it only answers the question and fully answers it.
If you don't know the answer, say so.
For context, here are specific extracts from the Knowledge Base that might be directly relevant to the user's question:
{context}

With this context, please answer the user's question. Be accurate, relevant and complete. Use Markdown formatting.
"""

class Result(BaseModel):
    page_content: str
    metadata: dict

class RankOrder(BaseModel):
    order: list[int] = Field(
        description="The order of relevance of chunks, from most relevant to least relevant, by chunk id number"
    )

def rerank(question, chunks, model):
    """
    Uses the specified LLM to re-rank a given list of retrieved chunks based on their
    relevance to the user's question, returning the re-ordered list.
    """
    system_prompt = """
You are a document re-ranker.
You are provided with a question and a list of relevant chunks of text from a query of a knowledge base.
You must rank order the provided chunks by relevance to the question, with the most relevant chunk first.
Reply only with the list of ranked chunk ids, nothing else. Include all the chunk ids you are provided with, reranked.
"""
    user_prompt = f"Question:\n\n{question}\n\nOrder all the chunks of text by relevance to the question, from most relevant to least relevant. Include all the chunk ids you are provided with, reranked.\n\n"
    user_prompt += "Here are the chunks:\n\n"
    for index, chunk in enumerate(chunks):
        user_prompt += f"# CHUNK ID: {index + 1}:\n\n{chunk.page_content}\n\n"
    user_prompt += "Reply only with the list of ranked chunk ids, nothing else."
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        response = completion(model=model, messages=messages, response_format=RankOrder)
        reply = response.choices[0].message.content
        order = RankOrder.model_validate_json(reply).order
        return [chunks[i - 1] for i in order if 0 < i <= len(chunks)]
    except Exception as e:
        print(f"Rerank failed: {e}")
        return chunks

def make_rag_messages(question, history, chunks):
    """
    Constructs the final prompt messages for the LLM to answer the user's question,
    incorporating the retrieved chunks as context and previous conversation history.
    """
    context = "\n\n".join(
        f"Extract from {chunk.metadata['source']}:\n{chunk.page_content}" for chunk in chunks
    )
    system_prompt = SYSTEM_PROMPT.format(context=context)
    return (
        [{"role": "system", "content": system_prompt}]
        + history
        + [{"role": "user", "content": question}]
    )

def rewrite_query(question, history, model):
    """
    Rewrites the user's query into a concise, standalone question optimized for
    vector database retrieval, taking into account the conversation history.
    """
    message = f"""
You are in a conversation with a user.
You are about to look up information in a Knowledge Base to answer the user's question.

History:
{history}

Current question:
{question}

Respond only with a short, refined question that you will use to search the Knowledge Base.
It should be a VERY short specific question most likely to surface content. Focus on the question details.
IMPORTANT: Respond ONLY with the precise knowledgebase query, nothing else.
"""
    try:
        response = completion(model=model, messages=[{"role": "system", "content": message}])
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Rewrite failed: {e}")
        return question

def merge_chunks(chunks, reranked):
    """
    Merges two lists of retrieved chunks, avoiding duplicates based on page_content.
    """
    merged = chunks[:]
    existing = [chunk.page_content for chunk in chunks]
    for chunk in reranked:
        if chunk.page_content not in existing:
            merged.append(chunk)
    return merged

def fetch_context_unranked(question):
    """
    Retrieves the top K most relevant chunks from ChromaDB for a given query string,
    using cosine similarity on HuggingFace embeddings without any LLM reranking.
    """
    if collection.count() == 0:
        return []
    query_vector = embedding_model.encode([question]).tolist()[0]
    results = collection.query(query_embeddings=[query_vector], n_results=min(RETRIEVAL_K, collection.count()))
    chunks = []
    if results["documents"] and results["documents"][0]:
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            chunks.append(Result(page_content=doc, metadata=meta))
    return chunks

def fetch_context(original_question, history, model):
    """
    Orchestrates the full context retrieval pipeline:
    1. Rewrites the query.
    2. Fetches unranked chunks for both original and rewritten queries.
    3. Merges the results.
    4. Reranks the merged chunks using an LLM and returns the top FINAL_K chunks.
    """
    if collection.count() == 0:
        return []
    rewritten_question = rewrite_query(original_question, history, model)
    chunks1 = fetch_context_unranked(original_question)
    chunks2 = fetch_context_unranked(rewritten_question)
    chunks = merge_chunks(chunks1, chunks2)
    reranked = rerank(original_question, chunks, model)
    return reranked[:FINAL_K]

def answer_question(question: str, history: list[dict], model: str) -> tuple[str, list]:
    """
    Executes the full RAG pipeline: retrieves relevant context for the user's question,
    generates an answer using the chosen LLM, and returns both the answer and context.
    """
    chunks = fetch_context(question, history, model)
    messages = make_rag_messages(question, history, chunks)
    response = completion(model=model, messages=messages)
    return response.choices[0].message.content, chunks
