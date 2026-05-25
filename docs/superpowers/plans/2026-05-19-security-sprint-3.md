# Security Sprint 3 Implementation Plan — Hardening Avanzado

> **Para agentes:** SKILL REQUERIDA: `superpowers:subagent-driven-development` o `superpowers:executing-plans`.
> Este plan ejecuta los 35 entregables de Fase 3 del `docs/ROADMAP.md` (§6). Cubre los hallazgos P2 de `docs/SECURITY.md` que cierran la sección "Aceptación pre-producción".

**Goal:** Llevar el sistema a nivel producción gubernamental con MFA obligatorio (TOTP), JWT asimétrico (RS256), denylist real de tokens revocados, CSP estricta con nonce dinámico, password history y blacklist de top-10k, tests de seguridad exhaustivos (IDOR, role escalation, audit immutability, RLS isolation), SBOM en CI y `pip-audit`/`npm audit` bloqueante.

**Architecture:** TDD estricto en lógica de auth/MFA — cada entregable empieza con un test rojo. Tests E2E para flujos completos (enroll → verify → login 2FA). Algunos cambios requieren migración de datos existentes (`mfa_secret` plano → cifrado vía `pgcrypto` ya hecho en Sprint 2; JWT HS256 → RS256 fuerza logout global porque los tokens viejos serán rechazados). Defense in depth: aunque el backend ya tiene RLS (Sprint 1) y scope checks, el frontend añade middleware + CSP + auto-logout para defender ante endpoints olvidados.

**Tech Stack:**
- **Python:** `pyotp>=2.9` para TOTP (RFC 6238), `qrcode[pil]>=7.4` para PNG QR, `PyJWT[crypto]>=2.10` con RS256, `cryptography>=43` para cargar PEMs, `cyclonedx-bom>=4.4` para SBOM, `pip-audit>=2.7` para CVE scan.
- **Keys JWT:** RSA 4096 bits (alternativa segura y soportada universalmente). EdDSA Ed25519 evaluada y descartada por incompatibilidad con algunas librerías de auditoría externa.
- **Blacklist passwords:** `common-passwords.txt` derivada de SecLists top 10k (`SecLists/Passwords/Common-Credentials/10-million-password-list-top-10000.txt`), pre-procesada a lowercase y deduplicada, distribuida con el código fuente bajo `apps/api/src/bomberos_api/data/`.
- **Frontend:** Hook `useIdleLogout` custom (sin dependencias extra), `middleware.ts` de Next 14, CSP con nonce generado por middleware y propagado vía `headers()` API a `<Script>` y inline scripts críticos.
- **CI:** `@cyclonedx/cyclonedx-npm` para SBOM Node, `npm audit --omit=dev --audit-level=high` con `--json` parseado.

**Esfuerzo estimado:** 60 horas / 1-2 semanas / 1 dev senior.

**Prerrequisitos verificados:**
- [ ] Fase 1 cerrada (P0): RLS activo, scope checks, lockout temporal, `PyJWT` ya reemplazó `python-jose`, `JWT_SECRET_KEY` sin default.
- [ ] Fase 2 cerrada (P1): refresh tokens con reuse detection, `bcrypt` directo, `pgcrypto` cifrando `mfa_secret`, vistas con `security_invoker=true`.
- [ ] Tag `v0.4.0-security-sprint-2` en el repo.
- [ ] Tests de Sprint 1 y 2 verdes en CI.

---

## 0 · Setup y ramificación

### 0.1 · Crear rama de trabajo

```bash
cd /c/Users/Darvin\ PC/Documents/PROYECTOS\ TRABAJOS/Bomberos\ SC/bomberos-caracas-bd
git checkout main
git pull origin main
git checkout -b security/sprint-3-hardening
```

### 0.2 · Verificar prerrequisitos

```bash
# 1. PyJWT instalado (Sprint 1 entregable 1.6)
grep -i "pyjwt" apps/api/pyproject.toml

# 2. JWT_SECRET_KEY sin default (Sprint 1 entregable 1.7)
grep -A1 "jwt_secret_key" apps/api/src/bomberos_api/config.py

# 3. mfa_secret cifrado (Sprint 2 entregable 2.10)
grep "pgp_sym_encrypt" sql/*.sql

# 4. Refresh tokens con reuse detection (Sprint 2 entregable 2.1)
grep -r "refresh_tokens" apps/api/src

# 5. CI verde en main
gh run list --branch main --limit 1
```

Si alguno falla, **STOP** — cerrar el sprint correspondiente antes.

### 0.3 · Crear estructura de carpetas

```bash
mkdir -p apps/api/src/bomberos_api/data
mkdir -p apps/api/src/bomberos_api/routers
mkdir -p apps/api/tests/security
mkdir -p apps/api/tests/security/fixtures
mkdir -p apps/web/src/middleware
mkdir -p apps/web/src/hooks
mkdir -p apps/web/src/app/perfil/mfa
mkdir -p sql/migrations/sprint-3
mkdir -p scripts/security
```

---

## BLOQUE 1 · MFA TOTP (entregables 3.1 a 3.7)

### 3.1 · Dependencia `pyotp` + `qrcode`

**Test (falla primero):** `apps/api/tests/security/test_mfa_deps.py`

```python
"""Verifica que las deps MFA están instaladas y son funcionales."""
import importlib


def test_pyotp_disponible():
    pyotp = importlib.import_module("pyotp")
    secret = pyotp.random_base32()
    assert len(secret) >= 16
    totp = pyotp.TOTP(secret)
    code = totp.now()
    assert len(code) == 6
    assert code.isdigit()


def test_qrcode_disponible():
    qrcode = importlib.import_module("qrcode")
    img = qrcode.make("otpauth://totp/test?secret=ABCD")
    # PIL Image
    assert hasattr(img, "save")
```

**Implementación:** editar `apps/api/pyproject.toml`:

```toml
[project]
dependencies = [
    # ... existentes
    "pyotp>=2.9,<3",
    "qrcode[pil]>=7.4,<8",
]
```

```bash
cd apps/api
uv pip install -e . --upgrade
pytest tests/security/test_mfa_deps.py -v
```

**Verificación:** `pytest tests/security/test_mfa_deps.py` pasa.

---

### 3.2 · Endpoint `POST /auth/mfa/enroll`

**Test (falla primero):** `apps/api/tests/security/test_mfa_enroll.py`

```python
"""Enroll: usuario autenticado genera secret nuevo y obtiene QR."""
import base64
import re

import pytest
import pyotp
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_enroll_genera_secret_y_qr(authed_client: AsyncClient, test_user):
    resp = await authed_client.post("/auth/mfa/enroll")
    assert resp.status_code == 200
    body = resp.json()

    # Secret en claro para apuntar manualmente
    assert "secret" in body
    assert re.match(r"^[A-Z2-7]{32}$", body["secret"])  # base32 32 chars

    # QR como PNG base64
    assert "qr_png_base64" in body
    raw = base64.b64decode(body["qr_png_base64"])
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"

    # URI otpauth
    assert "provisioning_uri" in body
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert "issuer=Bomberos%20Caracas" in body["provisioning_uri"]

    # Aún NO está activo hasta verify
    me = await authed_client.get("/auth/me")
    assert me.json()["mfa_activo"] is False


@pytest.mark.asyncio
async def test_enroll_sin_auth_retorna_401(client: AsyncClient):
    resp = await client.post("/auth/mfa/enroll")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_enroll_reemplaza_secret_no_activo(authed_client: AsyncClient):
    """Si llamo enroll 2 veces sin verify, el segundo secret reemplaza al primero."""
    r1 = await authed_client.post("/auth/mfa/enroll")
    r2 = await authed_client.post("/auth/mfa/enroll")
    assert r1.json()["secret"] != r2.json()["secret"]


@pytest.mark.asyncio
async def test_enroll_rechazado_si_ya_activo(authed_client_mfa_activo: AsyncClient):
    """Si MFA ya está activo, debe usar /mfa/reset (ADMIN) primero."""
    resp = await authed_client_mfa_activo.post("/auth/mfa/enroll")
    assert resp.status_code == 409
    assert "ya tiene MFA activo" in resp.json()["detail"].lower()
```

**Implementación:** nuevo archivo `apps/api/src/bomberos_api/routers/mfa.py`:

```python
"""Multi-Factor Authentication TOTP (RFC 6238)."""
import base64
import io
from typing import Annotated

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text

from bomberos_api.core.deps import CurrentUser, DbSession
from bomberos_api.logging import get_logger
from bomberos_api.models.usuario import Usuario
from bomberos_api.routers.auth import _log_acceso, _set_audit_context, _client_ip

router = APIRouter(prefix="/auth/mfa", tags=["auth", "mfa"])
log = get_logger("mfa")

ISSUER = "Bomberos Caracas"
TOTP_DIGITS = 6
TOTP_INTERVAL = 30
TOTP_WINDOW = 1  # ±30 s tolerancia de clock skew


class MfaEnrollResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    secret: str = Field(description="Base32 32 chars — apuntar manual si no escanea QR")
    qr_png_base64: str
    provisioning_uri: str


class MfaVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigo: str = Field(pattern=r"^\d{6}$", description="6 dígitos TOTP")


def _build_provisioning_uri(usuario: str, secret: str) -> str:
    totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)
    return totp.provisioning_uri(name=usuario, issuer_name=ISSUER)


def _build_qr_png_base64(uri: str) -> str:
    qr = qrcode.QRCode(version=None, box_size=6, border=2)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


async def _store_secret_cifrado(db, usuario_id: int, secret_plano: str) -> None:
    """Cifra con pgp_sym_encrypt usando la KMS key del Sprint 2."""
    await db.execute(
        text("""
            UPDATE seguridad.usuarios
               SET mfa_secret = pgp_sym_encrypt(
                       :secret,
                       current_setting('app.kms_key')
                   )
             WHERE id = :uid
        """).bindparams(secret=secret_plano, uid=usuario_id)
    )


async def _load_secret_descifrado(db, usuario_id: int) -> str | None:
    row = await db.execute(
        text("""
            SELECT pgp_sym_decrypt(
                       mfa_secret::bytea,
                       current_setting('app.kms_key')
                   ) AS secret
              FROM seguridad.usuarios
             WHERE id = :uid AND mfa_secret IS NOT NULL
        """).bindparams(uid=usuario_id)
    )
    r = row.first()
    return r.secret if r else None


@router.post("/enroll", response_model=MfaEnrollResponse)
async def enroll(
    request: Request,
    user: CurrentUser,
    db: DbSession,
) -> MfaEnrollResponse:
    """Inicia enrollment MFA. Devuelve secret + QR + URI.

    El secret se persiste cifrado pero `mfa_activo` queda FALSE hasta `verify`.
    """
    if user.mfa_activo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario ya tiene MFA activo. Pide al admin un reset.",
        )

    secret = pyotp.random_base32(length=32)
    uri = _build_provisioning_uri(user.usuario, secret)
    qr_b64 = _build_qr_png_base64(uri)

    ip = _client_ip(request)
    await _set_audit_context(db, user.id, ip)
    await _store_secret_cifrado(db, user.id, secret)
    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=request.headers.get("user-agent"),
        tipo_evento="MFA_ENROLL_INICIADO"
    )

    log.info("mfa_enroll_iniciado", usuario_id=user.id, usuario=user.usuario)

    return MfaEnrollResponse(
        secret=secret,
        qr_png_base64=qr_b64,
        provisioning_uri=uri,
    )
```

**Registrar router en `apps/api/src/bomberos_api/main.py`:**

```python
from bomberos_api.routers import mfa
# ...
app.include_router(mfa.router)
```

**Verificación:**
```bash
pytest apps/api/tests/security/test_mfa_enroll.py -v
```

---

### 3.3 · Endpoint `POST /auth/mfa/verify`

**Test (falla primero):** `apps/api/tests/security/test_mfa_verify.py`

```python
import pytest
import pyotp
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_verify_codigo_valido_activa_mfa(authed_client: AsyncClient):
    enroll = await authed_client.post("/auth/mfa/enroll")
    secret = enroll.json()["secret"]
    codigo = pyotp.TOTP(secret).now()

    resp = await authed_client.post("/auth/mfa/verify", json={"codigo": codigo})
    assert resp.status_code == 204

    me = await authed_client.get("/auth/me")
    assert me.json()["mfa_activo"] is True


@pytest.mark.asyncio
async def test_verify_codigo_invalido_no_activa(authed_client: AsyncClient):
    await authed_client.post("/auth/mfa/enroll")
    resp = await authed_client.post("/auth/mfa/verify", json={"codigo": "000000"})
    assert resp.status_code == 400
    assert "código inválido" in resp.json()["detail"].lower()

    me = await authed_client.get("/auth/me")
    assert me.json()["mfa_activo"] is False


@pytest.mark.asyncio
async def test_verify_sin_enroll_previo_falla(authed_client_sin_secret: AsyncClient):
    resp = await authed_client_sin_secret.post("/auth/mfa/verify", json={"codigo": "123456"})
    assert resp.status_code == 400
    assert "no ha iniciado enrollment" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_genera_codigos_recuperacion(authed_client: AsyncClient):
    enroll = await authed_client.post("/auth/mfa/enroll")
    codigo = pyotp.TOTP(enroll.json()["secret"]).now()

    resp = await authed_client.post("/auth/mfa/verify", json={"codigo": codigo})
    assert resp.status_code == 204

    # Endpoint separado expone los códigos de recuperación una sola vez
    codes = await authed_client.get("/auth/mfa/recovery-codes")
    assert codes.status_code == 200
    body = codes.json()
    assert len(body["codigos"]) == 10
    # Cada código xxxx-xxxx hex
    import re
    for c in body["codigos"]:
        assert re.match(r"^[a-f0-9]{4}-[a-f0-9]{4}$", c)


@pytest.mark.asyncio
async def test_verify_codigo_reusado_dentro_de_ventana_se_acepta_solo_una_vez(authed_client: AsyncClient):
    """Anti-replay: mismo código no debe pasar dos veces aunque caiga en la misma ventana."""
    enroll = await authed_client.post("/auth/mfa/enroll")
    secret = enroll.json()["secret"]
    codigo = pyotp.TOTP(secret).now()

    r1 = await authed_client.post("/auth/mfa/verify", json={"codigo": codigo})
    assert r1.status_code == 204

    # Segundo uso del mismo código debe fallar (ya activado, además sería reset attempt)
    r2 = await authed_client.post("/auth/mfa/verify", json={"codigo": codigo})
    assert r2.status_code in (400, 409)
```

