"""Hash de contraseñas (bcrypt) y emisión/verificación de JWT (PyJWT).

Se usa PyJWT en lugar de python-jose, afectado por CVE-2024-33663 (confusión de
algoritmo) y CVE-2024-33664 (DoS por JWE comprimido). El algoritmo se fija en la
verificación (`algorithms=[...]`), de modo que un token con `alg: none` o con un
algoritmo distinto al configurado se rechaza.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

import jwt
from passlib.context import CryptContext

from bomberos_api.config import get_settings

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

TokenType = Literal["access", "refresh"]

# Claims obligatorios: si falta alguno, PyJWT lanza MissingRequiredClaimError.
_REQUIRED_CLAIMS = ["exp", "iat", "sub", "type"]


def hash_password(plain: str) -> str:
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def create_token(
    subject: str | int,
    token_type: TokenType = "access",
    extra_claims: dict[str, Any] | None = None,
) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    if token_type == "access":
        expires = now + timedelta(minutes=s.jwt_access_token_expire_minutes)
    else:
        expires = now + timedelta(days=s.jwt_refresh_token_expire_days)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "type": token_type,
        # Identificador único: dos tokens emitidos en el mismo segundo son
        # distintos (la rotación de /auth/refresh siempre entrega uno nuevo).
        "jti": uuid4().hex,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, s.jwt_secret_key, algorithm=s.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    s = get_settings()
    try:
        payload = jwt.decode(
            token,
            s.jwt_secret_key,
            algorithms=[s.jwt_algorithm],
            options={"require": _REQUIRED_CLAIMS},
        )
    except jwt.PyJWTError as e:
        raise ValueError(f"token inválido: {e}") from e
    if expected_type and payload.get("type") != expected_type:
        raise ValueError(f"se esperaba token tipo '{expected_type}'")
    return payload
