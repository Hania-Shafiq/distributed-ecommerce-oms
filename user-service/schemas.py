from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator

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
    password: str = Field(..., min_length=6, max_length=128, description="User password (min 6 characters)")


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