**Implementación:** ampliar `apps/api/src/bomberos_api/routers/mfa.py`:

```python
import secrets

from bomberos_api.core.security import hash_password  # bcrypt directo (Sprint 2)


class MfaRecoveryCodesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    codigos: list[str] = Field(
        description="10 códigos xxxx-xxxx, válidos una sola vez. Guárdalos en lugar seguro."
    )


def _generar_codigo_recuperacion() -> str:
    """Genera xxxx-xxxx en hex (32 bits de entropía por código)."""
    raw = secrets.token_hex(4)  # 8 hex chars
    return f"{raw[:4]}-{raw[4:]}"


async def _persistir_codigos_recuperacion(db, usuario_id: int, codigos: list[str]) -> None:
    """Guarda los hashes de los códigos. El plano solo se devuelve una vez al usuario."""
    for c in codigos:
        await db.execute(
            text("""
                INSERT INTO seguridad.mfa_codigos_recuperacion
                       (usuario_id, codigo_hash, usado_en)
                VALUES (:uid, :h, NULL)
            """).bindparams(uid=usuario_id, h=hash_password(c))
        )


@router.post("/verify", status_code=status.HTTP_204_NO_CONTENT)
async def verify(
    request: Request,
    payload: MfaVerifyRequest,
    user: CurrentUser,
    db: DbSession,
) -> None:
    """Confirma el enrollment: si el código TOTP coincide, activa MFA y genera recovery codes."""
    secret = await _load_secret_descifrado(db, user.id)
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario no ha iniciado enrollment MFA. Llama a /auth/mfa/enroll primero.",
        )

    totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)
    if not totp.verify(payload.codigo, valid_window=TOTP_WINDOW):
        ip = _client_ip(request)
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip,
            user_agent=request.headers.get("user-agent"),
            tipo_evento="MFA_VERIFY_FALLIDO"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código inválido o expirado.",
        )

    if user.mfa_activo:
        # Idempotencia: ya activo, no re-genera recovery codes
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="MFA ya estaba activo.",
        )

    ip = _client_ip(request)
    await _set_audit_context(db, user.id, ip)

    # Activar MFA
    await db.execute(
        text("UPDATE seguridad.usuarios SET mfa_activo = TRUE WHERE id = :uid")
        .bindparams(uid=user.id)
    )

    # Generar 10 códigos de recuperación
    codigos = [_generar_codigo_recuperacion() for _ in range(10)]
    await _persistir_codigos_recuperacion(db, user.id, codigos)

    # Cache temporal en sesión http para devolverlos en /recovery-codes una sola vez
    request.state.mfa_recovery_codes_temp = codigos

    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=request.headers.get("user-agent"),
        tipo_evento="MFA_ACTIVADO"
    )

    log.info("mfa_activado", usuario_id=user.id, usuario=user.usuario)


@router.get("/recovery-codes", response_model=MfaRecoveryCodesResponse)
async def get_recovery_codes(request: Request, user: CurrentUser, db: DbSession) -> MfaRecoveryCodesResponse:
    """Devuelve los códigos de recuperación generados en `verify`. Solo accesible durante la misma sesión http."""
    codigos = getattr(request.state, "mfa_recovery_codes_temp", None)
    if not codigos:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Códigos ya consultados. Pide al admin un reset si los perdiste.",
        )
    # Limpiar después de devolverlos una vez
    request.state.mfa_recovery_codes_temp = None
    return MfaRecoveryCodesResponse(codigos=codigos)
```

**Migración SQL:** `sql/migrations/sprint-3/3.3-mfa-recovery-codes.sql`

```sql
-- Tabla de códigos de recuperación MFA (one-time use)
CREATE TABLE IF NOT EXISTS seguridad.mfa_codigos_recuperacion (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,                  -- bcrypt hash
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    usado_en    TIMESTAMPTZ,                    -- NULL = aún disponible
    usado_ip    INET
);

CREATE INDEX idx_mfa_recovery_usuario_disponibles
    ON seguridad.mfa_codigos_recuperacion (usuario_id)
    WHERE usado_en IS NULL;

ALTER TABLE seguridad.mfa_codigos_recuperacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguridad.mfa_codigos_recuperacion FORCE ROW LEVEL SECURITY;

CREATE POLICY mfa_recovery_propio
    ON seguridad.mfa_codigos_recuperacion
    FOR ALL TO bomberos_app
    USING (usuario_id = current_setting('app.usuario_id')::BIGINT);

REVOKE UPDATE, DELETE, TRUNCATE ON seguridad.mfa_codigos_recuperacion FROM PUBLIC;
GRANT INSERT, SELECT ON seguridad.mfa_codigos_recuperacion TO bomberos_app;
GRANT UPDATE (usado_en, usado_ip) ON seguridad.mfa_codigos_recuperacion TO bomberos_app;
```

---

### 3.4 · Modificar `POST /auth/login` para flujo 2-step

**Test (falla primero):** `apps/api/tests/security/test_mfa_login_flow.py`

```python
import pyotp
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_sin_mfa_devuelve_tokens_inmediatos(client: AsyncClient, usuario_sin_mfa):
    resp = await client.post("/auth/login", data={
        "username": usuario_sin_mfa.usuario,
        "password": "Password#2026"
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body.get("requiere_mfa") is False


@pytest.mark.asyncio
async def test_login_con_mfa_devuelve_token_temporal(client: AsyncClient, usuario_con_mfa):
    resp = await client.post("/auth/login", data={
        "username": usuario_con_mfa.usuario,
        "password": "Password#2026"
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["requiere_mfa"] is True
    assert "mfa_challenge_token" in body
    assert "access_token" not in body
    assert "refresh_token" not in body


@pytest.mark.asyncio
async def test_login_paso2_codigo_valido_emite_tokens(client: AsyncClient, usuario_con_mfa, mfa_secret):
    r1 = await client.post("/auth/login", data={
        "username": usuario_con_mfa.usuario,
        "password": "Password#2026"
    })
    challenge = r1.json()["mfa_challenge_token"]
    codigo = pyotp.TOTP(mfa_secret).now()

    r2 = await client.post("/auth/login/mfa", json={
        "mfa_challenge_token": challenge,
        "codigo": codigo
    })
    assert r2.status_code == 200
    assert "access_token" in r2.json()
    assert "refresh_token" in r2.json()


@pytest.mark.asyncio
async def test_login_paso2_codigo_invalido_falla(client: AsyncClient, usuario_con_mfa):
    r1 = await client.post("/auth/login", data={
        "username": usuario_con_mfa.usuario,
        "password": "Password#2026"
    })
    challenge = r1.json()["mfa_challenge_token"]

    r2 = await client.post("/auth/login/mfa", json={
        "mfa_challenge_token": challenge,
        "codigo": "000000"
    })
    assert r2.status_code == 401


@pytest.mark.asyncio
async def test_challenge_token_expira_en_5_min(client: AsyncClient, usuario_con_mfa, mfa_secret, freezer):
    r1 = await client.post("/auth/login", data={
        "username": usuario_con_mfa.usuario, "password": "Password#2026"
    })
    challenge = r1.json()["mfa_challenge_token"]

    freezer.tick(delta=301)  # 5 min + 1 s

    codigo = pyotp.TOTP(mfa_secret).now()
    r2 = await client.post("/auth/login/mfa", json={
        "mfa_challenge_token": challenge, "codigo": codigo
    })
    assert r2.status_code == 401
    assert "expirado" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_codigo_recuperacion_funciona_y_se_invalida(client: AsyncClient, usuario_con_mfa, recovery_codes):
    r1 = await client.post("/auth/login", data={
        "username": usuario_con_mfa.usuario, "password": "Password#2026"
    })
    challenge = r1.json()["mfa_challenge_token"]

    codigo_rec = recovery_codes[0]
    r2 = await client.post("/auth/login/mfa", json={
        "mfa_challenge_token": challenge, "codigo_recuperacion": codigo_rec
    })
    assert r2.status_code == 200

    # El mismo código no debe volver a funcionar
    r1b = await client.post("/auth/login", data={
        "username": usuario_con_mfa.usuario, "password": "Password#2026"
    })
    challenge_b = r1b.json()["mfa_challenge_token"]
    r2b = await client.post("/auth/login/mfa", json={
        "mfa_challenge_token": challenge_b, "codigo_recuperacion": codigo_rec
    })
    assert r2b.status_code == 401
```

**Implementación:** modificar `apps/api/src/bomberos_api/routers/auth.py`:

```python
# (imports nuevos)
import pyotp
from bomberos_api.core.security import (
    create_token,
    decode_token,
    hash_password,
    verify_password,
)
from bomberos_api.routers.mfa import _load_secret_descifrado, TOTP_DIGITS, TOTP_INTERVAL, TOTP_WINDOW


# ===== NUEVO SCHEMA =====
class TokenResponseMaybe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requiere_mfa: bool
    # Si requiere_mfa=False
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    token_type: str = "bearer"
    # Si requiere_mfa=True
    mfa_challenge_token: str | None = None


class MfaLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mfa_challenge_token: str
    codigo: str | None = Field(default=None, pattern=r"^\d{6}$")
    codigo_recuperacion: str | None = Field(default=None, pattern=r"^[a-f0-9]{4}-[a-f0-9]{4}$")


# ===== MODIFICAR @router.post("/login") =====
@router.post("/login", response_model=TokenResponseMaybe)
async def login(
    request: Request,
    db: DbSession,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> TokenResponseMaybe:
    s = get_settings()
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")

    user = await db.scalar(select(Usuario).where(Usuario.usuario == form.username))

    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas"
    )

    # === Bloque idéntico al actual: validaciones de usuario inexistente, inactivo, bloqueado ===
    # ... (mantener el código de Sprint 1 con lockout exponencial y timing-safe)

    if not verify_password(form.password, user.password_hash):
        # ... (lógica existente de intentos fallidos + lockout)
        raise invalid_exc

    # === Login exitoso paso 1 ===
    user.intentos_fallidos = 0

    await _set_audit_context(db, user.id, ip)

    # Si el usuario NO tiene MFA: emitir tokens directos
    if not user.mfa_activo:
        user.ultimo_acceso = datetime.now(UTC)
        user.ultimo_ip = ip
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip,
            user_agent=ua, tipo_evento="LOGIN"
        )

        roles = await _cargar_roles(db, user.id)
        access = create_token(user.id, "access", {"roles": list(roles)})
        refresh = create_token(user.id, "refresh")

        return TokenResponseMaybe(
            requiere_mfa=False,
            access_token=access,
            refresh_token=refresh,
            expires_in=s.jwt_access_token_expire_minutes * 60,
        )

    # Si el usuario TIENE MFA: emitir token temporal "challenge" de 5 min
    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=ua, tipo_evento="LOGIN_PASO1_OK"
    )

    challenge = create_token(
        user.id,
        "mfa_challenge",
        extra_claims={"step": "mfa_pending"},
        override_expires_minutes=5,
    )
    return TokenResponseMaybe(
        requiere_mfa=True,
        mfa_challenge_token=challenge,
    )


@router.post("/login/mfa", response_model=TokenResponseMaybe)
async def login_mfa(
    request: Request,
    payload: MfaLoginRequest,
    db: DbSession,
) -> TokenResponseMaybe:
    s = get_settings()
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")

    # Validar challenge
    try:
        decoded = decode_token(payload.mfa_challenge_token, expected_type="mfa_challenge")
    except ValueError as e:
        log.warning("mfa_challenge_invalido", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de challenge inválido o expirado.",
        )

    user_id = int(decoded["sub"])
    user = await db.scalar(select(Usuario).where(Usuario.id == user_id))
    if not user or not user.activo or user.bloqueado:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta no disponible")
    if not user.mfa_activo:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario sin MFA")

    # Validar código: TOTP o recovery code
    valido = False
    if payload.codigo:
        secret = await _load_secret_descifrado(db, user.id)
        if secret:
            totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_INTERVAL)
            valido = totp.verify(payload.codigo, valid_window=TOTP_WINDOW)
    elif payload.codigo_recuperacion:
        valido = await _consumir_codigo_recuperacion(db, user.id, payload.codigo_recuperacion, ip)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe proveer `codigo` (TOTP 6 dígitos) o `codigo_recuperacion`."
        )

    if not valido:
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip,
            user_agent=ua, tipo_evento="MFA_FALLIDO"
        )
        # Lockout también escala con fallos MFA
        user.intentos_fallidos = (user.intentos_fallidos or 0) + 1
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Código MFA inválido"
        )

    # Éxito
    user.intentos_fallidos = 0
    user.ultimo_acceso = datetime.now(UTC)
    user.ultimo_ip = ip
    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=ua, tipo_evento="LOGIN_MFA_OK"
    )

    roles = await _cargar_roles(db, user.id)
    access = create_token(user.id, "access", {"roles": list(roles)})
    refresh = create_token(user.id, "refresh")

    return TokenResponseMaybe(
        requiere_mfa=False,
        access_token=access,
        refresh_token=refresh,
        expires_in=s.jwt_access_token_expire_minutes * 60,
    )


async def _consumir_codigo_recuperacion(db, usuario_id: int, codigo: str, ip: str | None) -> bool:
    """Busca un código activo por hash. Si encuentra, lo marca usado en transacción atómica."""
    rows = await db.execute(
        text("""
            SELECT id, codigo_hash
              FROM seguridad.mfa_codigos_recuperacion
             WHERE usuario_id = :uid AND usado_en IS NULL
        """).bindparams(uid=usuario_id)
    )
    for r in rows.mappings():
        if verify_password(codigo, r["codigo_hash"]):
            await db.execute(
                text("""
                    UPDATE seguridad.mfa_codigos_recuperacion
                       SET usado_en = now(), usado_ip = CAST(:ip AS inet)
                     WHERE id = :rid AND usado_en IS NULL
                """).bindparams(rid=r["id"], ip=ip)
            )
            return True
    return False


async def _cargar_roles(db, usuario_id: int) -> list[str]:
    result = await db.execute(
        select(Rol.codigo)
        .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .where(UsuarioRol.usuario_id == usuario_id)
    )
    return list(result.scalars().all())
```

