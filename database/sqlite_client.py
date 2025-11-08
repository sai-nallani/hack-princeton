import aiosqlite
from datetime import datetime

DATABASE_PATH = "airguardian.db"

async def init_db():
    """Initialize SQLite database"""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                aircraft1 TEXT NOT NULL,
                aircraft2 TEXT NOT NULL,
                min_separation REAL,
                min_vertical_sep REAL,
                detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved BOOLEAN DEFAULT 0,
                resolution TEXT
            )
        ''')
        await db.commit()

async def store_conflict(aircraft1: str, aircraft2: str, min_sep: float, vertical_sep: float, resolution: str = None):
    """Store conflict to database"""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO conflicts (aircraft1, aircraft2, min_separation, min_vertical_sep, resolution) VALUES (?, ?, ?, ?, ?)",
            (aircraft1, aircraft2, min_sep, vertical_sep, resolution)
        )
        await db.commit()

async def get_conflicts(limit: int = 50):
    """Get recent conflicts"""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM conflicts ORDER BY detected_at DESC LIMIT ?", 
            (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]