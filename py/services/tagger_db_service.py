"""Tagger タグ DB サービス（SQLite）。"""

import csv
import io
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)


class TaggerDbService:
    def __init__(self, db_file: Path):
        self.db_file = db_file
        self._init_db()

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.db_file))

    def _init_db(self):
        self.db_file.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT,
                    interrogator_tags TEXT,
                    vlm_tags TEXT,
                    all_tags TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            for sql in [
                "CREATE INDEX IF NOT EXISTS idx_all_tags ON images(all_tags)",
                "CREATE INDEX IF NOT EXISTS idx_filename ON images(filename)",
                "CREATE INDEX IF NOT EXISTS idx_created_at ON images(created_at DESC)",
            ]:
                conn.execute(sql)
            conn.commit()

    def save(self, filename: str, interrogator_tags: str, vlm_tags: str) -> int:
        all_tags = ", ".join(filter(None, [interrogator_tags, vlm_tags]))
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO images (filename, interrogator_tags, vlm_tags, all_tags) VALUES (?, ?, ?, ?)",
                (filename, interrogator_tags, vlm_tags, all_tags),
            )
            conn.commit()
            return cur.lastrowid

    def list(self, limit: int = 100, offset: int = 0) -> list:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, filename, interrogator_tags, vlm_tags, all_tags, created_at "
                "FROM images ORDER BY id DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [self._row(r) for r in rows]

    def total(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]

    def search(self, q: str) -> list:
        pattern = f"%{q}%"
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, filename, interrogator_tags, vlm_tags, all_tags, created_at "
                "FROM images WHERE all_tags LIKE ? OR filename LIKE ? ORDER BY id DESC LIMIT 200",
                (pattern, pattern),
            ).fetchall()
        return [self._row(r) for r in rows]

    def update(self, row_id: int, interrogator_tags: str, vlm_tags: str):
        all_tags = ", ".join(filter(None, [interrogator_tags, vlm_tags]))
        with self._conn() as conn:
            conn.execute(
                "UPDATE images SET interrogator_tags=?, vlm_tags=?, all_tags=? WHERE id=?",
                (interrogator_tags, vlm_tags, all_tags, row_id),
            )
            conn.commit()

    def delete(self, row_id: int):
        with self._conn() as conn:
            conn.execute("DELETE FROM images WHERE id=?", (row_id,))
            conn.commit()

    def export_csv(self) -> str:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, filename, interrogator_tags, vlm_tags, all_tags, created_at FROM images ORDER BY id"
            ).fetchall()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "filename", "interrogator_tags", "vlm_tags", "all_tags", "created_at"])
        writer.writerows(rows)
        return buf.getvalue()

    @staticmethod
    def _row(r) -> dict:
        return {
            "id": r[0],
            "filename": r[1] or "",
            "interrogator_tags": r[2] or "",
            "vlm_tags": r[3] or "",
            "all_tags": r[4] or "",
            "created_at": r[5] or "",
        }