**Modificar `core/security.py` para soportar `mfa_challenge` y `override_expires_minutes`:**

```python
TokenType = Literal["access", "refresh", "mfa_challenge"]


def create_token(
    subject: str | int,
    token_type: TokenType = "access",
    extra_claims: dict[str, Any] | None = None,
    override_expires_minutes: int | None = None,
) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    if override_expires_minutes is not None:
        expires = now + timedelta(minutes=override_expires_minutes)
    elif token_type == "access":
        expires = now + timedelta(minutes=s.jwt_access_token_expire_minutes)
    elif token_type == "refresh":
        expires = now + timedelta(days=s.jwt_refresh_token_expire_days)
    else:
        expires = now + timedelta(minutes=5)  # mfa_challenge default
    # ... resto idéntico
```

---

### 3.5 · MFA obligatorio para ADMIN/RRHH/MEDICO/SUPER_ADMIN

**Test (falla primero):** `apps/api/tests/security/test_mfa_obligatorio.py`

```python
import pytest


ROLES_QUE_OBLIGAN_MFA = ["ADMIN", "RRHH", "MEDICO", "SUPER_ADMIN"]


@pytest.mark.asyncio
@pytest.mark.parametrize("rol", ROLES_QUE_OBLIGAN_MFA)
async def test_usuario_con_rol_sensible_sin_mfa_no_puede_operar(client, rol, db):
    """Usuario con rol sensible sin MFA activo: cualquier endpoint sensible devuelve 403."""
    user = await _crear_usuario(db, rol=rol, mfa_activo=False)
    token = await _login(client, user)
    resp = await client.get("/funcionarios", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "mfa_requerido" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_usuario_con_rol_sensible_y_mfa_puede_operar(client, db):
    user = await _crear_usuario(db, rol="ADMIN", mfa_activo=True)
    token = await _login_con_mfa(client, user)
    resp = await client.get("/funcionarios", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_usuario_con_rol_no_sensible_sin_mfa_puede_operar(client, db):
    user = await _crear_usuario(db, rol="OPERATIVO", mfa_activo=False)
    token = await _login(client, user)
    resp = await client.get("/funcionarios", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_endpoint_enroll_funciona_aun_sin_mfa_para_rol_sensible(client, db):
    """Sin esto el ADMIN nuevo nunca podría activar MFA: hay que dejar pasar /auth/mfa/*."""
    user = await _crear_usuario(db, rol="ADMIN", mfa_activo=False)
    token = await _login(client, user)
    resp = await client.post("/auth/mfa/enroll", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
```

**Implementación:** ampliar `apps/api/src/bomberos_api/core/deps.py`:

```python
ROLES_MFA_OBLIGATORIO = {"ADMIN", "RRHH", "MEDICO", "SUPER_ADMIN"}

# Endpoints exentos del check de MFA-obligatorio: el usuario tiene que poder activar MFA
ENDPOINTS_EXENTOS_MFA_OBLIGATORIO = {
    "/auth/me",
    "/auth/logout",
    "/auth/mfa/enroll",
    "/auth/mfa/verify",
    "/auth/mfa/recovery-codes",
    "/auth/change-password",
}


async def _user_roles(db, user_id: int) -> set[str]:
    from bomberos_api.models.usuario import Rol, UsuarioRol
    result = await db.execute(
        select(Rol.codigo).join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
        .where(UsuarioRol.usuario_id == user_id)
    )
    return {r for r in result.scalars().all()}


async def get_current_user(
    request: Request,
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> Usuario:
    # ... (validación de JWT existente)

    # MFA obligatorio para roles sensibles
    if request.url.path not in ENDPOINTS_EXENTOS_MFA_OBLIGATORIO:
        roles = await _user_roles(db, user.id)
        if roles & ROLES_MFA_OBLIGATORIO and not user.mfa_activo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="mfa_requerido: este rol exige MFA activo. Visita /perfil/mfa para activarlo.",
            )

    return user
```

---

### 3.6 · Frontend: páginas `/perfil/mfa` con QR + verify + recovery

**Archivo nuevo:** `apps/web/src/app/(app)/perfil/mfa/page.tsx`

```tsx
import { requireAuth } from "@/lib/session";
import { api } from "@/lib/api";
import MfaEnrollClient from "./MfaEnrollClient";

interface Me {
  id: number;
  mfa_activo: boolean;
  roles: string[];
}

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const token = await requireAuth();
  const me = await api.get<Me>("/auth/me", token);

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-semibold mb-2">Autenticación en dos pasos (MFA)</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Protege tu cuenta con un código de un solo uso generado por Google Authenticator,
        Authy o cualquier app TOTP compatible.
      </p>

      {me.mfa_activo ? (
        <div className="border border-emerald-700/40 bg-emerald-900/20 rounded p-4">
          <div className="font-medium text-emerald-200">MFA activo en esta cuenta.</div>
          <p className="text-sm text-emerald-100/80 mt-1">
            Para regenerar, pide a un administrador un reset.
          </p>
        </div>
      ) : (
        <MfaEnrollClient />
      )}
    </div>
  );
}
```

**Componente cliente:** `apps/web/src/app/(app)/perfil/mfa/MfaEnrollClient.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EnrollResponse {
  secret: string;
  qr_png_base64: string;
  provisioning_uri: string;
}

interface RecoveryResponse {
  codigos: string[];
}

export default function MfaEnrollClient() {
  const router = useRouter();
  const [enroll, setEnroll] = useState<EnrollResponse | null>(null);
  const [codigo, setCodigo] = useState("");
  const [recovery, setRecovery] = useState<RecoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const iniciarEnroll = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/proxy/auth/mfa/enroll", { method: "POST" });
      if (!r.ok) throw new Error("No se pudo iniciar enrollment");
      const data = (await r.json()) as EnrollResponse;
      setEnroll(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verificar = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/proxy/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { detail?: string };
        throw new Error(body.detail ?? "Código inválido");
      }
      const codes = await fetch("/api/proxy/auth/mfa/recovery-codes");
      setRecovery((await codes.json()) as RecoveryResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (recovery) {
    return (
      <div className="space-y-4">
        <Alert variant="warning">
          <AlertDescription>
            Guarda estos 10 códigos en un lugar seguro. Son tu única forma de recuperar la
            cuenta si pierdes el dispositivo. NO se mostrarán de nuevo.
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted p-4 rounded">
          {recovery.codigos.map((c) => (
            <div key={c} className="select-all">{c}</div>
          ))}
        </div>
        <Button onClick={() => router.push("/dashboard")}>Listo, ir al dashboard</Button>
      </div>
    );
  }

  if (!enroll) {
    return (
      <div>
        <Button onClick={iniciarEnroll} disabled={loading}>
          {loading ? "Generando..." : "Activar MFA"}
        </Button>
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-medium mb-2">1. Escanea el código QR</h2>
        <img
          src={`data:image/png;base64,${enroll.qr_png_base64}`}
          alt="Código QR para MFA"
          className="border border-border rounded"
          width={240}
          height={240}
        />
      </div>
      <div>
        <h2 className="font-medium mb-2">2. O ingresa este secret manualmente</h2>
        <code className="font-mono text-xs bg-muted px-2 py-1 rounded select-all break-all">
          {enroll.secret}
        </code>
      </div>
      <div>
        <h2 className="font-medium mb-2">3. Ingresa el código de 6 dígitos que muestra tu app</h2>
        <div className="flex gap-2">
          <Input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="font-mono text-lg max-w-[160px]"
          />
          <Button onClick={verificar} disabled={loading || codigo.length !== 6}>
            {loading ? "Verificando..." : "Confirmar"}
          </Button>
        </div>
        {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
      </div>
    </div>
  );
}
```

**Proxy route handler:** `apps/web/src/app/api/proxy/auth/mfa/[...path]/route.ts`
Reenvía la cookie `bcd_access` al backend con headers correctos. (Patrón existente de Sprint 1 si ya está implementado, si no copiar de `/api/proxy/auth/me/route.ts`.)

---

### 3.7 · Tests E2E del flujo MFA completo

**Archivo:** `apps/web/e2e/mfa-flow.spec.ts` (Playwright)

```ts
import { test, expect } from "@playwright/test";
import { authenticator } from "otplib";

test.describe("MFA flow end-to-end", () => {
  test("usuario ADMIN sin MFA es forzado a enrollment", async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name=usuario]", "admin");
    await page.fill("input[name=password]", "Admin#2026*");
    await page.click("button[type=submit]");

    // Backend devuelve 403 mfa_requerido al primer endpoint sensible
    await expect(page).toHaveURL(/\/perfil\/mfa$/);
    await expect(page.locator("h1")).toContainText("Autenticación en dos pasos");
  });

  test("flujo completo: enroll → verify → recovery codes → logout → login MFA", async ({ page }) => {
    await page.goto("/perfil/mfa");
    await page.click("text=Activar MFA");

    await expect(page.locator("img[alt='Código QR para MFA']")).toBeVisible();
    const secret = await page.locator("code").innerText();

    const code = authenticator.generate(secret);
    await page.fill("input[inputMode=numeric]", code);
    await page.click("text=Confirmar");

    // Recovery codes visibles una vez
    await expect(page.locator("text=Guarda estos 10 códigos")).toBeVisible();
    const codes = await page.locator(".font-mono.text-sm.bg-muted div").allInnerTexts();
    expect(codes).toHaveLength(10);

    await page.click("text=Listo, ir al dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    // Logout
    await page.click("text=Cerrar sesión");
    await expect(page).toHaveURL(/\/login$/);

    // Login paso 1 + paso 2
    await page.fill("input[name=usuario]", "admin");
    await page.fill("input[name=password]", "Admin#2026*");
    await page.click("button[type=submit]");

    await expect(page).toHaveURL(/\/login\/mfa$/);
    const newCode = authenticator.generate(secret);
    await page.fill("input[name=codigo]", newCode);
    await page.click("button[type=submit]");

    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
```

**Verificación:**
```bash
cd apps/web && npx playwright test mfa-flow.spec.ts
```

---

## BLOQUE 2 · JWT RS256 (entregables 3.8 a 3.12)

### 3.8 · Generar keypair RSA 4096

**Script:** `scripts/security/generate-jwt-keys.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-/etc/bomberos/jwt}"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

KID="$(date -u +%Y%m%d)-$(openssl rand -hex 4)"
PRIV="$OUT_DIR/jwt-private-${KID}.pem"
PUB="$OUT_DIR/jwt-public-${KID}.pem"

# 1. Generar llave privada RSA 4096
openssl genpkey \
    -algorithm RSA \
    -out "$PRIV" \
    -pkeyopt rsa_keygen_bits:4096 \
    -pkeyopt rsa_keygen_pubexp:65537

# 2. Derivar pública
openssl rsa -in "$PRIV" -pubout -out "$PUB"

# 3. Perms estrictos
chmod 600 "$PRIV"
chmod 644 "$PUB"

# 4. Verificar
openssl rsa -in "$PRIV" -check -noout
openssl rsa -in "$PUB" -pubin -text -noout > /dev/null

# 5. Fingerprint para auditoría
FP=$(openssl pkey -in "$PUB" -pubin -outform DER 2>/dev/null | openssl dgst -sha256 -hex | awk '{print $2}')

echo "============================================"
echo "Key ID (kid): $KID"
echo "Private: $PRIV"
echo "Public:  $PUB"
echo "SHA256 (pub DER): $FP"
echo "============================================"
echo ""
echo "Configurar en api.env:"
echo "  JWT_ALGORITHM=RS256"
echo "  JWT_KID=$KID"
echo "  JWT_PRIVATE_KEY_PATH=$PRIV"
echo "  JWT_PUBLIC_KEY_PATH=$PUB"
```

**Generar para desarrollo:**

```bash
chmod +x scripts/security/generate-jwt-keys.sh
mkdir -p ./secrets/jwt
./scripts/security/generate-jwt-keys.sh ./secrets/jwt
```

**.gitignore:** asegurar que `./secrets/` ya esté excluido.

---

### 3.9 · Refactor `core/security.py` a RS256

**Test (falla primero):** `apps/api/tests/security/test_jwt_rs256.py`

```python
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pathlib import Path

from bomberos_api.core.security import create_token, decode_token


@pytest.fixture(scope="module")
def jwt_keys(tmp_path_factory, monkeypatch_session):
    """Genera un par RSA 4096 temporal y configura las settings para usarlo."""
    tmp = tmp_path_factory.mktemp("jwt-keys")
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)  # 2048 en tests para velocidad
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = priv.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    (tmp / "priv.pem").write_bytes(priv_pem)
    (tmp / "pub.pem").write_bytes(pub_pem)

    monkeypatch_session.setenv("JWT_ALGORITHM", "RS256")
    monkeypatch_session.setenv("JWT_PRIVATE_KEY_PATH", str(tmp / "priv.pem"))
    monkeypatch_session.setenv("JWT_PUBLIC_KEY_PATH", str(tmp / "pub.pem"))
    monkeypatch_session.setenv("JWT_KID", "test-key-1")
    monkeypatch_session.setenv("JWT_ISSUER", "bomberos-caracas-test")
    monkeypatch_session.setenv("JWT_AUDIENCE", "bomberos-api-test")

    from bomberos_api.config import get_settings
    get_settings.cache_clear()
    yield tmp
    get_settings.cache_clear()


def test_create_y_decode_roundtrip_rs256(jwt_keys):
    token = create_token(42, "access", {"roles": ["ADMIN"]})
    decoded = decode_token(token, expected_type="access")
    assert decoded["sub"] == "42"
    assert decoded["roles"] == ["ADMIN"]


def test_token_tiene_iss_aud_jti_kid(jwt_keys):
    import jwt as pyjwt
    token = create_token(42, "access")
    header = pyjwt.get_unverified_header(token)
    payload = pyjwt.decode(token, options={"verify_signature": False})

    assert header["alg"] == "RS256"
    assert header["kid"] == "test-key-1"
    assert payload["iss"] == "bomberos-caracas-test"
    assert payload["aud"] == "bomberos-api-test"
    assert "jti" in payload
    assert len(payload["jti"]) >= 16


def test_token_firmado_con_otra_llave_es_rechazado(jwt_keys, tmp_path):
    """Algorithm confusion / key substitution attack."""
    # Generar OTRA llave
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    (tmp_path / "other.pem").write_bytes(other_pem)

    # Firmar manualmente con la otra llave
    import jwt as pyjwt
    forjado = pyjwt.encode(
        {"sub": "42", "type": "access", "iss": "bomberos-caracas-test",
         "aud": "bomberos-api-test", "exp": 9999999999, "jti": "fake"},
        other_pem, algorithm="RS256",
    )

    with pytest.raises(ValueError):
        decode_token(forjado, expected_type="access")


def test_token_hs256_es_rechazado_en_modo_rs256(jwt_keys):
    """Defensa contra algorithm confusion."""
    import jwt as pyjwt
    hs_token = pyjwt.encode(
        {"sub": "42", "type": "access", "iss": "bomberos-caracas-test",
         "aud": "bomberos-api-test", "exp": 9999999999, "jti": "fake"},
        "una-llave-simétrica-cualquiera", algorithm="HS256",
    )
    with pytest.raises(ValueError):
        decode_token(hs_token, expected_type="access")


def test_iss_incorrecto_rechazado(jwt_keys):
    import jwt as pyjwt
    from pathlib import Path
    priv = (jwt_keys / "priv.pem").read_bytes()
    bad = pyjwt.encode(
        {"sub": "42", "type": "access", "iss": "OTRO", "aud": "bomberos-api-test",
         "exp": 9999999999, "jti": "x"},
        priv, algorithm="RS256",
    )
    with pytest.raises(ValueError):
        decode_token(bad, expected_type="access")


def test_aud_incorrecto_rechazado(jwt_keys):
    import jwt as pyjwt
    priv = (jwt_keys / "priv.pem").read_bytes()
    bad = pyjwt.encode(
        {"sub": "42", "type": "access", "iss": "bomberos-caracas-test", "aud": "OTRA-API",
         "exp": 9999999999, "jti": "x"},
        priv, algorithm="RS256",
    )
    with pytest.raises(ValueError):
        decode_token(bad, expected_type="access")
```

