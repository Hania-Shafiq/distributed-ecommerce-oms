import logging
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

# CORS middleware must be added right after the app is created, before
# any routes are defined, so it wraps every request/response.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
    # Step 1: Bloom Filter Pre-Check for Username
    # -----------------------------------------------------------------------
    # Why check bloom first?
    # - If check_username(user_in.username) is False:
    #   Mathematically, there is NO CHANCE this username exists.
    #   We save a PostgreSQL SELECT query entirely.
    # - If check_username(user_in.username) is True:
    #   Why postgres check after?
    #   Bloom filters can produce false positives (items reported present when they aren't).
    #   So we verify with PostgreSQL before rejecting the user.
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
    # Step 2: Bloom Filter Pre-Check for Email
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
    # Step 3: Hash Password (Never store plain text)
    # -----------------------------------------------------------------------
    hashed_pwd = hash_password(user_in.password)

    # -----------------------------------------------------------------------
    # Step 4: Persist to PostgreSQL (Database UNIQUE constraint is final guarantee)
    # -----------------------------------------------------------------------
    # Why the UNIQUE constraint in PostgreSQL is essential:
    # If two identical signups execute concurrently within the same millisecond,
    # both could pass the Bloom filter check at the same instant.
    # PostgreSQL's UNIQUE constraint ensures database-level atomicity:
    # only one transaction succeeds; the other triggers IntegrityError and rolls back.
    new_user = models.User(
        username=user_in.username,
        email=user_in.email,
        password_hash=hashed_pwd
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

    # -----------------------------------------------------------------------
    # Step 5: Update the Bloom Filter
    # -----------------------------------------------------------------------
    # Once the transaction is successfully committed to PostgreSQL, add the new
    # username and email to the Bloom filter so subsequent requests know they exist.
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
    3. Returns success and user details if valid; raises 401 Unauthorized if invalid.
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

    logger.info(f"User '{user.username}' successfully authenticated.")
    return schemas.LoginResponse(
        message="Login successful",
        user=user
    )


# ---------------------------------------------------------------------------
# Run on Port 8010
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)