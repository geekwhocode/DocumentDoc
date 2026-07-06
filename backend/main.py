import os
import tempfile
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ingest import run_ingestion
from answer import answer_question, collection
from dotenv import load_dotenv
import database

load_dotenv(override=True)
database.init_db()

app = FastAPI(
    title="DocumentDoc RAG API",
    description="FastAPI backend for document ingestion and RAG-based chat."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    model: str = "gemini/gemini-2.5-flash"
    conversation_id: str | None = None
    active_files: list[str] | None = None

@app.get("/models")
def get_models():
    """
    Returns the list of available LLM models that the frontend can select from.
    """
    return {
        "models": [
            {"id": "gemini/gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
            {"id": "groq/llama-3.3-70b-versatile", "name": "Llama 3.3 70B (Groq)"}
        ]
    }

@app.get("/documents")
def get_documents():
    """
    Fetches the list of all unique documents uploaded to ChromaDB.
    """
    try:
        if collection.count() == 0:
            return {"documents": []}
        results = collection.get(include=["metadatas"])
        sources = []
        if results and results["metadatas"]:
            sources = [meta["source"] for meta in results["metadatas"] if meta and "source" in meta]
        unique_sources = list(set(sources))
        return {"documents": unique_sources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), model: str = Form("gemini/gemini-2.5-flash")):
    """
    Endpoint for uploading documents (PDF, DOCX, TXT).
    Saves the file to a temporary location and triggers the ingestion pipeline.
    """
    try:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        result = run_ingestion(tmp_path, file.filename, model)
        os.unlink(tmp_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
def chat(request: ChatRequest):
    """
    Endpoint for handling user chat queries.
    Invokes the RAG pipeline and returns the AI-generated answer along with source document metadata.
    Also saves messages to the local SQLite database.
    """
    try:
        conversation_id = request.conversation_id
        is_new = False
        if not conversation_id:
            conversation_id = database.create_conversation(title=request.question)
            is_new = True

        try:
            # We run RAG and call the LLM, passing active_files filter
            answer, chunks = answer_question(request.question, request.history, request.model, request.active_files)
            
            # Save user and assistant messages to database only if call succeeds
            database.save_message(conversation_id, "user", request.question)
            database.save_message(conversation_id, "assistant", answer)

            # Update title if it was an existing chat but history was empty
            if not is_new and len(request.history) == 0:
                database.update_conversation_title(conversation_id, request.question)

            sources = [chunk.metadata["source"] for chunk in chunks] if chunks else []
            unique_sources = list(set(sources))
            return {
                "answer": answer,
                "sources": unique_sources,
                "conversation_id": conversation_id
            }
        except Exception as api_err:
            # If it failed and this was a new chat, delete the empty conversation to avoid polluting sidebar
            if is_new:
                database.delete_conversation(conversation_id)
            
            err_msg = str(api_err)
            # Check for Rate Limit or Quota errors
            if "rate_limit" in err_msg.lower() or "429" in err_msg or "quota" in err_msg.lower() or "exhausted" in err_msg.lower():
                raise HTTPException(
                    status_code=429,
                    detail="Gemini API rate limit reached. Please wait a few seconds and try again."
                )
            else:
                raise HTTPException(status_code=500, detail=f"LLM API Error: {err_msg}")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversations")
def get_conversations():
    try:
        return {"conversations": database.get_conversations()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversations/{conversation_id}")
def get_conversation_messages(conversation_id: str):
    try:
        messages = database.get_messages(conversation_id)
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    try:
        database.delete_conversation(conversation_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/conversations")
def create_conversation(title: str = "New Chat"):
    try:
        conv_id = database.create_conversation(title)
        return {"conversation_id": conv_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

