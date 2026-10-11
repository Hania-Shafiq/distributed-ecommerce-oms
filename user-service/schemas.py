import re
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator, field_validator

# ---------------------------------------------------------------------------
# Base User Schema
# ---------------------------------------------------------------------------
class UserBase(BaseModel):
    """
    Shared user properties used for validation across creation and read schemas.
    """
    username: str = Field(..., min_length=3, max_length=50, description="Unique username for the account")
    email: EmailStr = Field(..., description="Valid email address for the account")


# ---------------------------------------------------------------------------
# User Registration / Signup Schema
# ---------------------------------------------------------------------------
class UserCreate(UserBase):
    """
    Request schema for POST /signup.
    Includes the plain text password from the client.
    Note: The password will be hashed using bcrypt before persisting to PostgreSQL.
    """
    password: str = Field(..., min_length=8, max_length=128, description="User password (min 8 characters)")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 20:
            raise ValueError("Username must be between 3 and 20 characters long.")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username can only contain letters, numbers, and underscores.")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        return v


# ---------------------------------------------------------------------------
# User Login Schema
# ---------------------------------------------------------------------------
class UserLogin(BaseModel):
    """
    Request schema for POST /login.
    Supports authenticating via username OR email, along with the password.
    """
    username: Optional[str] = Field(None, description="Username of the user")
    email: Optional[EmailStr] = Field(None, description="Email of the user")
    password: str = Field(..., min_length=1, description="Account password")

    @model_validator(mode="after")
    def check_identifier_provided(self):
        """
        Validate that at least one identifier (username or email) is provided.
        """
        if not self.username and not self.email:
            raise ValueError("Either 'username' or 'email' must be provided for login.")
        return self


# ---------------------------------------------------------------------------
# User Response Schema
# ---------------------------------------------------------------------------
class UserResponse(UserBase):
    """
    Response schema returning safe public user details.
    Never exposes `password_hash` to clients.
    Includes the 'role' field ('customer' or 'admin') for RBAC authorization.
    """
    id: int
    role: str = "customer"

    # Pydantic v2 configuration to allow parsing from SQLAlchemy ORM objects
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Login Response Schema
# ---------------------------------------------------------------------------
class LoginResponse(BaseModel):
    """
    Response schema for POST /login.
    Returns authentication token and user profile including role for RBAC.
    Matches format: { "token": "...", "user": { "id": 1, "username": "...", "role": "customer" } }
    """
    token: str
    user: UserResponse
    message: Optional[str] = "Login successful"

