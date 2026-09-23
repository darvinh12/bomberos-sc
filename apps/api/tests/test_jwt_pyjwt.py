"""Pruebas unitarias de la emisión y verificación de JWT con PyJWT."""

import base64
import json
import sys
import time

import jwt
import pytest

from bomberos_api.config import get_settings
from bomberos_api.core import security
from bomberos_api.core.security import create_token, decode_token


def _b64(obj: dict) -> str:
    raw = json.dumps(obj, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _claims(token: str) -> dict:
    return jwt.decode(token, options={"verify_signature": False})


def test_usa_pyjwt_y_no_python_jose() -> None:
    assert security.jwt is jwt
    assert jwt.__name__ == "jwt" and hasattr(jwt, "PyJWTError")
    assert "jose" not in sys.modules


def test_algoritmo_hs256() -> None:
    token = create_token(7, "access")
    assert jwt.get_unverified_header(token)["alg"] == "HS256"
    assert get_settings().jwt_algorithm == "HS256"


def test_access_expira_en_30_minutos() -> None:
    c = _claims(create_token(7, "access"))
    assert c["exp"] - c["iat"] == 30 * 60
    assert c["type"] == "access"


def test_refresh_expira_en_7_dias() -> None:
    c = _claims(create_token(7, "refresh"))
    assert c["exp"] - c["iat"] == 7 * 24 * 60 * 60
    assert c["type"] == "refresh"


def test_token_expirado_rechazado() -> None:
    s = get_settings()
    ahora = int(time.time())
    vencido = jwt.encode(
        {"sub": "7", "type": "access", "iat": ahora - 3600, "exp": ahora - 60},
        s.jwt_secret_key,
        algorithm="HS256",
    )
    with pytest.raises(ValueError, match="expired"):
        decode_token(vencido, expected_type="access")


def test_firma_con_otra_clave_rechazada() -> None:
    ahora = int(time.time())
    falso = jwt.encode(
        {"sub": "1", "type": "access", "iat": ahora, "exp": ahora + 600},
        "una-clave-que-no-es-la-del-servidor-0123456789",
        algorithm="HS256",
    )
    with pytest.raises(ValueError, match="Signature"):
        decode_token(falso)


def test_payload_manipulado_rechazado() -> None:
    token = create_token(7, "access", {"roles": ["CONSULTA"]})
    cabecera, _, firma = token.split(".")
    c = _claims(token)
    c["roles"] = ["ADMIN"]  # escalada de privilegios sin re-firmar
    with pytest.raises(ValueError):
        decode_token(f"{cabecera}.{_b64(c)}.{firma}")


def test_alg_none_rechazado() -> None:
    ahora = int(time.time())
    sin_firma = (
        _b64({"alg": "none", "typ": "JWT"})
        + "."
        + _b64({"sub": "1", "type": "access", "iat": ahora, "exp": ahora + 600})
        + "."
    )
    with pytest.raises(ValueError):
        decode_token(sin_firma)


def test_otro_algoritmo_rechazado() -> None:
    ahora = int(time.time())
    hs512 = jwt.encode(
        {"sub": "1", "type": "access", "iat": ahora, "exp": ahora + 600},
        get_settings().jwt_secret_key,
        algorithm="HS512",
    )
    with pytest.raises(ValueError):
        decode_token(hs512)


@pytest.mark.parametrize("falta", ["exp", "iat", "sub", "type"])
def test_claims_obligatorios(falta: str) -> None:
    ahora = int(time.time())
    claims = {"sub": "1", "type": "access", "iat": ahora, "exp": ahora + 600}
    del claims[falta]
    token = jwt.encode(claims, get_settings().jwt_secret_key, algorithm="HS256")
    with pytest.raises(ValueError):
        decode_token(token)


def test_access_no_sirve_como_refresh() -> None:
    with pytest.raises(ValueError, match="refresh"):
        decode_token(create_token(1, "access"), expected_type="refresh")


def test_tokens_emitidos_en_el_mismo_segundo_son_distintos() -> None:
    a, b = create_token(1, "refresh"), create_token(1, "refresh")
    assert a != b
    assert _claims(a)["jti"] != _claims(b)["jti"]


def test_basura_rechazada() -> None:
    for basura in ("", "abc", "a.b.c", "Bearer x.y.z"):
        with pytest.raises(ValueError):
            decode_token(basura)
