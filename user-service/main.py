import threading
import logging
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from passlib.context import CryptContext
import uvicorn

from database import engine, SessionLocal, Base, get_db
import models
import schemas
from bloom import user_bloom_filter

# Global lock for serializing registration critical sections against concurrent race attacks
registration_lock = threading.Lock()

# Configure logging to console
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CORS Configuration
# ---------------------------------------------------------------------------
# Allows the frontend (Vite dev server) to call this API from the browser.
# Without this, the browser blocks the request before it reaches this
# service, since frontend (5173) and backend (8010) are different origins.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# ---------------------------------------------------------------------------
# Password Hashing Setup
# ---------------------------------------------------------------------------
# Uses bcrypt hashing via PassLib.
# Passwords are never stored in plain text.
# The algorithm incorporates salt automatically and is computationally slow
# to protect against brute-force / dictionary attacks.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plain text password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against the stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# Application Lifespan: Startup & Shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan Context Manager.
    
    On Startup:
    1. Ensures PostgreSQL database tables exist (creates them if not present).
    2. Hydrates the in-memory Bloom filter with all existing usernames and
       emails from PostgreSQL. This ensures zero data drift on restarts.
    """
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer';"))
            conn.commit()
    except Exception as e:
        logger.warning(f"Role column migration check: {e}")

    logger.info("Hydrating Bloom filter with existing users from PostgreSQL...")
    db: Session = SessionLocal()
    try:
        count = user_bloom_filter.load_from_db(db)
        logger.info(f"Bloom filter successfully initialized with {count} users.")
    except Exception as e:
        logger.error(f"Error loading users into Bloom filter: {e}")
        raise e
    finally:
        db.close()

    yield

    logger.info("Shutting down User Service...")


# ---------------------------------------------------------------------------
# FastAPI Instance (Named `app` per requirement)
# ---------------------------------------------------------------------------
app = FastAPI(
    title="User Service",
    description="Microservice managing user registration and authentication with Bloom Filter pre-checks and PostgreSQL.",
    version="1.0.0",
    lifespan=lifespan
)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
def health_check():
    """Service health probe."""
    return {"status": "healthy", "service": "user-service"}


# ---------------------------------------------------------------------------
# POST /signup - User Registration Endpoint
# ---------------------------------------------------------------------------
@app.post(
    "/signup",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    tags=["Auth"]
)
def signup(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Registers a new user with a 2-tier uniqueness validation architecture:
    
    1. TIER 1 - Fast Bloom Filter Pre-Check (In-Memory Microseconds):
       - If Bloom returns False -> Guaranteed 100% NOT in DB (zero false negatives).
         We completely skip expensive DB SELECT queries for unique signups!
       - If Bloom returns True -> Possibly in DB (or 0.1% false positive).
         We proceed to Tier 2 to verify with PostgreSQL.
         
    2. TIER 2 - PostgreSQL Uniqueness Verification & Final Guarantee (ACID):
       - Verifies if the Bloom 'True' was a real duplicate or a false positive.
       - Database UNIQUE constraint enforces ACID serialization against concurrent race conditions.
    """

    # -----------------------------------------------------------------------
    # Step 1: Fast Bloom Filter Pre-Check for Username (Lock-Free)
    # -----------------------------------------------------------------------
    if user_bloom_filter.check_username(user_in.username):
        logger.info(f"Bloom check positive for username '{user_in.username}'. Verifying in PostgreSQL...")
        existing_user = db.query(models.User).filter(models.User.username == user_in.username).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username '{user_in.username}' is already taken."
            )
        logger.info(f"PostgreSQL verified: '{user_in.username}' was a Bloom false positive. Proceeding.")

    # -----------------------------------------------------------------------
    # Step 2: Fast Bloom Filter Pre-Check for Email (Lock-Free)
    # -----------------------------------------------------------------------
    if user_bloom_filter.check_email(user_in.email):
        logger.info(f"Bloom check positive for email '{user_in.email}'. Verifying in PostgreSQL...")
        existing_email = db.query(models.User).filter(models.User.email == user_in.email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{user_in.email}' is already registered."
            )
        logger.info(f"PostgreSQL verified: '{user_in.email}' was a Bloom false positive. Proceeding.")

    # -----------------------------------------------------------------------
    # Step 3: Critical Section with Double-Checked Locking
    # -----------------------------------------------------------------------
    # When multiple concurrent requests attempt the exact same username simultaneously,
    # the first thread acquires the lock, hashes the password, commits to DB, and updates
    # the Bloom filter. Subsequent waiting threads immediately see the updated Bloom
    # filter and DB record upon entering the lock, instantly short-circuiting with 400
    # without wasting seconds of CPU on redundant bcrypt hashes.
    with registration_lock:
        # Re-check in PostgreSQL inside lock
        if user_bloom_filter.check_username(user_in.username):
            existing_user = db.query(models.User).filter(models.User.username == user_in.username).first()
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username '{user_in.username}' is already taken."
                )

        if user_bloom_filter.check_email(user_in.email):
            existing_email = db.query(models.User).filter(models.User.email == user_in.email).first()
            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email '{user_in.email}' is already registered."
                )

        # Step 4: Hash Password (Only computed for genuine candidate registrations)
        hashed_pwd = hash_password(user_in.password)

        # Step 5: Persist to PostgreSQL (Database UNIQUE constraint is final guarantee)
        new_user = models.User(
            username=user_in.username,
            email=user_in.email,
            password_hash=hashed_pwd,
            role="customer"  # Explicitly enforce 'customer' role for all public registrations
        )

        db.add(new_user)
        try:
            db.commit()
            db.refresh(new_user)
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username or email already exists in the database."
            )

        # Step 6: Update the Bloom Filter
        user_bloom_filter.add_user(new_user.username, new_user.email)
        logger.info(f"User '{new_user.username}' successfully registered and added to Bloom filter.")

    return new_user


# ---------------------------------------------------------------------------
# POST /login - User Authentication Endpoint
# ---------------------------------------------------------------------------
@app.post(
    "/login",
    response_model=schemas.LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate a user",
    tags=["Auth"]
)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    """
    Authenticates a user via username or email and password.
    
    1. Finds the user record in PostgreSQL by username or email.
    2. Verifies the provided password against the stored bcrypt hash.
    3. Generates a token and returns the user object with their role for RBAC.
    """
    query = db.query(models.User)
    if login_data.username:
        query = query.filter(models.User.username == login_data.username)
    elif login_data.email:
        query = query.filter(models.User.email == login_data.email)

    user = query.first()

    # Generic error message to prevent account enumeration
    invalid_credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials. Please check your username/email and password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user:
        raise invalid_credentials_exception

    # Verify password hash using passlib/bcrypt
    if not verify_password(login_data.password, user.password_hash):
        raise invalid_credentials_exception

    # Generate token for session/auth state
    token = f"jwt_{secrets.token_urlsafe(32)}"

    logger.info(f"User '{user.username}' (role: '{user.role}') successfully authenticated.")
    return schemas.LoginResponse(
        token=token,
        user=user,
        message="Login successful"
    )


# ---------------------------------------------------------------------------
# Run on Port 8001
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)