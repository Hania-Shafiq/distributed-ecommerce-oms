import os
import hmac
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, status, Depends
import jwt

JWT_SECRET = os.getenv("JWT_SECRET")
INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY")
JWT_ALGORITHM = "HS256"


def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Extract and verify JWT from Authorization: Bearer <token>.
    Returns the decoded claims dictionary (sub, username, role, etc.).
    Raises 401 on missing, invalid, or expired tokens.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]
    if not JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT_SECRET is not configured on this service",
        )

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token or signature",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """
    Ensure the authenticated caller has the 'admin' role.
    Raises 403 Forbidden otherwise.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_service_key(x_service_key: Optional[str] = Header(None, alias="X-Service-Key")) -> str:
    """
    Compare X-Service-Key header with INTERNAL_SERVICE_KEY using constant-time hmac.compare_digest.
    Raises 401 on missing key, 403 on invalid key.
    """
    if not x_service_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Service-Key header",
        )
    if not INTERNAL_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL_SERVICE_KEY is not configured on this service",
        )
    if not hmac.compare_digest(x_service_key, INTERNAL_SERVICE_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid service key",
        )
    return x_service_key


def require_service_key_or_admin(
    x_service_key: Optional[str] = Header(None, alias="X-Service-Key"),
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """
    Accepts either a valid X-Service-Key or a valid admin Bearer token.
    Used for inventory reduce and restock endpoints.
    """
    if x_service_key:
        if not INTERNAL_SERVICE_KEY:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="INTERNAL_SERVICE_KEY is not configured",
            )
        if not hmac.compare_digest(x_service_key, INTERNAL_SERVICE_KEY):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid service key",
            )
        return {"type": "service_key"}

    if authorization:
        user = get_current_user(authorization)
        if user.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        return {"type": "admin_user", "user": user}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing X-Service-Key or Authorization header",
        headers={"WWW-Authenticate": "Bearer"},
    )
