import sqlite3
from contextlib import contextmanager
from datetime import datetime

from .config import DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        yield conn, cursor
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db_cursor() as (_, cursor):
        cursor.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                msg_type TEXT NOT NULL,
                text_plain TEXT,
                text_cipher BLOB,
                created_at TEXT NOT NULL,
                has_attachment INTEGER DEFAULT 0,
                has_link INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                file_name TEXT NOT NULL,
                mime_type TEXT,
                size_bytes INTEGER,
                storage_key TEXT,
                sha256 TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                domain TEXT,
                title TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ocr_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                attachment_id INTEGER NOT NULL,
                ocr_text TEXT NOT NULL,
                confidence REAL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS rag_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                source_type TEXT NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
                content,
                message_id UNINDEXED,
                source_type UNINDEXED
            );
            """
        )


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
