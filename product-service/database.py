# database.py
# ─────────────────────────────────────────────────────────────────────────────
# This module is the single source of truth for anything database-related.
# It creates the SQLAlchemy engine, a session factory, and the declarative
# base that all models inherit from.
# ─────────────────────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv                         # reads .env into os.environ
from sqlalchemy import create_engine                   # creates the DB connection pool
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# ── Load environment variables ────────────────────────────────────────────────
# load_dotenv() looks for a .env file in the current working directory
# (or up the directory tree) and injects every key=value pair into os.environ.
# This must happen BEFORE we read any env vars below.
load_dotenv()

# ── Pull the database URL from the environment ────────────────────────────────
# Using os.getenv with a fallback means:
#   • In production: set DATABASE_URL as a real env var → .env is never needed
#   • In development: .env provides it automatically
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/products_db")


# ── Create the SQLAlchemy engine ──────────────────────────────────────────────
# The engine manages the connection pool to PostgreSQL.
# pool_pre_ping=True: before using any pooled connection, SQLAlchemy sends a
#   lightweight "SELECT 1" ping.  This automatically discards stale connections
#   (e.g. after a DB restart or network hiccup) so we never get "server closed
#   the connection unexpectedly" errors at runtime.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


# ── Create a session factory ──────────────────────────────────────────────────
# sessionmaker returns a *class* (not an instance).  Each call to SessionLocal()
# produces a new Session object bound to our engine.
# autocommit=False → we control when to commit (explicit is safer).
# autoflush=False  → SQLAlchemy won't write pending changes to the DB until we
#                    call commit() or flush() ourselves.
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# ── Declarative base ──────────────────────────────────────────────────────────
# All SQLAlchemy ORM models (see models.py) inherit from Base.
# DeclarativeBase uses Python's metaclass magic to:
#   • Register the model in Base.metadata (needed for create_all)
#   • Map class attributes to DB columns
class Base(DeclarativeBase):
    pass


# ── Dependency injector for FastAPI endpoints ──────────────────────────────────
# FastAPI's Depends() system calls get_db() for every request that needs a DB
# session.  Using a generator (yield) with try/finally guarantees the session is
# always closed, even if the endpoint raises an exception.
# Without this, connections would leak and the pool would eventually exhaust.
def get_db():
    db = SessionLocal()          # open a new session
    try:
        yield db                 # hand it to the endpoint
    finally:
        db.close()               # always release it back to the pool