**Implementación:** reescribir `apps/api/src/bomberos_api/core/security.py`:

```python
"""JWT con RS256 (asimétrico). Soporte de `kid` para key rotation."""
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

import bcrypt
import jwt as pyjwt
from jwt import InvalidTokenError

from bomberos_api.config import get_settings

TokenType = Literal["access", "refresh", "mfa_challenge"]


# ============ Password ============

def hash_password(plain: str) -> str:
    """bcrypt directo (Sprint 2 — sin passlib)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ============ Key loading ============

@lru_cache(maxsize=4)
def _load_pem(path: str) -> bytes:
    p = Path(path)
    if not p.exists():
        raise RuntimeError(f"JWT key file no encontrado: {path}")
    data = p.read_bytes()
    if not data:
        raise RuntimeError(f"JWT key file vacío: {path}")
    return data


def _private_key() -> bytes:
    s = get_settings()
    if not s.jwt_private_key_path:
        raise RuntimeError("JWT_PRIVATE_KEY_PATH no configurado (RS256 requiere ruta a llave privada)")
    return _load_pem(s.jwt_private_key_path)


def _public_key() -> bytes:
    s = get_settings()
    if not s.jwt_public_key_path:
        raise RuntimeError("JWT_PUBLIC_KEY_PATH no configurado")
    return _load_pem(s.jwt_public_key_path)


# ============ Token create / decode ============

def create_token(
    subject: str | int,
    token_type: TokenType = "access",
    extra_claims: dict[str, Any] | None = None,
    override_expires_minutes: int | None = None,
) -> str:
    s = get_settings()
    now = datetime.now(UTC)

    if override_expires_minutes is not None:
        expires = now + timedelta(minutes=override_expires_minutes)
    elif token_type == "access":
        expires = now + timedelta(minutes=s.jwt_access_token_expire_minutes)
    elif token_type == "refresh":
        expires = now + timedelta(days=s.jwt_refresh_token_expire_days)
    else:  # mfa_challenge
        expires = now + timedelta(minutes=5)

    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "nbf": int(now.timestamp()),
        "iss": s.jwt_issuer,
        "aud": s.jwt_audience,
        "jti": uuid4().hex,
        "type": token_type,
    }
    if extra_claims:
        payload.update(extra_claims)

    headers = {"kid": s.jwt_kid}

    if s.jwt_algorithm == "RS256":
        return pyjwt.encode(payload, _private_key(), algorithm="RS256", headers=headers)
    elif s.jwt_algorithm == "HS256":
        return pyjwt.encode(payload, s.jwt_secret_key, algorithm="HS256", headers=headers)
    else:
        raise RuntimeError(f"Algoritmo JWT no soportado: {s.jwt_algorithm}")


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    s = get_settings()

    if s.jwt_algorithm == "RS256":
        key = _public_key()
        algorithms = ["RS256"]
    else:
        key = s.jwt_secret_key
        algorithms = ["HS256"]

    try:
        payload = pyjwt.decode(
            token,
            key,
            algorithms=algorithms,
            issuer=s.jwt_issuer,
            audience=s.jwt_audience,
            options={
                "require": ["exp", "iat", "nbf", "iss", "aud", "jti", "sub", "type"],
                "verify_exp": True,
                "verify_iat": True,
                "verify_nbf": True,
                "verify_iss": True,
                "verify_aud": True,
                "verify_signature": True,
            },
        )
    except InvalidTokenError as e:
        raise ValueError(f"token inválido: {e}") from e

    if expected_type and payload.get("type") != expected_type:
        raise ValueError(f"se esperaba token tipo '{expected_type}', recibido '{payload.get('type')}'")

    return payload
```

---

### 3.10 · Extender `Settings` con campos JWT RS256

**Editar `apps/api/src/bomberos_api/config.py`:**

```python
# Añadir a class Settings:

    jwt_algorithm: Literal["HS256", "RS256"] = "RS256"
    jwt_secret_key: str = Field(default="", min_length=0)  # solo si HS256 (Sprint 1 dejó como required; ahora opcional pero validado abajo)
    jwt_private_key_path: str = Field(default="")
    jwt_public_key_path: str = Field(default="")
    jwt_kid: str = Field(default="", min_length=4, max_length=64)
    jwt_issuer: str = Field(default="bomberos-caracas")
    jwt_audience: str = Field(default="bomberos-api")

    @model_validator(mode="after")
    def validate_jwt_config(self) -> "Settings":
        if self.jwt_algorithm == "RS256":
            if not self.jwt_private_key_path or not self.jwt_public_key_path:
                raise ValueError(
                    "RS256 requiere JWT_PRIVATE_KEY_PATH y JWT_PUBLIC_KEY_PATH."
                )
            if not self.jwt_kid:
                raise ValueError("RS256 requiere JWT_KID (key ID para rotación).")
        elif self.jwt_algorithm == "HS256":
            if not self.jwt_secret_key or len(self.jwt_secret_key) < 64:
                raise ValueError(
                    "HS256 requiere JWT_SECRET_KEY >= 64 chars (Sprint 1 ya forzaba esto)."
                )
        return self
```

---

### 3.11 · Soporte `kid` para key rotation

**Test (falla primero):** `apps/api/tests/security/test_jwt_kid_rotation.py`

```python
def test_token_incluye_kid_en_header(jwt_keys):
    import jwt as pyjwt
    token = create_token(1, "access")
    header = pyjwt.get_unverified_header(token)
    assert header["kid"] == "test-key-1"


def test_decode_acepta_solo_kid_actual_o_anteriores_en_grace(jwt_keys, monkeypatch):
    """Implementación futura: durante rotation, decode acepta `kid` viejo si está en una tabla `seguridad.jwt_keys_activas`."""
    # Por ahora: si el kid del token no coincide con el actual, se rechaza
    import jwt as pyjwt
    from pathlib import Path
    priv = (jwt_keys / "priv.pem").read_bytes()

    # Token firmado con kid distinto
    payload = {"sub": "1", "type": "access", "iss": "bomberos-caracas-test",
               "aud": "bomberos-api-test", "exp": 9999999999, "iat": 1, "nbf": 1,
               "jti": "x"}
    weird_token = pyjwt.encode(payload, priv, algorithm="RS256", headers={"kid": "key-vieja"})

    # Sin tabla de keys activas, simplemente decodifica con la pública actual: pasa porque la misma llave firmó
    # Lo importante: el kid se logue para forense
    decoded = decode_token(weird_token, expected_type="access")
    assert decoded["sub"] == "1"
```

**Implementación:** ya cubierta por `headers={"kid": s.jwt_kid}` en `create_token`. Para rotation futura, añadir tabla:

**Migración SQL:** `sql/migrations/sprint-3/3.11-jwt-keys-activas.sql`

```sql
CREATE TABLE IF NOT EXISTS seguridad.jwt_keys_activas (
    kid              TEXT PRIMARY KEY,
    public_key_pem   TEXT NOT NULL,
    algoritmo        TEXT NOT NULL CHECK (algoritmo IN ('RS256', 'ES256', 'EdDSA')),
    activa_desde     TIMESTAMPTZ NOT NULL DEFAULT now(),
    activa_hasta     TIMESTAMPTZ,
    es_actual        BOOLEAN NOT NULL DEFAULT FALSE,
    notas            TEXT
);

CREATE UNIQUE INDEX idx_jwt_keys_actual
    ON seguridad.jwt_keys_activas (es_actual)
    WHERE es_actual = TRUE;

COMMENT ON TABLE seguridad.jwt_keys_activas IS
    'Llaves públicas activas para verificación de JWT. Permite key rotation con grace period.';
```

**Job de rotación:** documentar en `docs/RUNBOOK_KEY_ROTATION.md`:

```markdown
# Runbook — Rotación de llaves JWT

## Frecuencia: anual o ante sospecha de compromiso.

## Procedimiento

1. Generar nuevo par: `./scripts/security/generate-jwt-keys.sh /etc/bomberos/jwt`
2. Insertar la nueva pública en BD:
   ```sql
   INSERT INTO seguridad.jwt_keys_activas (kid, public_key_pem, algoritmo, es_actual)
   VALUES ('20271215-a1b2c3d4', '...PEM...', 'RS256', FALSE);
   ```
3. Marcar grace period (15 días) en la vieja, activar la nueva atómicamente:
   ```sql
   BEGIN;
   UPDATE seguridad.jwt_keys_activas
      SET es_actual = FALSE,
          activa_hasta = now() + interval '15 days'
    WHERE es_actual = TRUE;
   UPDATE seguridad.jwt_keys_activas
      SET es_actual = TRUE,
          activa_desde = now()
    WHERE kid = '20271215-a1b2c3d4';
   COMMIT;
   ```
4. Actualizar `JWT_KID` y `JWT_PRIVATE_KEY_PATH` en `api.env`.
5. `docker compose restart api`.
6. Tras 15 días: `DELETE FROM seguridad.jwt_keys_activas WHERE activa_hasta < now()`.
```

---

### 3.12 · Migration plan para forzar logout global

Al activar RS256 los HS256 viejos no validan firma → todos los usuarios deben re-login. Esto es **deseable** (cierra sesiones potencialmente comprometidas).

**Procedimiento documentado:** `docs/CUTOVER_JWT_RS256.md`

```markdown
# Cutover JWT HS256 → RS256

## Pre-cutover

1. Generar par de llaves: `./scripts/security/generate-jwt-keys.sh ./secrets/jwt`
2. Verificar tests de RS256 en CI verde.
3. Anunciar a usuarios: "El día X hora Y todos deberán volver a iniciar sesión."

## Cutover (downtime ~2 min)

1. `docker compose stop api`
2. Editar `secrets/api.env`:
   - Comentar `JWT_SECRET_KEY=...` (queda como fallback HS256 si se decide rollback)
   - Añadir:
     ```
     JWT_ALGORITHM=RS256
     JWT_KID=20260519-aabbccdd
     JWT_PRIVATE_KEY_PATH=/etc/bomberos/jwt/jwt-private-20260519-aabbccdd.pem
     JWT_PUBLIC_KEY_PATH=/etc/bomberos/jwt/jwt-public-20260519-aabbccdd.pem
     JWT_ISSUER=bomberos-caracas
     JWT_AUDIENCE=bomberos-api
     ```
3. Montar las llaves como volumen en docker-compose.yml:
   ```yaml
   services:
     api:
       volumes:
         - ./secrets/jwt:/etc/bomberos/jwt:ro
   ```
4. `docker compose up -d api`
5. Verificar logs: `docker compose logs api --tail 50`
6. Smoke test:
   ```bash
   curl -X POST https://bomberos.dc.local/auth/login \
        -d "username=admin&password=Admin#2026*"
   # Debe devolver tokens
   ```

## Post-cutover

1. Confirmar que los tokens viejos (HS256) son rechazados con 401: prueba con un token capturado pre-cutover.
2. Monitorear `aud.log_accesos` por 24 h para login_fallido inesperados.

## Rollback (si falla)

1. `docker compose stop api`
2. En `api.env`: cambiar `JWT_ALGORITHM=HS256`, descomentar `JWT_SECRET_KEY`.
3. `docker compose up -d api`.
4. Las sesiones nuevas vuelven a HS256. Los tokens emitidos durante el experimento RS256 quedan inválidos (aceptable).
```

---

## BLOQUE 3 · Logout real / Denylist (entregables 3.13 a 3.16)

### 3.13 · Tabla `seguridad.tokens_revocados`

**Migración SQL:** `sql/migrations/sprint-3/3.13-tokens-revocados.sql`

```sql
CREATE TABLE IF NOT EXISTS seguridad.tokens_revocados (
    jti          TEXT PRIMARY KEY,
    usuario_id   BIGINT REFERENCES seguridad.usuarios(id) ON DELETE SET NULL,
    revocado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en    TIMESTAMPTZ NOT NULL,
    motivo       TEXT,
    ip           INET
);

CREATE INDEX idx_tokens_revocados_expira
    ON seguridad.tokens_revocados (expira_en);

COMMENT ON TABLE seguridad.tokens_revocados IS
    'Denylist de JWT por `jti`. Limpieza diaria de entradas expiradas. '
    'No necesita RLS — la consulta es siempre por jti, no expone otros usuarios.';

GRANT SELECT, INSERT ON seguridad.tokens_revocados TO bomberos_app;
GRANT DELETE ON seguridad.tokens_revocados TO bomberos_app;  -- para limpieza
REVOKE UPDATE ON seguridad.tokens_revocados FROM PUBLIC;
```

