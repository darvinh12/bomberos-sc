from bomberos_api.core.security import (
    create_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_and_verify() -> None:
    h = hash_password("Sup3rPass!2026")
    assert h != "Sup3rPass!2026"
    assert h.startswith("$2") or h.startswith("$bcrypt")
    assert verify_password("Sup3rPass!2026", h)
    assert not verify_password("Otra", h)


def test_jwt_roundtrip() -> None:
    token = create_token(42, "access", {"roles": ["RRHH"]})
    decoded = decode_token(token, expected_type="access")
    assert decoded["sub"] == "42"
    assert decoded["type"] == "access"
    assert decoded["roles"] == ["RRHH"]


def test_jwt_wrong_type() -> None:
    token = create_token(1, "refresh")
    try:
        decode_token(token, expected_type="access")
    except ValueError:
        return
    raise AssertionError("debió rechazar token tipo distinto")


def test_password_complexity_validator() -> None:
    from pydantic import ValidationError

    from bomberos_api.schemas.auth import ChangePasswordRequest

    for bad in ["12345678aA", "abcdefghi1!", "ABCDEFGHI1!", "Abcdefghij!", "Abcdefghi1"]:
        try:
            ChangePasswordRequest(password_actual="x", password_nuevo=bad)
        except ValidationError:
            continue
        raise AssertionError(f"debió rechazar '{bad}'")

    ChangePasswordRequest(password_actual="x", password_nuevo="Sup3rPass!2026")
