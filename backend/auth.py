"""
Auth utilities: password hashing, JWT creation/decoding.
No FastAPI routes here — pure functions only.
"""
import os
import string
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt_lib
from fastapi import HTTPException, status
from jose import JWTError, jwt

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

SPECIAL_CHARS = set(string.punctuation)


def _secret() -> str:
    key = os.getenv("JWT_SECRET_KEY", "")
    if not key:
        raise RuntimeError("JWT_SECRET_KEY environment variable is not set")
    return key


def hash_password(plain: str) -> str:
    return _bcrypt_lib.hashpw(plain.encode(), _bcrypt_lib.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(plain.encode(), hashed.encode())


def validate_password_rules(plain: str) -> None:
    errors = []
    if len(plain) < 8:
        errors.append("at least 8 characters")
    if not any(c.isupper() for c in plain):
        errors.append("an uppercase letter")
    if not any(c.isdigit() for c in plain):
        errors.append("a number")
    if not any(c in SPECIAL_CHARS for c in plain):
        errors.append("a special character")
    if errors:
        raise ValueError(f"Password must contain {', '.join(errors)}")


def create_access_token(user_id: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "type": "access", "exp": expire}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(tz=timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "type": "refresh", "exp": expire}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            raise JWTError("not an access token")
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise JWTError("missing sub")
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_refresh_token(token: str) -> str:
    """Returns user_id or raises 401."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise JWTError("not a refresh token")
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise JWTError("missing sub")
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