**Test:** `apps/api/tests/security/test_denylist_schema.py`

```python
import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_tabla_tokens_revocados_existe(db):
    r = await db.execute(text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema='seguridad' AND table_name='tokens_revocados'"
    ))
    assert r.first() is not None


@pytest.mark.asyncio
async def test_no_se_puede_actualizar_token_revocado(db_app_role):
    """UPDATE debe estar revocado para forense."""
    await db_app_role.execute(text(
        "INSERT INTO seguridad.tokens_revocados (jti, expira_en) "
        "VALUES ('test-jti', now() + interval '1 hour')"
    ))
    with pytest.raises(Exception, match="permission denied"):
        await db_app_role.execute(text(
            "UPDATE seguridad.tokens_revocados SET motivo='x' WHERE jti='test-jti'"
        ))
```

---

### 3.14 · `POST /auth/logout` inserta jti en denylist

**Test (falla primero):** `apps/api/tests/security/test_logout_denylist.py`

```python
import pyjwt
import pytest


@pytest.mark.asyncio
async def test_logout_invalida_token_inmediatamente(authed_client):
    me1 = await authed_client.get("/auth/me")
    assert me1.status_code == 200

    logout = await authed_client.post("/auth/logout")
    assert logout.status_code == 204

    me2 = await authed_client.get("/auth/me")
    assert me2.status_code == 401
    assert "revocado" in me2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_logout_inserta_jti_con_expira(authed_client, db, current_token):
    decoded = pyjwt.decode(current_token, options={"verify_signature": False})
    jti = decoded["jti"]

    await authed_client.post("/auth/logout")

    from sqlalchemy import text
    r = await db.execute(text(
        "SELECT expira_en FROM seguridad.tokens_revocados WHERE jti = :j"
    ).bindparams(j=jti))
    row = r.first()
    assert row is not None
    assert row.expira_en is not None


@pytest.mark.asyncio
async def test_logout_revoca_tambien_refresh_token(authed_client, db):
    """Logout debe invalidar el refresh emitido con el access actual."""
    # ...
```

**Implementación:** modificar `apps/api/src/bomberos_api/routers/auth.py`:

```python
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> None:
    decoded = decode_token(token, expected_type="access")
    jti = decoded["jti"]
    exp = datetime.fromtimestamp(decoded["exp"], tz=UTC)
    ip = _client_ip(request)

    await _set_audit_context(db, user.id, ip)

    # Insertar el access actual en denylist
    await db.execute(
        text("""
            INSERT INTO seguridad.tokens_revocados (jti, usuario_id, expira_en, motivo, ip)
            VALUES (:j, :u, :e, 'logout', CAST(:ip AS inet))
            ON CONFLICT (jti) DO NOTHING
        """).bindparams(j=jti, u=user.id, e=exp, ip=ip)
    )

    # Revocar TODOS los refresh activos de este usuario (Sprint 2 tiene tabla refresh_tokens)
    await db.execute(
        text("""
            UPDATE seguridad.refresh_tokens
               SET revocado_en = now()
             WHERE usuario_id = :uid AND revocado_en IS NULL
        """).bindparams(uid=user.id)
    )

    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=request.headers.get("user-agent"),
        tipo_evento="LOGOUT", detalle=f"jti={jti}"
    )
    log.info("logout", usuario_id=user.id, jti=jti)
```

---

### 3.15 · `get_current_user` consulta denylist con cache

**Test (falla primero):** `apps/api/tests/security/test_denylist_check.py`

```python
@pytest.mark.asyncio
async def test_token_en_denylist_es_rechazado(authed_client, db, current_jti):
    """Inserta manualmente el jti en denylist y verifica que el siguiente request falla."""
    from sqlalchemy import text
    await db.execute(text(
        "INSERT INTO seguridad.tokens_revocados (jti, expira_en) "
        "VALUES (:j, now() + interval '1 hour')"
    ).bindparams(j=current_jti))
    await db.commit()

    resp = await authed_client.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_check_denylist_usa_cache(authed_client, db, current_jti, monkeypatch):
    """Verifica que dos requests seguidos no hacen 2 SELECT a la denylist."""
    queries = []
    # ... mock que registra cada SELECT a tokens_revocados
    await authed_client.get("/auth/me")
    await authed_client.get("/auth/me")
    # Solo debe haber 1 query (cache 30s)
    denylist_queries = [q for q in queries if "tokens_revocados" in q]
    assert len(denylist_queries) == 1
```

**Implementación:** modificar `apps/api/src/bomberos_api/core/deps.py`:

```python
from cachetools import TTLCache
from sqlalchemy import text

# Cache local por proceso (30 s) — múltiples workers tienen caches independientes
# Trade-off: hasta 30s de delay para que un logout se propague entre workers.
# Aceptable porque el access token tiene exp corto (30 min) y la denylist se consulta en cada request.
_denylist_cache: TTLCache[str, bool] = TTLCache(maxsize=10_000, ttl=30)


async def _jti_esta_revocado(db, jti: str) -> bool:
    if jti in _denylist_cache:
        return _denylist_cache[jti]

    r = await db.execute(
        text("SELECT 1 FROM seguridad.tokens_revocados WHERE jti = :j AND expira_en > now()")
        .bindparams(j=jti)
    )
    revocado = r.first() is not None
    _denylist_cache[jti] = revocado
    return revocado


async def get_current_user(
    request: Request,
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> Usuario:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token, expected_type="access")
    except ValueError:
        raise credentials_exc

    jti = payload.get("jti")
    if jti and await _jti_esta_revocado(db, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revocado (logout previo).",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exc

    user = await db.scalar(select(Usuario).where(Usuario.id == int(user_id)))
    if user is None or not user.activo or user.bloqueado:
        raise credentials_exc

    # MFA obligatorio para roles sensibles (3.5)
    if request.url.path not in ENDPOINTS_EXENTOS_MFA_OBLIGATORIO:
        roles = await _user_roles(db, user.id)
        if roles & ROLES_MFA_OBLIGATORIO and not user.mfa_activo:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="mfa_requerido",
            )

    return user
```

**Dependencia:** añadir `cachetools>=5.3` a `pyproject.toml`.

---

### 3.16 · Job de limpieza diario

**Archivo:** `apps/api/src/bomberos_api/scripts/limpiar_denylist.py`

```python
"""Job cron diario: elimina entradas expiradas de tokens_revocados."""
import asyncio
import sys

from sqlalchemy import text

from bomberos_api.database import async_session_factory
from bomberos_api.logging import configure_logging, get_logger

log = get_logger("limpieza-denylist")


async def main() -> int:
    configure_logging()
    async with async_session_factory() as db:
        # Tokens revocados expirados (ya no valdrían igual): eliminar
        r1 = await db.execute(text(
            "DELETE FROM seguridad.tokens_revocados WHERE expira_en < now() - interval '1 day' "
            "RETURNING jti"
        ))
        eliminados = r1.rowcount

        # Códigos de recuperación MFA usados hace >6 meses (limpieza opcional)
        r2 = await db.execute(text(
            "DELETE FROM seguridad.mfa_codigos_recuperacion "
            "WHERE usado_en IS NOT NULL AND usado_en < now() - interval '6 months' "
            "RETURNING id"
        ))
        recovery_eliminados = r2.rowcount

        await db.commit()
        log.info("limpieza_denylist_ok",
                 tokens_revocados_eliminados=eliminados,
                 recovery_codes_eliminados=recovery_eliminados)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

**Cron service en `docker-compose.yml`:**

```yaml
  cleanup:
    image: bomberos-api:latest
    depends_on: [postgres]
    env_file: ./secrets/api.env
    command: ["python", "-m", "bomberos_api.scripts.limpiar_denylist"]
    restart: "no"
    deploy:
      restart_policy:
        condition: none
```

**Cron en host (Debian):** `/etc/cron.d/bomberos-cleanup`

```cron
# m h dom mon dow user command
0 3 * * * root cd /opt/bomberos && docker compose run --rm cleanup >> /var/log/bomberos-cleanup.log 2>&1
```

---

## BLOQUE 4 · Password policy reforzada (entregables 3.17 a 3.20)

### 3.17 · Tabla `seguridad.password_history`

**Migración SQL:** `sql/migrations/sprint-3/3.17-password-history.sql`

```sql
CREATE TABLE IF NOT EXISTS seguridad.password_history (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_history_usuario
    ON seguridad.password_history (usuario_id, creado_en DESC);

ALTER TABLE seguridad.password_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguridad.password_history FORCE ROW LEVEL SECURITY;

CREATE POLICY password_history_propio
    ON seguridad.password_history
    FOR SELECT TO bomberos_app
    USING (usuario_id = current_setting('app.usuario_id')::BIGINT);

-- Solo el sistema inserta (vía SECURITY DEFINER de change-password)
REVOKE UPDATE, DELETE, TRUNCATE ON seguridad.password_history FROM PUBLIC;
GRANT INSERT, SELECT ON seguridad.password_history TO bomberos_app;
```

---

### 3.18 · Verificar últimas 10 + insertar en history

**Test (falla primero):** `apps/api/tests/security/test_password_history.py`

```python
import pytest


@pytest.mark.asyncio
async def test_no_se_puede_reusar_password_anterior(authed_client, usuario_de_prueba):
    passwords = ["First#2026*", "Second#2026*", "Third#2026*"]
    current = "Password#2026"

    for nueva in passwords:
        r = await authed_client.post("/auth/change-password", json={
            "password_actual": current, "password_nuevo": nueva
        })
        assert r.status_code == 204
        current = nueva

    # Intentar volver a la primera
    r = await authed_client.post("/auth/change-password", json={
        "password_actual": current, "password_nuevo": "First#2026*"
    })
    assert r.status_code == 400
    assert "ya fue usada" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_history_solo_guarda_ultimas_10(db, usuario_de_prueba):
    """Insertar 12 passwords y verificar que solo quedan 10 en history."""
    from sqlalchemy import text
    for i in range(12):
        await db.execute(text(
            "INSERT INTO seguridad.password_history (usuario_id, password_hash) "
            "VALUES (:u, :h)"
        ).bindparams(u=usuario_de_prueba.id, h=f"fake-hash-{i}"))
        await _limpiar_history_viejo(db, usuario_de_prueba.id)
    r = await db.execute(text(
        "SELECT COUNT(*) AS n FROM seguridad.password_history WHERE usuario_id = :u"
    ).bindparams(u=usuario_de_prueba.id))
    assert r.first().n == 10
```

**Implementación:** modificar `apps/api/src/bomberos_api/routers/auth.py`:

```python
from bomberos_api.security.password_policy import validar_password_robusta, PASSWORD_HISTORY_SIZE


async def _password_en_history(db, usuario_id: int, password_plano: str) -> bool:
    rows = await db.execute(
        text("""
            SELECT password_hash FROM seguridad.password_history
             WHERE usuario_id = :u
             ORDER BY creado_en DESC
             LIMIT :n
        """).bindparams(u=usuario_id, n=PASSWORD_HISTORY_SIZE)
    )
    for r in rows.mappings():
        if verify_password(password_plano, r["password_hash"]):
            return True
    return False


async def _push_password_history(db, usuario_id: int, password_hash_viejo: str) -> None:
    await db.execute(
        text("""
            INSERT INTO seguridad.password_history (usuario_id, password_hash)
            VALUES (:u, :h)
        """).bindparams(u=usuario_id, h=password_hash_viejo)
    )
    # Conservar solo las últimas N
    await db.execute(
        text("""
            DELETE FROM seguridad.password_history
             WHERE usuario_id = :u
               AND id NOT IN (
                   SELECT id FROM seguridad.password_history
                    WHERE usuario_id = :u
                    ORDER BY creado_en DESC
                    LIMIT :n
               )
        """).bindparams(u=usuario_id, n=PASSWORD_HISTORY_SIZE)
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    user: CurrentUser,
    db: DbSession,
) -> None:
    if not verify_password(payload.password_actual, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña actual incorrecta",
        )

    # Validaciones contextuales (3.20)
    validar_password_robusta(
        password=payload.password_nuevo,
        usuario=user.usuario,
        nombre_completo=user.nombre_completo,
    )

    # No reusar las últimas 10
    if await _password_en_history(db, user.id, payload.password_nuevo):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Esta contraseña ya fue usada en las últimas {PASSWORD_HISTORY_SIZE}. Elige otra.",
        )
    if verify_password(payload.password_nuevo, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña nueva debe ser distinta a la actual.",
        )

    ip = _client_ip(request)
    await _set_audit_context(db, user.id, ip)

    # Guardar la vieja en history ANTES de pisar
    await _push_password_history(db, user.id, user.password_hash)

    user.password_hash = hash_password(payload.password_nuevo)
    user.debe_cambiar_password = False

    # Revocar todos los refresh del usuario (Sprint 2 patrón) + access actual
    await db.execute(
        text("""
            UPDATE seguridad.refresh_tokens
               SET revocado_en = now()
             WHERE usuario_id = :u AND revocado_en IS NULL
        """).bindparams(u=user.id)
    )

    await _log_acceso(
        db, usuario_id=user.id, usuario=user.usuario, ip=ip,
        user_agent=request.headers.get("user-agent"),
        tipo_evento="CAMBIO_PASSWORD"
    )
```

---

### 3.19 · Lista negra de top-10k passwords

**Archivo de datos:** `apps/api/src/bomberos_api/data/common-passwords.txt`

Descargar de SecLists:
```bash
curl -sSfL https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt \
   | tr 'A-Z' 'a-z' | sort -u > apps/api/src/bomberos_api/data/common-passwords.txt
```

(Para intranet sin internet: descargar en máquina con internet, transferir vía USB curado durante deploy Sprint 6.)

**Test:** `apps/api/tests/security/test_password_blacklist.py`

```python
import pytest

from bomberos_api.security.password_policy import (
    PASSWORD_BLACKLIST,
    validar_password_robusta,
    PasswordPolicyError,
)


def test_blacklist_se_carga():
    assert len(PASSWORD_BLACKLIST) >= 9000
    assert "password" in PASSWORD_BLACKLIST
    assert "123456" in PASSWORD_BLACKLIST
    assert "qwerty" in PASSWORD_BLACKLIST


@pytest.mark.parametrize("pw", ["password123", "Password123!", "P@ssw0rd"])
def test_password_comun_es_rechazada(pw):
    with pytest.raises(PasswordPolicyError, match="común"):
        validar_password_robusta(pw, usuario="test", nombre_completo="Test User")


