import os
import tempfile
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ingest import run_ingestion
from answer import answer_question
from dotenv import load_dotenv

load_dotenv(override=True)

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
    """
    try:
        answer, chunks = answer_question(request.question, request.history, request.model)
        sources = [chunk.metadata["source"] for chunk in chunks] if chunks else []
        unique_sources = list(set(sources))
        return {"answer": answer, "sources": unique_sources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
