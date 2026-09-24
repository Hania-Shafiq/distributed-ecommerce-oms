# database.py
# ─────────────────────────────────────────────────────────────────────────────
# Manages the PostgreSQL database connection and session lifecycle for Order Service.
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Load .env variables before reading
load_dotenv()

# Pull database URL with fallback
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5435/orders_db")

# Create SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

# Session factory
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)

# Base class for ORM models
class Base(DeclarativeBase):
    pass

# FastAPI Dependency for database sessions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