def test_password_buena_es_aceptada():
    # Una passphrase robusta no en la blacklist
    validar_password_robusta(
        "Caracas-Rapida-Velvet-Reloj-2026!",
        usuario="ana.ramirez",
        nombre_completo="Ana Ramírez",
    )
```

**Módulo:** `apps/api/src/bomberos_api/security/password_policy.py`

```python
"""Password policy reforzada (Sprint 3): blacklist top-10k + validaciones contextuales."""
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


PASSWORD_HISTORY_SIZE = 10
PASSWORD_MIN_LENGTH = 12  # Sprint 3 sube el mínimo de 10 a 12

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_BLACKLIST_FILE = _DATA_DIR / "common-passwords.txt"

# Palabras prohibidas: cualquier substring de estas en la password (case-insensitive)
PALABRAS_PROHIBIDAS = (
    "bombero", "bomberos", "caracas", "distrito", "capital",
    "admin", "administrador", "venezuela",
    "qwerty", "asdfgh", "zxcvbn",
    "1234", "12345", "abcd", "abcde",
)


class PasswordPolicyError(ValueError):
    """Excepción de violación de policy. Se mapea a HTTP 400."""


@lru_cache(maxsize=1)
def _load_blacklist() -> frozenset[str]:
    if not _BLACKLIST_FILE.exists():
        return frozenset()
    with _BLACKLIST_FILE.open("r", encoding="utf-8", errors="replace") as f:
        return frozenset(line.strip().lower() for line in f if line.strip())


PASSWORD_BLACKLIST = _load_blacklist()


def _normalizar(s: str) -> str:
    """Sin acentos, lowercase, sin espacios extra."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


def validar_password_robusta(
    password: str,
    *,
    usuario: str,
    nombre_completo: str,
    cedula: str | None = None,
) -> None:
    """Valida la password según policy reforzada Sprint 3.

    Reglas:
    1. Longitud >= PASSWORD_MIN_LENGTH (12).
    2. Mayúscula, minúscula, dígito, especial.
    3. No en blacklist de top-10k (case-insensitive).
    4. No contiene username, palabras del nombre, cédula, palabras prohibidas.
    5. No es secuencia trivial (aaaaaaaaaaaa, 111111111111).
    """
    if len(password) < PASSWORD_MIN_LENGTH:
        raise PasswordPolicyError(
            f"La contraseña debe tener al menos {PASSWORD_MIN_LENGTH} caracteres."
        )
    if len(password) > 128:
        raise PasswordPolicyError("La contraseña excede 128 caracteres.")

    if not re.search(r"[A-Z]", password):
        raise PasswordPolicyError("Debe incluir al menos una mayúscula.")
    if not re.search(r"[a-z]", password):
        raise PasswordPolicyError("Debe incluir al menos una minúscula.")
    if not re.search(r"\d", password):
        raise PasswordPolicyError("Debe incluir al menos un dígito.")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise PasswordPolicyError("Debe incluir al menos un carácter especial.")

    norm = _normalizar(password)

    # Blacklist top-10k
    if norm in PASSWORD_BLACKLIST:
        raise PasswordPolicyError("Esta contraseña es demasiado común. Elige otra.")
    # Considerar también el password sin caracteres especiales (P@ssw0rd → password)
    desofuscada = (
        norm.replace("@", "a").replace("0", "o").replace("1", "i")
            .replace("3", "e").replace("$", "s").replace("!", "i")
    )
    if desofuscada in PASSWORD_BLACKLIST:
        raise PasswordPolicyError("Esta contraseña es una variante común conocida. Elige otra.")

    # Validaciones contextuales
    usuario_norm = _normalizar(usuario)
    if usuario_norm and len(usuario_norm) >= 3 and usuario_norm in norm:
        raise PasswordPolicyError("No puede contener tu nombre de usuario.")

    for parte in _normalizar(nombre_completo).split():
        if len(parte) >= 4 and parte in norm:
            raise PasswordPolicyError(
                "No puede contener partes de tu nombre completo."
            )

    if cedula:
        cedula_digits = re.sub(r"\D", "", cedula)
        if len(cedula_digits) >= 5 and cedula_digits in password:
            raise PasswordPolicyError("No puede contener tu cédula.")

    for prohibida in PALABRAS_PROHIBIDAS:
        if prohibida in norm:
            raise PasswordPolicyError(
                f"No puede contener la palabra '{prohibida}'."
            )

    # Secuencias triviales: al menos 4 caracteres iguales consecutivos
    if re.search(r"(.)\1{3,}", password):
        raise PasswordPolicyError("Demasiados caracteres repetidos consecutivos.")
```

**Actualizar `apps/api/src/bomberos_api/schemas/auth.py`:**

```python
from bomberos_api.security.password_policy import (
    PasswordPolicyError,
    validar_password_robusta,
)


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password_actual: str = Field(min_length=1, max_length=128)
    password_nuevo: str = Field(min_length=12, max_length=128)

    # La validación contextual completa se hace en el router (necesita username + nombre).
    # Aquí solo la sintáctica básica.
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
```

---

### 3.20 · Validaciones contextuales (ya cubierto por 3.19)

Verificado en `validar_password_robusta` arriba — username, nombre, cédula, palabras prohibidas. Tests:

```python
@pytest.mark.parametrize("password,usuario,nombre", [
    ("AnaRamirez#2026!", "ana.ramirez", "Ana Ramírez"),
    ("BomberoFuerte#1", "test", "Test"),
    ("Caracas#2026Caracas", "test", "Test"),
])
def test_password_con_contexto_personal_rechazada(password, usuario, nombre):
    with pytest.raises(PasswordPolicyError):
        validar_password_robusta(password, usuario=usuario, nombre_completo=nombre)
```

---

## BLOQUE 5 · Tests de seguridad (entregables 3.21 a 3.26)

### 3.21 · `tests/security/test_idor.py`

Cobertura: un test por endpoint × scope mismatch.

```python
"""Tests IDOR: usuario con scope X no debe ver/modificar datos de scope Y."""
import pytest


ENDPOINTS_CON_FUNCIONARIO_ID = [
    # GET por ID
    ("GET", "/salud/reposos/{funcionario_id}"),
    ("GET", "/ops/guardias/{funcionario_id}"),
    ("GET", "/carrera/cursos/{funcionario_id}"),
    ("GET", "/equipo/proteccion/{funcionario_id}"),
    ("GET", "/beneficios/{funcionario_id}"),
    ("GET", "/egresos/{funcionario_id}"),
    # POST
    ("POST", "/salud/reposos?funcionario_id={funcionario_id}"),
    ("POST", "/ops/permisos?funcionario_id={funcionario_id}"),
    # PATCH
    ("PATCH", "/funcionarios/{funcionario_id}"),
    # DELETE
    ("DELETE", "/equipo/proteccion/{asignacion_id}"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path_template", ENDPOINTS_CON_FUNCIONARIO_ID)
async def test_idor_cross_scope_devuelve_403(
    method, path_template, db, client,
    usuario_zona_1, usuario_zona_2, funcionario_zona_2
):
    """Usuario de zona 1 intenta acceder a funcionario de zona 2."""
    token = await _login_helper(client, usuario_zona_1)
    path = path_template.format(funcionario_id=funcionario_zona_2.id, asignacion_id=1)

    resp = await client.request(
        method, path,
        headers={"Authorization": f"Bearer {token}"},
        json={} if method in ("POST", "PATCH") else None,
    )
    assert resp.status_code == 403, f"{method} {path} → {resp.status_code} (esperado 403)"


@pytest.mark.asyncio
async def test_idor_listado_filtra_por_scope(client, db, usuario_zona_1):
    """GET /salud/reposos sin filtro debe devolver SOLO los de zona 1."""
    token = await _login_helper(client, usuario_zona_1)
    resp = await client.get("/salud/reposos", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    for item in body["data"]:
        funcionario = await _fetch_funcionario(db, item["funcionario_id"])
        assert funcionario.zona_id == usuario_zona_1.zona_id
```

---

### 3.22 · `tests/security/test_role_escalation.py`

```python
"""Tests de escalada de rol: usuario con rol bajo intenta endpoint de rol alto."""
import pytest


ENDPOINTS_QUE_REQUIEREN_ROL = [
    # path, método, rol mínimo
    ("/admin/usuarios", "GET", "ADMIN"),
    ("/admin/usuarios", "POST", "ADMIN"),
    ("/admin/roles", "GET", "ADMIN"),
    ("/admin/permisos", "GET", "ADMIN"),
    ("/admin/auditoria", "GET", "ADMIN"),
    ("/admin/parametros", "PATCH", "SUPER_ADMIN"),
    ("/carrera/recalcular-meritos", "POST", "RRHH"),
    ("/salud/reposos", "POST", "MEDICO"),
]

ROLES_DISPONIBLES = ["OPERATIVO", "SUPERVISOR", "RRHH", "MEDICO", "ADMIN", "SUPER_ADMIN"]


def es_rol_menor(rol_usuario: str, rol_requerido: str) -> bool:
    orden = {r: i for i, r in enumerate(ROLES_DISPONIBLES)}
    return orden[rol_usuario] < orden[rol_requerido]


@pytest.mark.asyncio
@pytest.mark.parametrize("path,method,rol_min", ENDPOINTS_QUE_REQUIEREN_ROL)
@pytest.mark.parametrize("rol_atacante", ROLES_DISPONIBLES)
async def test_role_escalation(client, db, path, method, rol_min, rol_atacante):
    if not es_rol_menor(rol_atacante, rol_min):
        pytest.skip("Rol suficiente, no es escalada")

    user = await _crear_usuario_con_rol(db, rol=rol_atacante)
    token = await _login_helper(client, user)

    resp = await client.request(
        method, path,
        headers={"Authorization": f"Bearer {token}"},
        json={} if method in ("POST", "PATCH") else None,
    )
    assert resp.status_code == 403, (
        f"{rol_atacante} pudo acceder a {method} {path} (requiere {rol_min})"
    )


@pytest.mark.asyncio
async def test_no_se_puede_modificar_propio_rol(client, db):
    """Un ADMIN no puede asignarse SUPER_ADMIN a sí mismo."""
    admin = await _crear_usuario_con_rol(db, rol="ADMIN")
    token = await _login_helper(client, admin)
    resp = await client.post(
        f"/admin/usuarios/{admin.id}/roles",
        headers={"Authorization": f"Bearer {token}"},
        json={"rol_codigo": "SUPER_ADMIN"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_jwt_con_roles_extra_no_concede_acceso(client, db):
    """Token forjado con claim `roles=['SUPER_ADMIN']` pero el usuario en BD no tiene ese rol."""
    user = await _crear_usuario_con_rol(db, rol="OPERATIVO")
    # Forjamos un token "válido" con claims falsos (firmamos con la llave real)
    from bomberos_api.core.security import create_token
    token_forjado = create_token(user.id, "access", {"roles": ["SUPER_ADMIN"]})

    resp = await client.get(
        "/admin/usuarios",
        headers={"Authorization": f"Bearer {token_forjado}"},
    )
    # Backend debe re-cargar roles de BD; el claim del JWT es informativo, no autoritativo
    assert resp.status_code == 403
```

---

### 3.23 · `tests/security/test_admin_only.py`

```python
"""Cada endpoint /admin/* requiere ADMIN. Lista exhaustiva."""
import pytest
from fastapi.routing import APIRoute

from bomberos_api.main import app


def _enumerar_endpoints_admin():
    out = []
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path.startswith("/admin"):
            for method in route.methods - {"HEAD", "OPTIONS"}:
                out.append((method, route.path))
    return out


ENDPOINTS_ADMIN = _enumerar_endpoints_admin()


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", ENDPOINTS_ADMIN)
async def test_endpoint_admin_requiere_rol(method, path, client, db, usuario_operativo):
    token = await _login_helper(client, usuario_operativo)
    # Reemplazar {id} por valor cualquiera para que el routing match
    path_concrete = path.replace("{id}", "1").replace("{usuario_id}", "1")

    resp = await client.request(
        method, path_concrete,
        headers={"Authorization": f"Bearer {token}"},
        json={} if method in ("POST", "PATCH", "PUT") else None,
    )
    assert resp.status_code in (403, 401), f"{method} {path} accesible para OPERATIVO"


@pytest.mark.asyncio
async def test_health_endpoints_admin_only_en_produccion(client, monkeypatch):
    """/health/db-diag y /health/schema requieren ADMIN (Sprint 1 entregable 1.5)."""
    monkeypatch.setenv("APP_ENV", "production")
    resp = await client.get("/health/db-diag")
    assert resp.status_code in (401, 403)
```

---

### 3.24 · `tests/security/test_mfa_required.py`

Ya cubierto parcialmente en 3.5; expandir:

```python
import pytest


@pytest.mark.asyncio
async def test_admin_sin_mfa_no_puede_listar_usuarios(client, db):
    admin = await _crear_usuario_con_rol(db, rol="ADMIN", mfa_activo=False)
    token = await _login_helper(client, admin)
    resp = await client.get("/admin/usuarios", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "mfa_requerido" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_con_mfa_si_puede_listar_usuarios(client, db):
    admin = await _crear_usuario_con_rol(db, rol="ADMIN", mfa_activo=True)
    token = await _login_con_mfa(client, admin)
    resp = await client.get("/admin/usuarios", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint_exento", [
    "/auth/me", "/auth/mfa/enroll", "/auth/mfa/verify",
    "/auth/change-password", "/auth/logout",
])
async def test_endpoints_exentos_funcionan_sin_mfa(client, db, endpoint_exento):
    admin = await _crear_usuario_con_rol(db, rol="ADMIN", mfa_activo=False)
    token = await _login_helper(client, admin)
    method = "GET" if endpoint_exento == "/auth/me" else "POST"
    resp = await client.request(method, endpoint_exento, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code != 403 or "mfa_requerido" not in resp.json().get("detail", "").lower()
```

---

### 3.25 · `tests/security/test_audit_immutability.py`

```python
"""Verifica que aud.log_* son append-only (Sprint 1 entregable 1.15)."""
import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_no_se_puede_actualizar_aud_log_cambios(db_app_role):
    await db_app_role.execute(text(
        "INSERT INTO aud.log_cambios (schema_name, table_name, op, row_pk, old_val, new_val) "
        "VALUES ('personal','funcionarios','U','42','{}'::jsonb,'{}'::jsonb)"
    ))
    with pytest.raises(Exception):
        await db_app_role.execute(text(
            "UPDATE aud.log_cambios SET new_val = '{\"tampered\":true}'::jsonb LIMIT 1"
        ))


@pytest.mark.asyncio
async def test_no_se_puede_eliminar_aud_log_cambios(db_app_role):
    with pytest.raises(Exception):
        await db_app_role.execute(text("DELETE FROM aud.log_cambios LIMIT 1"))


@pytest.mark.asyncio
async def test_no_se_puede_truncate_aud_log_accesos(db_app_role):
    with pytest.raises(Exception):
        await db_app_role.execute(text("TRUNCATE aud.log_accesos"))


@pytest.mark.asyncio
async def test_hash_chain_de_audit_es_valido(db):
    """Recorre todas las filas y verifica que record_hash[n] = sha256(prev_hash[n] || row_json[n])."""
    import hashlib
    rows = await db.execute(text("""
        SELECT id, prev_hash, record_hash, schema_name, table_name, op, row_pk, old_val, new_val
          FROM aud.log_cambios
         ORDER BY id ASC
    """))
    prev = b""
    for r in rows.mappings():
        # Reconstruir el row_json igual que fn_audit
        canonical = (
            f"{r['schema_name']}|{r['table_name']}|{r['op']}|{r['row_pk']}|"
            f"{r['old_val']}|{r['new_val']}"
        ).encode("utf-8")
        expected = hashlib.sha256(prev + canonical).digest()
        assert bytes(r["record_hash"]) == expected, (
            f"Hash chain rota en id={r['id']}"
        )
        prev = bytes(r["record_hash"])


@pytest.mark.asyncio
async def test_aud_log_no_contiene_password_hash(db):
    """Sprint 1 P0-6: ningún log debe contener password_hash en el JSONB."""
    r = await db.execute(text("""
        SELECT 1 FROM aud.log_cambios
         WHERE old_val::text ILIKE '%password_hash%'
            OR new_val::text ILIKE '%password_hash%'
         LIMIT 1
    """))
    assert r.first() is None
```

---

### 3.26 · `tests/security/test_rls_isolation.py`

```python
"""Verifica que RLS efectivamente aisla a usuarios de scope distinto a nivel BD."""
import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_usuario_zona_1_no_ve_funcionarios_zona_2(db_app_role, usuario_zona_1, funcionario_zona_2):
    await db_app_role.execute(text(
        "SELECT set_config('app.usuario_id', :u, false)"
    ).bindparams(u=str(usuario_zona_1.id)))

    r = await db_app_role.execute(text(
        "SELECT id FROM personal.funcionarios WHERE id = :f"
    ).bindparams(f=funcionario_zona_2.id))
    assert r.first() is None, "RLS no aisló: zona 1 vio funcionario de zona 2"


@pytest.mark.asyncio
async def test_usuario_zona_1_no_puede_update_funcionario_zona_2(db_app_role, usuario_zona_1, funcionario_zona_2):
    await db_app_role.execute(text(
        "SELECT set_config('app.usuario_id', :u, false)"
    ).bindparams(u=str(usuario_zona_1.id)))

    r = await db_app_role.execute(text(
        "UPDATE personal.funcionarios SET nombres='HACK' WHERE id = :f RETURNING id"
    ).bindparams(f=funcionario_zona_2.id))
    assert r.first() is None  # RLS bloqueó


@pytest.mark.asyncio
async def test_bypass_rls_funciona_para_jobs(db_app_role, funcionario_zona_2):
    """Jobs internos pueden activar app.bypass_rls=1 para reportería sin scope."""
    await db_app_role.execute(text("SELECT set_config('app.bypass_rls', '1', false)"))
    r = await db_app_role.execute(text(
        "SELECT id FROM personal.funcionarios WHERE id = :f"
    ).bindparams(f=funcionario_zona_2.id))
    assert r.first() is not None


@pytest.mark.asyncio
async def test_app_role_no_tiene_bypassrls(db_admin):
    """Sanity: el rol bomberos_app NO debe tener BYPASSRLS."""
    r = await db_admin.execute(text(
        "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'bomberos_app'"
    ))
    assert r.first().rolbypassrls is False
```

---

## BLOQUE 6 · Frontend hardening (entregables 3.27 a 3.31)

### 3.27 · Hook `useIdleLogout`

**Archivo:** `apps/web/src/hooks/useIdleLogout.ts`

```ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "visibilitychange",
] as const;

const WARNING_BEFORE_MS = 60_000; // avisa 1 min antes
const CHECK_INTERVAL_MS = 5_000;

interface Options {
  /** Minutos de inactividad antes de cerrar sesión. */
  timeoutMinutes: number;
  /** Callback antes de cerrar (para mostrar modal de aviso). */
  onWarning?: (segundosRestantes: number) => void;
  /** Si false, desactiva el hook (ej. desarrollo). */
  enabled?: boolean;
}

