import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """Login: usar /auth/login con OAuth2 form (username + password)."""

    usuario: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # segundos


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    password_actual: str = Field(min_length=1, max_length=128)
    password_nuevo: str = Field(min_length=10, max_length=128)

    @field_validator("password_nuevo")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("La contraseña debe incluir al menos una mayúscula.")
        if not re.search(r"[a-z]", v):
            raise ValueError("La contraseña debe incluir al menos una minúscula.")
        if not re.search(r"\d", v):
            raise ValueError("La contraseña debe incluir al menos un dígito.")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("La contraseña debe incluir al menos un carácter especial.")
        return v


class UsuarioMeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario: str
    nombre_completo: str
    correo: EmailStr | None
    activo: bool
    bloqueado: bool
    debe_cambiar_password: bool
    mfa_activo: bool
    funcionario_id: int | None
    roles: list[str] = []
