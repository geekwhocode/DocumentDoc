import sqlite3
import os
import uuid
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(__file__), "chat_history.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)
        
        # Dynamic Schema Migration for Live Evaluations
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(messages)")
        columns = [row["name"] for row in cursor.fetchall()]
        
        if "faithfulness_score" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN faithfulness_score REAL")
        if "relevancy_score" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN relevancy_score REAL")
        if "evaluation_reason" not in columns:
            conn.execute("ALTER TABLE messages ADD COLUMN evaluation_reason TEXT")
            
        conn.commit()

def create_conversation(title="New Chat"):
    conv_id = str(uuid.uuid4())
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO conversations (id, title) VALUES (?, ?)",
            (conv_id, title)
        )
        conn.commit()
    return conv_id

def get_conversations():
    with get_db_connection() as conn:
        cursor = conn.execute("SELECT id, title, created_at FROM conversations ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_messages(conversation_id):
    with get_db_connection() as conn:
        cursor = conn.execute(
            "SELECT role, content, faithfulness_score, relevancy_score, evaluation_reason FROM messages WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,)
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def save_message(conversation_id, role, content):
    with get_db_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (conversation_id, role, content)
        )
        conn.commit()
        return cursor.lastrowid

def update_message_evaluation(message_id, faithfulness_score, relevancy_score, evaluation_reason):
    with get_db_connection() as conn:
        conn.execute(
            """
            UPDATE messages 
            SET faithfulness_score = ?, relevancy_score = ?, evaluation_reason = ?
            WHERE id = ?
            """,
            (faithfulness_score, relevancy_score, evaluation_reason, message_id)
        )
        conn.commit()

def delete_conversation(conversation_id):
    with get_db_connection() as conn:
        conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
        conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
        conn.commit()

def update_conversation_title(conversation_id, title):
    if len(title) > 35:
        title = title[:32] + "..."
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE conversations SET title = ? WHERE id = ?",
            (title, conversation_id)
        )
        conn.commit()