export function useIdleLogout({ timeoutMinutes, onWarning, enabled = true }: Options) {
  const router = useRouter();
  const lastActivity = useRef<number>(Date.now());
  const timeoutMs = timeoutMinutes * 60_000;

  const resetIdle = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled || timeoutMinutes <= 0) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    void mediaQuery; // hook respeta motion preferences

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, resetIdle, { passive: true });
    });

    const interval = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      const remaining = timeoutMs - idle;

      if (remaining <= 0) {
        window.clearInterval(interval);
        // Logout: server action que limpia cookie + redirect
        void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
          router.push("/login?reason=idle_timeout");
          router.refresh();
        });
        return;
      }

      if (remaining <= WARNING_BEFORE_MS && onWarning) {
        onWarning(Math.ceil(remaining / 1000));
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, resetIdle);
      });
      window.clearInterval(interval);
    };
  }, [enabled, timeoutMs, timeoutMinutes, onWarning, resetIdle, router]);
}
```

**Componente wrapper:** `apps/web/src/components/layout/IdleLogoutGuard.tsx`

```tsx
"use client";

import { useState } from "react";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function IdleLogoutGuard({ timeoutMinutes }: { timeoutMinutes: number }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useIdleLogout({
    timeoutMinutes,
    onWarning: (s) => setSecondsLeft(s),
  });

  if (secondsLeft === null) return null;

  return (
    <Dialog open onOpenChange={() => setSecondsLeft(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sesión a punto de expirar</DialogTitle>
        </DialogHeader>
        <p>
          Por inactividad cerraremos tu sesión en <strong>{secondsLeft}</strong> segundos.
          Mueve el mouse o presiona una tecla para continuar.
        </p>
      </DialogContent>
    </Dialog>
  );
}
```

**Integrar en `apps/web/src/app/(app)/layout.tsx`:**

```tsx
import IdleLogoutGuard from "@/components/layout/IdleLogoutGuard";

interface Me {
  // ... existentes
  sesion_timeout_min?: number;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // ... existente
  const timeoutMin = me?.sesion_timeout_min ?? 30;

  return (
    <div className="min-h-screen flex bg-background">
      <IdleLogoutGuard timeoutMinutes={timeoutMin} />
      {/* ... resto idéntico */}
    </div>
  );
}
```

**Backend:** expandir `/auth/me` response y modelo `UsuarioMeResponse`:

```python
class UsuarioMeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    # ... existentes
    sesion_timeout_min: int = 30  # de sys.parametros o config
```

---

### 3.28 · `middleware.ts` con matcher de defense in depth

**Archivo:** `apps/web/src/middleware.ts`

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ACCESS_COOKIE = "bcd_access";

const PUBLIC_PATHS = ["/login", "/login/mfa", "/_next", "/api/auth", "/favicon.ico", "/static"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1. Rutas públicas: dejar pasar (CSP se inyecta en el handler de respuesta más abajo)
  if (isPublic(pathname)) {
    return injectCsp(NextResponse.next(), req);
  }

  // 2. Defense in depth: si no hay cookie de acceso → redirect a login
  const cookie = req.cookies.get(ACCESS_COOKIE);
  if (!cookie?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return injectCsp(NextResponse.next(), req);
}

function injectCsp(response: NextResponse, req: NextRequest): NextResponse {
  // Nonce dinámico por request (3.29)
  const nonce = btoa(crypto.randomUUID());
  response.headers.set("x-csp-nonce", nonce);

  const apiHost = process.env.NEXT_PUBLIC_API_INTERNAL_HOST ?? "https://api.bomberos.dc.local";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' ${apiHost}`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `worker-src 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
```

---

### 3.29 · CSP con nonce dinámico

**Editar `apps/web/next.config.mjs`:**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // NO definir CSP estática aquí — el middleware.ts la inyecta con nonce dinámico
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Propagación del nonce a Server Components:** `apps/web/src/lib/csp-nonce.ts`

```ts
import { headers } from "next/headers";

export function getCspNonce(): string {
  return headers().get("x-csp-nonce") ?? "";
}
```

**Uso en `<Script>`:** `apps/web/src/app/layout.tsx` (root)

```tsx
import Script from "next/script";
import { getCspNonce } from "@/lib/csp-nonce";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = getCspNonce();
  return (
    <html lang="es">
      <body>
        {children}
        {/* Si algún script inline debe inyectarse: */}
        <Script id="theme-init" nonce={nonce} strategy="beforeInteractive">
          {`if (typeof window !== 'undefined') { document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'; }`}
        </Script>
      </body>
    </html>
  );
}
```

**Test E2E:** `apps/web/e2e/csp.spec.ts`

```ts
import { test, expect } from "@playwright/test";

test("CSP está presente y tiene nonce", async ({ page }) => {
  const response = await page.goto("/dashboard");
  expect(response).not.toBeNull();
  const csp = response!.headers()["content-security-policy"];
  expect(csp).toContain("script-src 'self' 'nonce-");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
});

test("scripts inline sin nonce son bloqueados", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
      blocked.push(msg.text());
    }
  });

  await page.goto("/dashboard");
  // Inyectar un script malicioso vía DOM (simulando XSS)
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.HACKED = true";
    document.body.appendChild(s);
  });

  expect(await page.evaluate(() => (window as any).HACKED)).toBeUndefined();
});
```

---

### 3.30 · `error.tsx` y `global-error.tsx`

**Archivo:** `apps/web/src/app/error.tsx`

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log local mínimo, sin enviar `error.message` a Sentry/etc (puede contener PII)
    console.error("App error", { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold">Algo salió mal</h2>
        <p className="text-sm text-muted-foreground">
          Ocurrió un error inesperado. El equipo técnico ha sido notificado.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground/60 font-mono">
            Ref: {error.digest}
          </p>
        )}
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </div>
  );
}
```

**Archivo:** `apps/web/src/app/global-error.tsx`

```tsx
"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          background: "#0a0a0a",
          color: "#e5e5e5",
        }}>
          <div style={{ textAlign: "center", maxWidth: "28rem" }}>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Error fatal</h1>
            <p style={{ fontSize: "0.875rem", color: "#a3a3a3", marginBottom: "1rem" }}>
              La aplicación no pudo cargar. Recarga la página o cierra sesión.
            </p>
            <button onClick={reset} style={{
              background: "#dc2626",
              color: "white",
              border: 0,
              padding: "0.5rem 1rem",
              borderRadius: "0.25rem",
              cursor: "pointer",
            }}>
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
```

---

### 3.31 · `extra="forbid"` en schemas Pydantic

**Script de inventario:** `scripts/security/audit-pydantic-extras.py`

```python
"""Verifica que TODOS los schemas *Create / *Update tienen extra='forbid'."""
import ast
from pathlib import Path

SCHEMAS_DIR = Path(__file__).resolve().parents[2] / "apps/api/src/bomberos_api/schemas"


def schemas_sin_forbid() -> list[tuple[str, str]]:
    faltantes = []
    for py in SCHEMAS_DIR.rglob("*.py"):
        if py.name == "__init__.py":
            continue
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            if not any(node.name.endswith(suf) for suf in ("Create", "Update", "Request", "Patch")):
                continue
            # Buscar model_config con extra='forbid'
            tiene_forbid = False
            for stmt in node.body:
                if isinstance(stmt, ast.Assign):
                    for tgt in stmt.targets:
                        if isinstance(tgt, ast.Name) and tgt.id == "model_config":
                            src = ast.unparse(stmt.value)
                            if "extra='forbid'" in src.replace('"', "'"):
                                tiene_forbid = True
            if not tiene_forbid:
                faltantes.append((str(py.relative_to(SCHEMAS_DIR.parent)), node.name))
    return faltantes


if __name__ == "__main__":
    fail = schemas_sin_forbid()
    if fail:
        print("Schemas SIN extra='forbid':")
        for f, c in fail:
            print(f"  {f}::{c}")
        raise SystemExit(1)
    print("OK: todos los Create/Update tienen extra='forbid'")
```

**CI step:** añadir a `.github/workflows/ci.yml`:

```yaml
      - name: Audit Pydantic schemas extra=forbid
        run: python scripts/security/audit-pydantic-extras.py
```

**Aplicar el cambio a cada schema:** patrón:

```python
class FuncionarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # ... campos
```

**Test:**

```python
@pytest.mark.asyncio
async def test_extra_field_rechazado_con_422(authed_client_admin):
    resp = await authed_client_admin.post("/funcionarios", json={
        "cedula": "12345678", "nombres": "Test", "apellidos": "Test",
        "campo_que_no_existe": "valor",
    })
    assert resp.status_code == 422
    assert "campo_que_no_existe" in resp.text or "extra" in resp.text.lower()
```

---

## BLOQUE 7 · Observabilidad y supply chain (entregables 3.32 a 3.35)

### 3.32 · Middleware `X-Request-ID`

**Archivo:** modificar `apps/api/src/bomberos_api/core/middleware.py`

```python
import time
import uuid
from contextvars import ContextVar

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Aceptar el id del proxy si viene (caddy/nginx propaga); si no, generar uno
        req_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        request_id_var.set(req_id)
        request.state.request_id = req_id

        # Bind al structlog context para todos los logs de este request
        structlog.contextvars.bind_contextvars(request_id=req_id)

        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("request_id")

        duration_ms = (time.perf_counter() - start) * 1000
        response.headers[REQUEST_ID_HEADER] = req_id

        log = structlog.get_logger("request")
        log.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(duration_ms, 2),
        )
        return response
```

