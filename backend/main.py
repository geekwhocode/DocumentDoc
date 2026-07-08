import os
import tempfile
import shutil
import json
import time
from collections import defaultdict
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ingest import run_ingestion
from answer import answer_question, answer_question_stream, collection
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

# ---------------------------------------------------------------------------
# Rate Limiter – protects free-tier API keys from excessive usage
# ---------------------------------------------------------------------------
class RateLimiter:
    """
    In-memory, per-IP rate limiter with hourly, daily (per-user) and global
    daily caps.  Timestamps older than the current window are lazily pruned
    on each check so memory stays bounded.
    """

    def __init__(
        self,
        per_user_hourly: int = 10,
        per_user_daily: int = 30,
        global_daily: int = 400,
    ):
        self.per_user_hourly = per_user_hourly
        self.per_user_daily = per_user_daily
        self.global_daily = global_daily
        # Each value is a list of Unix timestamps recording past requests
        self._user_hits: dict[str, list[float]] = defaultdict(list)
        self._global_hits: list[float] = []

    def _prune(self, timestamps: list[float], window: float) -> list[float]:
        """Remove entries older than `window` seconds."""
        cutoff = time.time() - window
        return [t for t in timestamps if t > cutoff]

    def check(self, client_ip: str) -> str | None:
        """
        Returns None if the request is allowed, or an error message string
        describing which limit was exceeded.
        """
        now = time.time()
        hour = 3600
        day = 86400

        # --- global daily cap ---
        self._global_hits = self._prune(self._global_hits, day)
        if len(self._global_hits) >= self.global_daily:
            return "Global daily limit reached. Please try again tomorrow."

        # --- per-user hourly cap ---
        user_ts = self._user_hits[client_ip]
        user_ts_pruned = self._prune(user_ts, day)  # prune to daily window
        self._user_hits[client_ip] = user_ts_pruned

        recent_hour = [t for t in user_ts_pruned if t > now - hour]
        if len(recent_hour) >= self.per_user_hourly:
            return "You've reached the hourly limit (10 requests/hour). Please wait a bit."

        if len(user_ts_pruned) >= self.per_user_daily:
            return "You've reached the daily limit (30 requests/day). Please try again tomorrow."

        # --- record hit ---
        self._user_hits[client_ip].append(now)
        self._global_hits.append(now)
        return None


rate_limiter = RateLimiter()


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, respecting reverse-proxy headers."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []
    model: str = "groq/llama-3.3-70b-versatile"
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

@app.delete("/documents/{filename}")
def delete_document(filename: str):
    """
    Deletes all vector chunks and metadata associated with a given filename from ChromaDB.
    """
    try:
        if collection.count() == 0:
            return {"status": "success", "message": "Collection is empty."}
        
        collection.delete(where={"source": filename})
        return {"status": "success", "message": f"Document '{filename}' successfully deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), model: str = Form("groq/llama-3.3-70b-versatile")):
    """
    Endpoint for uploading documents (PDF, DOCX, TXT).
    Saves the file to a temporary location and triggers the ingestion pipeline.
    Rate-limited to protect free-tier API keys.
    """
    # --- rate limit check ---
    limit_msg = rate_limiter.check(_get_client_ip(request))
    if limit_msg:
        raise HTTPException(status_code=429, detail=limit_msg)

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
def chat(request: ChatRequest, raw_request: Request):
    """
    Endpoint for handling user chat queries.
    Invokes the RAG pipeline and returns the AI-generated answer along with source document metadata.
    Also saves messages to the local SQLite database.
    Rate-limited to protect free-tier API keys.
    """
    # --- rate limit check ---
    limit_msg = rate_limiter.check(_get_client_ip(raw_request))
    if limit_msg:
        raise HTTPException(status_code=429, detail=limit_msg)

    try:
        conversation_id = request.conversation_id
        is_new = False
        if not conversation_id:
            conversation_id = database.create_conversation(title=request.question)
            is_new = True

        chunks, stream_gen = answer_question_stream(request.question, request.history, request.model, request.active_files)
        
        sources = [chunk.metadata["source"] for chunk in chunks] if chunks else []
        unique_sources = list(set(sources))

        def response_generator():
            full_answer = []
            yield f"data: {json.dumps({'type': 'sources', 'sources': unique_sources})}\n\n"
            yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conversation_id})}\n\n"
            
            try:
                for text_chunk in stream_gen:
                    full_answer.append(text_chunk)
                    yield f"data: {json.dumps({'type': 'content', 'content': text_chunk})}\n\n"
                
                assistant_answer = "".join(full_answer)
                database.save_message(conversation_id, "user", request.question)
                database.save_message(conversation_id, "assistant", assistant_answer)
                
                if not is_new and len(request.history) == 0:
                    database.update_conversation_title(conversation_id, request.question)
                
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            except Exception as api_err:
                if is_new:
                    try:
                        database.delete_conversation(conversation_id)
                    except:
                        pass
                err_msg = str(api_err)
                if "rate_limit" in err_msg.lower() or "429" in err_msg or "quota" in err_msg.lower() or "exhausted" in err_msg.lower():
                    detail = "Gemini API rate limit reached. Please wait a few seconds and try again."
                else:
                    detail = f"LLM API Error: {err_msg}"
                yield f"data: {json.dumps({'type': 'error', 'error': detail})}\n\n"

        return StreamingResponse(response_generator(), media_type="text/event-stream")
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