**Registrar en `main.py`:**

```python
from bomberos_api.core.middleware import RequestIDMiddleware

app.add_middleware(RequestIDMiddleware)
```

**Correlación con audit:** modificar `_log_acceso` en `routers/auth.py` para incluir `request_id`:

```python
async def _log_acceso(db, *, request_id: str | None = None, ...):
    await db.execute(text("""
        INSERT INTO aud.log_accesos (request_id, usuario_id, usuario, ip, user_agent, tipo_evento, detalle)
        VALUES (:rid, :uid, :u, CAST(:ip AS inet), :ua, CAST(:te AS core.tipo_evento_acceso), :d)
    """).bindparams(rid=request_id, uid=usuario_id, u=usuario, ip=ip, ua=user_agent, te=tipo_evento, d=detalle))
```

**Migración SQL:** `sql/migrations/sprint-3/3.32-aud-request-id.sql`

```sql
ALTER TABLE aud.log_accesos ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE aud.log_cambios ADD COLUMN IF NOT EXISTS request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_log_accesos_request_id ON aud.log_accesos(request_id);
CREATE INDEX IF NOT EXISTS idx_log_cambios_request_id ON aud.log_cambios(request_id);
```

**Test:**

```python
@pytest.mark.asyncio
async def test_response_incluye_request_id(client):
    resp = await client.get("/health")
    assert "X-Request-ID" in resp.headers
    assert len(resp.headers["X-Request-ID"]) == 32  # uuid4 hex


@pytest.mark.asyncio
async def test_request_id_se_propaga_al_audit(authed_client, db):
    req_id = "test-trace-id-12345"
    resp = await authed_client.post("/auth/logout", headers={"X-Request-ID": req_id})
    assert resp.status_code == 204
    from sqlalchemy import text
    r = await db.execute(text(
        "SELECT 1 FROM aud.log_accesos WHERE request_id = :r AND tipo_evento = 'LOGOUT'"
    ).bindparams(r=req_id))
    assert r.first() is not None
```

---

### 3.33 · SBOM CycloneDX en CI

**Editar `apps/api/pyproject.toml` añadir dev dep:**

```toml
[project.optional-dependencies]
dev = [
    # ... existentes
    "cyclonedx-bom>=4.4,<5",
]
```

**Editar `apps/web/package.json`:**

```json
{
  "devDependencies": {
    "@cyclonedx/cyclonedx-npm": "^1.20.0"
  },
  "scripts": {
    "sbom": "cyclonedx-npm --output-file sbom.json --omit dev"
  }
}
```

**CI job `.github/workflows/ci.yml`:**

```yaml
  sbom:
    needs: [lint, test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Generate Python SBOM
        working-directory: apps/api
        run: |
          pip install cyclonedx-bom>=4.4
          cyclonedx-py environment --output-format JSON --output-file ../../sbom-python.json

      - name: Generate Node SBOM
        working-directory: apps/web
        run: |
          npm ci
          npx --yes @cyclonedx/cyclonedx-npm --output-file ../../sbom-node.json --omit dev

      - name: Upload SBOMs
        uses: actions/upload-artifact@v4
        with:
          name: sbom-${{ github.sha }}
          path: |
            sbom-python.json
            sbom-node.json
          retention-days: 365
```

---

### 3.34 · `pip-audit` + `npm audit` bloqueante

**CI job:**

```yaml
  security-audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install pip-audit
        run: pip install "pip-audit>=2.7"

      - name: Audit Python deps (fail on High+)
        working-directory: apps/api
        run: |
          pip-audit --requirement <(pip compile pyproject.toml) \
            --strict \
            --ignore-vuln GHSA-XXXX-XXXX-XXXX  # documentar excepciones aquí

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Audit Node deps (fail on High+)
        working-directory: apps/web
        run: |
          npm ci
          npm audit --omit=dev --audit-level=high
```

**Política de excepciones:** crear `docs/SECURITY_EXCEPTIONS.md`:

```markdown
# Excepciones de pip-audit / npm audit

Toda excepción debe incluir:
- CVE / GHSA ID
- Razón (no aplicable, falso positivo, fix planificado para fecha X)
- Fecha de creación
- Owner (quién la revisa cada trimestre)

## Activas

(ninguna al cierre de Sprint 3)
```

---

### 3.35 · Dashboard scope-aware

**Migración SQL:** `sql/migrations/sprint-3/3.35-dashboard-scoped.sql`

```sql
-- Reemplazar sys.v_dashboard (sin scope) por v_dashboard_scoped
-- que filtra por current_setting('app.usuario_id')

CREATE OR REPLACE VIEW sys.v_dashboard_scoped
WITH (security_invoker = true) AS
WITH scope_actual AS (
    SELECT
        zona_id, estacion_id, division_id, area_id
      FROM seguridad.usuario_scopes
     WHERE usuario_id = current_setting('app.usuario_id', true)::BIGINT
)
SELECT
    (SELECT COUNT(*) FROM personal.funcionarios f
        WHERE f.activo = TRUE
          AND (NOT EXISTS (SELECT 1 FROM scope_actual)
               OR EXISTS (
                   SELECT 1 FROM scope_actual s
                    WHERE (s.zona_id IS NULL OR s.zona_id = f.zona_id)
                      AND (s.estacion_id IS NULL OR s.estacion_id = f.estacion_id)
               ))
    ) AS total_funcionarios_activos,
    (SELECT COUNT(*) FROM salud.reposos r
        JOIN personal.funcionarios f ON f.id = r.funcionario_id
       WHERE r.fecha_fin >= CURRENT_DATE
         AND (NOT EXISTS (SELECT 1 FROM scope_actual)
              OR EXISTS (
                  SELECT 1 FROM scope_actual s
                   WHERE (s.zona_id IS NULL OR s.zona_id = f.zona_id)
                     AND (s.estacion_id IS NULL OR s.estacion_id = f.estacion_id)
              ))
    ) AS reposos_vigentes,
    -- ... resto de métricas con el mismo patrón
    current_setting('app.usuario_id', true)::BIGINT AS contexto_usuario_id;

COMMENT ON VIEW sys.v_dashboard_scoped IS
    'Dashboard agregado filtrado por scope del usuario actual via app.usuario_id. '
    'Usuario sin scopes (NULL) ve todo (ADMIN/SUPER_ADMIN).';
```

**Actualizar router:** `apps/api/src/bomberos_api/routers/dashboard.py`

```python
@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(user: CurrentUser, db: DbSession) -> DashboardResponse:
    await db.execute(
        text("SELECT set_config('app.usuario_id', :u, true)").bindparams(u=str(user.id))
    )
    row = await db.execute(text("SELECT * FROM sys.v_dashboard_scoped"))
    data = row.mappings().first()
    return DashboardResponse(**dict(data))
```

**Test:**

```python
@pytest.mark.asyncio
async def test_dashboard_filtra_por_scope(client, db, usuario_zona_1, usuario_zona_2):
    """Jefe de zona 1 ve KPIs solo de zona 1, no nacionales."""
    t1 = await _login_helper(client, usuario_zona_1)
    t2 = await _login_helper(client, usuario_zona_2)

    r1 = await client.get("/dashboard", headers={"Authorization": f"Bearer {t1}"})
    r2 = await client.get("/dashboard", headers={"Authorization": f"Bearer {t2}"})

    assert r1.status_code == 200
    assert r2.status_code == 200

    # Los totales son distintos (cada zona ve su slice)
    assert r1.json()["total_funcionarios_activos"] != r2.json()["total_funcionarios_activos"]
```

---

## 4 · Tests de smoke y CI

### 4.1 · Ejecución local completa

```bash
# Backend
cd apps/api
uv run pytest tests/security/ -v --tb=short
uv run pytest --cov=src --cov-report=term-missing

# Frontend
cd apps/web
npm run lint
npm run type-check
npm run test
npx playwright test mfa-flow.spec.ts csp.spec.ts

# SQL
psql -h localhost -U postgres -d bomberos_caracas -f tests/sql/test_rls_isolation.sql
psql -h localhost -U postgres -d bomberos_caracas -f tests/sql/test_audit_immutability.sql

# Schema audit
python scripts/security/audit-pydantic-extras.py
```

### 4.2 · CI gating

Editar `.github/workflows/ci.yml` para que falle si:
- `pip-audit` reporta High+.
- `npm audit --audit-level=high` reporta.
- Algún `*Create`/`*Update` carece de `extra="forbid"`.
- Tests de `tests/security/` fallan.

---

## 5 · Migration plan operativo

### 5.1 · Orden de aplicación

1. **Aplicar migraciones SQL** (`sql/migrations/sprint-3/*.sql` en orden numérico):
   ```bash
   for f in sql/migrations/sprint-3/3.*.sql; do
     psql -h localhost -U postgres -d bomberos_caracas -f "$f"
   done
   ```
2. **Instalar deps Python nuevas** (`pyotp`, `qrcode`, `cachetools`, `cyclonedx-bom`).
3. **Generar par JWT RS256** (`scripts/security/generate-jwt-keys.sh`).
4. **Cargar lista de passwords comunes** (`apps/api/src/bomberos_api/data/common-passwords.txt`).
5. **Aplicar cambios de código** según bloques 1-7.
6. **Smoke test local** (`pytest`, Playwright, lint).
7. **Cutover JWT HS256 → RS256** según `docs/CUTOVER_JWT_RS256.md` — fuerza logout global.
8. **Comunicar a usuarios:** ADMIN/RRHH/MEDICO deben enrollar MFA en la siguiente sesión.
9. **Monitorear** `aud.log_accesos` 48h por `LOGIN_FALLIDO`/`MFA_FALLIDO` anómalos.

### 5.2 · Rollback de cada bloque

| Bloque | Rollback |
|---|---|
| MFA | `UPDATE seguridad.usuarios SET mfa_activo = FALSE` + comentar router en `main.py` |
| JWT RS256 | Cambiar `JWT_ALGORITHM=HS256` en `api.env`, restart API |
| Denylist | `TRUNCATE seguridad.tokens_revocados` + comentar `_jti_esta_revocado()` |
| Password history | `DROP TABLE seguridad.password_history` + revertir `change-password` |
| CSP | Quitar `middleware.ts` o reducir CSP a `default-src *` |
| SBOM/audit CI | Quitar el job del workflow |

---

## 6 · Definition of Done de Sprint 3

- [ ] **3.1-3.7 MFA:** TODOs los tests verdes; flujo Playwright completo pasa; al menos un usuario real con cada rol sensible (ADMIN/RRHH/MEDICO) enrollado y operando.
- [ ] **3.8-3.12 JWT RS256:** llaves generadas y custodiadas; tests algorithm-confusion pasan; logs muestran `kid` en cada token decodificado.
- [ ] **3.13-3.16 Denylist:** logout invalida en <1s; cleanup job corre cada 24h; cache de 30s verificada en tests.
- [ ] **3.17-3.20 Password policy:** history de 10 funciona; blacklist top-10k cargada (≥9000 líneas); validaciones contextuales con username/nombre/cédula tests verdes.
- [ ] **3.21-3.26 Tests seguridad:** `pytest tests/security/` ≥30 tests pasando.
- [ ] **3.27-3.31 Frontend:** `useIdleLogout` activo en `(app)/layout.tsx`; `middleware.ts` redirige cookies ausentes; CSP inspeccionada con DevTools sin warnings; `error.tsx` + `global-error.tsx` presentes; `audit-pydantic-extras.py` 0 faltantes.
- [ ] **3.32-3.35 Observabilidad:** `X-Request-ID` en headers de respuesta; SBOMs (Python + Node) generados como artifacts en cada CI run; `pip-audit` y `npm audit --audit-level=high` corriendo en CI; dashboard devuelve métricas diferentes por zona.
- [ ] **Sección "Aceptación pre-producción" de `docs/SECURITY.md`:** ≥80% de items marcados.
- [ ] **Tag:** `v0.5.0-security-sprint-3` creado y firmado.
- [ ] **Demo público:** sigue operando sin regresión (Render/Vercel/Neon).
- [ ] **Commit del checklist:** todos los items 3.1-3.35 del ROADMAP §6 marcados.

---

## 7 · Riesgos del sprint y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Reloj de servidor desincronizado → TOTP falla | Media | Alto | Ensanchar `TOTP_WINDOW=2`; instalar `chronyd` en sede (Fase 6 ya lo cubre) |
| Pérdida de llave privada RS256 | Baja | Crítico | Custodiar 3 copias: USB cifrado en caja fuerte, gestor de secretos, papel sellado |
| Cache de denylist desactualiza entre workers | Media | Bajo | TTL 30s es aceptable porque exp del access es 30min; documentar trade-off |
| CSP rompe scripts existentes (third-party) | Alta | Medio | Activar primero con `Content-Security-Policy-Report-Only`, recopilar 1 semana, luego enforce |
| Lista de passwords top-10k crece y deps no la versionan | Baja | Bajo | Snapshot fijo committed; renovar manualmente en Sprint 4+ |
| Tests de RLS rompen por usuario `postgres` en CI | Alta | Medio | CI usa rol `bomberos_app` no superuser para correr tests (Sprint 1 ya creó el rol) |
| Login en 2 pasos confunde a usuarios | Media | Bajo | Capacitación de Fase 6 incluye video del flujo; mensajes UX claros en `/login/mfa` |

---

## 8 · Hand-off al sprint siguiente

Al cerrar Sprint 3, el sistema cumple **todos los requisitos técnicos** de seguridad para producción intranet. Lo que queda en Fase 4-6:
- Frontend modules completos (no es seguridad).
- Migración legacy de datos reales (no es seguridad).
- Deploy físico, capacitación, handover (operativo).

Hooks dejados para futuras fases:
- Tabla `seguridad.jwt_keys_activas` lista para rotación 2027.
- Lista de excepciones de `pip-audit`/`npm audit` en `docs/SECURITY_EXCEPTIONS.md`.
- Runbook `docs/RUNBOOK_KEY_ROTATION.md` para el operador.
- CSP en modo enforce con espacio para `report-uri` futuro.

---

**Fin del plan Security Sprint 3.**

Cualquier desviación de este plan debe documentarse en un "Post-mortem" al cierre del sprint y propagarse al `ROADMAP.md` §6 con un block "Cambios respecto al plan original".
