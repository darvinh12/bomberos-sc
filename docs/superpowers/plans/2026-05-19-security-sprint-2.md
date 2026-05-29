# Security Sprint 2 Implementation Plan

> **Para agentes:** SKILL REQUERIDA: usar superpowers:subagent-driven-development o superpowers:executing-plans.

**Goal:** Cerrar los 20 hallazgos P1 del audit (defense in depth, hardening de contenedores, refresh token rotation real, validación zod).

**Architecture:** TDD donde aplique. Algunos cambios infra no son testables — documentar verificación manual. Prerrequisito: Sprint 1 cerrado.

**Tech Stack:** Igual a Sprint 1.

**Esfuerzo estimado:** 80 horas / 2 semanas / 1 dev senior.

---

## Tabla de contenidos

| Bloque | Entregable | Hallazgo | Archivos principales |
|---|---|---|---|
| **A — Auth y autorización** | 2.1 Refresh token rotation real | P1-2 | `routers/auth.py`, `models/usuario.py`, `sql/01_base.sql`, `alembic/` |
| | 2.2 Change-password invalida refresh | P1-3 | `routers/auth.py` |
| | 2.3 Rol SUPER_ADMIN segregado | P1-8 | `routers/admin.py`, `sql/04_seed.sql`, `core/deps.py` |
| | 2.4 Sanitización de `integrity_409` | P1-4 | `core/crud.py` |
| **B — Rate limiting y request handling** | 2.5 `X-Forwarded-For` con allowlist | P1-5 | `core/middleware.py`, `core/request_utils.py` (nuevo), `routers/auth.py`, `core/crud.py` |
| | 2.6 Rate-limit dedicado `/auth/login` | P1-6 | `core/middleware.py` |
| | 2.7 Refactor anti-pattern Annotated | P1-7 | `routers/ops.py`, `routers/equipo.py`, `schemas/ops.py`, `schemas/equipo.py` |
| **C — Frontend hardening** | 2.8 `requireServerRole` helper | P1-10 | `apps/web/src/lib/session.ts`, `apps/web/src/app/(app)/admin/**/actions.ts` |
| | 2.9 Validación zod en server actions | P1-11 | mismos `actions.ts` + `apps/web/src/lib/schemas/` (nuevo) |
| **D — Base de datos** | 2.10 Cifrado pgcrypto de `mfa_secret`/`token_recuperacion` | P1-12 | `sql/01_base.sql`, `sql/06_seguridad_rls.sql`, `sql/migrations/` |
| | 2.11 `security_invoker=true` en vistas | P1-13 | `sql/03_funciones_vistas.sql` |
| | 2.12 `SET search_path` en funciones | P1-14 | `sql/03_funciones_vistas.sql` |
| **E — Infraestructura** | 2.13 Container hardening | P1-15 | `docker-compose.yml` |
| | 2.14 Networks separadas | P1-16 | `docker-compose.yml` |
| | 2.15 Eliminar passlib | P1-17 | `apps/api/pyproject.toml`, `core/security.py` |
| | 2.16 CI hardening | P1-18 | `.github/workflows/ci.yml` |
| | 2.17 Healthcheck sin curl | P1-19 | `apps/api/Dockerfile` |
| | 2.18 Bootstrap fail-fast | P1-20 | `scripts/bootstrap.py` |
| | 2.19 Pin de imágenes por SHA digest | P2-20 elevado | `apps/api/Dockerfile`, `docker-compose.yml` |

---

## Prerrequisitos (verificar antes de empezar)

- [ ] **Pre-1.** Sprint 1 cerrado. Tag `v0.3.0-security-sprint-1` existe en el repo. `git tag -l | grep v0.3.0` devuelve la tag.
- [ ] **Pre-2.** Tests existentes pasan en `main`: `cd apps/api && pytest -q` verde; `cd apps/web && npm run typecheck && npm test` verde.
- [ ] **Pre-3.** Rama nueva: `git checkout -b security/sprint-2`.
- [ ] **Pre-4.** Alembic configurado y operativo. Verificar con `cd apps/api && alembic current` (devuelve revision actual o vacío si nunca corrió).
- [ ] **Pre-5.** `JWT_SECRET_KEY` con al menos 64 caracteres en `.env` local (heredado del Sprint 1).

---

## Bloque A — Auth y autorización

### Tarea 2.1 — Refresh token rotation real con reuse detection (P1-2)

**Contexto:** `POST /auth/refresh` emite un nuevo refresh pero deja el viejo válido hasta `exp` (7 días). Un atacante que capture un refresh lo usa en paralelo al usuario legítimo. Hay que detectar reuso e invalidar familia completa.

**Modelo:** cada refresh emitido tiene un `jti` único y un `padre_jti` (NULL para el primero del login, o el `jti` del que reemplazó). Al hacer refresh: se valida que el viejo no esté `revocado_en` ni `usado_en`. Si está usado → toda la familia (todos los descendientes con el mismo `root_jti`) se revoca y el usuario debe re-login.

**Files:**
- `apps/api/src/bomberos_api/models/refresh_token.py` (nuevo)
- `apps/api/src/bomberos_api/routers/auth.py`
- `apps/api/src/bomberos_api/core/security.py`
- `apps/api/alembic/versions/<nuevo>_refresh_tokens.py` (nuevo)
- `apps/api/tests/test_refresh_rotation.py` (nuevo)

**Steps:**

- [ ] **2.1.1** TDD: crear `apps/api/tests/test_refresh_rotation.py` con tres tests que **fallen**:

  ```python
  from datetime import UTC, datetime
  import pytest
  from httpx import AsyncClient

  pytestmark = pytest.mark.asyncio

  async def _login(client: AsyncClient, usuario: str, pwd: str) -> dict:
      r = await client.post("/auth/login", data={"username": usuario, "password": pwd})
      assert r.status_code == 200, r.text
      return r.json()

  async def test_refresh_token_rotates_and_invalidates_old(client, admin_credentials):
      tokens = await _login(client, *admin_credentials)
      r1 = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
      assert r1.status_code == 200
      new_refresh = r1.json()["refresh_token"]
      assert new_refresh != tokens["refresh_token"]
      # El viejo refresh debe ser rechazado en el segundo intento
      r2 = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
      assert r2.status_code == 401
      assert "token revocado" in r2.json()["detail"].lower() or "inválido" in r2.json()["detail"].lower()

  async def test_refresh_reuse_detects_family_compromise(client, admin_credentials):
      tokens = await _login(client, *admin_credentials)
      # Refresh #1 — rota
      r1 = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
      new_refresh = r1.json()["refresh_token"]
      # Atacante reusa el viejo → debe revocar TODA la familia
      r_attack = await client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
      assert r_attack.status_code == 401
      # Usuario legítimo intenta usar el "nuevo" → también rechazado porque la familia fue revocada
      r_legit = await client.post("/auth/refresh", json={"refresh_token": new_refresh})
      assert r_legit.status_code == 401

  async def test_refresh_token_persists_jti(client, admin_credentials, db_session):
      from sqlalchemy import select, text
      tokens = await _login(client, *admin_credentials)
      count = await db_session.scalar(text("SELECT count(*) FROM seguridad.refresh_tokens"))
      assert count >= 1
  ```

  Correr: `pytest tests/test_refresh_rotation.py -v` → tres tests rojos (la tabla no existe). Esperado.

- [ ] **2.1.2** Crear migración Alembic para `seguridad.refresh_tokens`:

  ```bash
  cd apps/api && alembic revision -m "refresh_tokens_table"
  ```

  Contenido del archivo generado (`apps/api/alembic/versions/<id>_refresh_tokens_table.py`):

  ```python
  """refresh_tokens_table

  Revision ID: <generado>
  Revises: <previa>
  Create Date: 2026-05-19
  """
  from alembic import op
  import sqlalchemy as sa

  revision = "<generado>"
  down_revision = "<previa>"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.execute("""
      CREATE TABLE seguridad.refresh_tokens (
          id           BIGSERIAL PRIMARY KEY,
          jti          UUID NOT NULL UNIQUE,
          usuario_id   BIGINT NOT NULL REFERENCES seguridad.usuarios(id) ON DELETE CASCADE,
          padre_jti    UUID NULL REFERENCES seguridad.refresh_tokens(jti) ON DELETE SET NULL,
          root_jti     UUID NOT NULL,
          emitido_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
          expira_en    TIMESTAMPTZ NOT NULL,
          usado_en     TIMESTAMPTZ NULL,
          revocado_en  TIMESTAMPTZ NULL,
          revocado_motivo TEXT NULL,
          ip           INET NULL,
          user_agent   TEXT NULL
      );
      CREATE INDEX ix_refresh_tokens_usuario_id ON seguridad.refresh_tokens (usuario_id);
      CREATE INDEX ix_refresh_tokens_root_jti  ON seguridad.refresh_tokens (root_jti);
      CREATE INDEX ix_refresh_tokens_expira_en ON seguridad.refresh_tokens (expira_en)
          WHERE revocado_en IS NULL;
      -- Audit append-only: hereda triggers del bloque común si se llama después de fn_attach_audit
      """)
      op.execute("SELECT sys.fn_attach_audit('seguridad', 'refresh_tokens')")


  def downgrade() -> None:
      op.execute("DROP TABLE IF EXISTS seguridad.refresh_tokens CASCADE")
  ```

  Aplicar: `alembic upgrade head`. Verificar: `psql -c "\d seguridad.refresh_tokens"`.

- [ ] **2.1.3** Crear `apps/api/src/bomberos_api/models/refresh_token.py`:

  ```python
  from datetime import datetime
  from uuid import UUID

  from sqlalchemy import BIGINT, TIMESTAMP, ForeignKey, Text
  from sqlalchemy.dialects.postgresql import INET, UUID as PG_UUID
  from sqlalchemy.orm import Mapped, mapped_column

  from bomberos_api.models.base import Base


  class RefreshToken(Base):
      __tablename__ = "refresh_tokens"
      __table_args__ = {"schema": "seguridad"}

      id: Mapped[int] = mapped_column(BIGINT, primary_key=True)
      jti: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), unique=True, nullable=False)
      usuario_id: Mapped[int] = mapped_column(
          BIGINT, ForeignKey("seguridad.usuarios.id", ondelete="CASCADE"), nullable=False
      )
      padre_jti: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
      root_jti: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
      emitido_en: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
      expira_en: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
      usado_en: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
      revocado_en: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
      revocado_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
      ip: Mapped[str | None] = mapped_column(INET, nullable=True)
      user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
  ```

- [ ] **2.1.4** Modificar `core/security.py.create_token` para que el refresh acepte `jti` explícito y lo embeba como claim:

  ```python
  from uuid import uuid4

  def create_token(
      subject: str | int,
      token_type: TokenType = "access",
      extra_claims: dict[str, Any] | None = None,
      *,
      jti: str | None = None,
  ) -> tuple[str, str]:
      """Devuelve (token, jti_efectivo). Si no se pasa jti, se genera uno nuevo."""
      s = get_settings()
      now = datetime.now(UTC)
      if token_type == "access":
          expires = now + timedelta(minutes=s.jwt_access_token_expire_minutes)
      else:
          expires = now + timedelta(days=s.jwt_refresh_token_expire_days)

      effective_jti = jti or str(uuid4())
      payload: dict[str, Any] = {
          "sub": str(subject),
          "iat": int(now.timestamp()),
          "exp": int(expires.timestamp()),
          "type": token_type,
          "jti": effective_jti,
      }
      if extra_claims:
          payload.update(extra_claims)
      return jwt.encode(payload, s.jwt_secret_key, algorithm=s.jwt_algorithm), effective_jti
  ```

  **Nota:** esto rompe la API existente. Actualizar todos los call sites a `token, jti = create_token(...)` y descartar `jti` si no se necesita.

- [ ] **2.1.5** Reescribir `routers/auth.py.login` y `routers/auth.py.refresh_token` para persistir/rotar:

  ```python
  from datetime import UTC, datetime, timedelta
  from uuid import UUID, uuid4

  from bomberos_api.models.refresh_token import RefreshToken

  async def _persistir_refresh(
      db, *, usuario_id: int, jti: str, padre_jti: str | None, root_jti: str,
      ip: str | None, user_agent: str | None, ttl_dias: int,
  ) -> None:
      now = datetime.now(UTC)
      db.add(RefreshToken(
          jti=UUID(jti),
          usuario_id=usuario_id,
          padre_jti=UUID(padre_jti) if padre_jti else None,
          root_jti=UUID(root_jti),
          emitido_en=now,
          expira_en=now + timedelta(days=ttl_dias),
          ip=ip,
          user_agent=user_agent,
      ))
      await db.flush()


  async def _revocar_familia(db, root_jti: UUID, motivo: str) -> None:
      await db.execute(
          text("""UPDATE seguridad.refresh_tokens
                     SET revocado_en = now(), revocado_motivo = :m
                   WHERE root_jti = :r AND revocado_en IS NULL""")
          .bindparams(m=motivo, r=root_jti)
      )
  ```

  En `login` (al final, donde hoy se llama `create_token(..., "refresh")`):

  ```python
  access, _ = create_token(user.id, "access", {"roles": list(roles)})
  refresh_jti = str(uuid4())
  refresh, _ = create_token(user.id, "refresh", jti=refresh_jti)
  await _persistir_refresh(
      db, usuario_id=user.id, jti=refresh_jti, padre_jti=None, root_jti=refresh_jti,
      ip=ip, user_agent=ua, ttl_dias=s.jwt_refresh_token_expire_days,
  )
  ```

  En `refresh_token` reemplazar el cuerpo completo:

  ```python
  @router.post("/refresh", response_model=TokenResponse)
  async def refresh_token(
      request: Request, payload: RefreshRequest, db: DbSession
  ) -> TokenResponse:
      s = get_settings()
      ip = _client_ip(request)
      ua = request.headers.get("user-agent")

      try:
          decoded = decode_token(payload.refresh_token, expected_type="refresh")
      except ValueError:
          raise HTTPException(status_code=401, detail="Refresh token inválido")

      jti = decoded.get("jti")
      if not jti:
          raise HTTPException(status_code=401, detail="Refresh token sin jti")

      rt = await db.scalar(
          select(RefreshToken).where(RefreshToken.jti == UUID(jti))
      )
      if rt is None:
          raise HTTPException(status_code=401, detail="Refresh token desconocido")

      if rt.revocado_en is not None:
          raise HTTPException(status_code=401, detail="Refresh token revocado")

      if rt.usado_en is not None:
          # REUSE DETECTION — atacante. Revocar familia entera.
          await _revocar_familia(db, rt.root_jti, "reuse_detected")
          await _log_acceso(
              db, usuario_id=rt.usuario_id, usuario=str(rt.usuario_id), ip=ip,
              user_agent=ua, tipo_evento="REFRESH_REUSE",
              detalle=f"familia revocada: {rt.root_jti}",
          )
          raise HTTPException(status_code=401, detail="Refresh token reutilizado — familia revocada")

      user_id = int(decoded["sub"])
      user = await db.scalar(select(Usuario).where(Usuario.id == user_id))
      if user is None or not user.activo or user.bloqueado:
          raise HTTPException(status_code=401, detail="Cuenta no disponible")

      # Marcar el viejo como usado
      rt.usado_en = datetime.now(UTC)

      result = await db.execute(
          select(Rol.codigo)
          .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
          .where(UsuarioRol.usuario_id == user.id)
      )
      roles = result.scalars().all()

      access, _ = create_token(user.id, "access", {"roles": list(roles)})
      new_jti = str(uuid4())
      new_refresh, _ = create_token(user.id, "refresh", jti=new_jti)
      await _persistir_refresh(
          db, usuario_id=user.id, jti=new_jti, padre_jti=str(rt.jti), root_jti=str(rt.root_jti),
          ip=ip, user_agent=ua, ttl_dias=s.jwt_refresh_token_expire_days,
      )

      return TokenResponse(
          access_token=access,
          refresh_token=new_refresh,
          expires_in=s.jwt_access_token_expire_minutes * 60,
      )
  ```

- [ ] **2.1.6** Re-correr `pytest tests/test_refresh_rotation.py -v` → los tres tests deben pasar. Si fallan, depurar con `pytest -vv -s`.

- [ ] **2.1.7** Job de limpieza: añadir endpoint admin (no público) que purga refresh expirados. Para Sprint 2 basta con SQL manual documentado en `docs/RUNBOOK.md`:

  ```sql
  -- Ejecutar mensualmente (o por cron job en Sprint 3)
  DELETE FROM seguridad.refresh_tokens
   WHERE expira_en < now() - INTERVAL '7 days';
  ```

- [ ] **2.1.8** Commit: `git add -A && git commit -m "security: 2.1 refresh token rotation con reuse detection (P1-2)"`.

---

### Tarea 2.2 — Change-password invalida refresh activos (P1-3)

**Contexto:** Hoy `change-password` solo actualiza `password_hash`. Tokens emitidos antes siguen siendo válidos. Un atacante físico podría cambiar password y mantener su sesión paralela.

**Files:**
- `apps/api/src/bomberos_api/routers/auth.py`
- `apps/api/tests/test_change_password.py` (nuevo o extender)

**Steps:**

- [ ] **2.2.1** TDD: añadir test que **falla** en `apps/api/tests/test_change_password.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_change_password_revokes_all_refresh_tokens(client, admin_credentials, db_session):
      from sqlalchemy import text
      usuario, pwd_old = admin_credentials
      pwd_new = "NuevaPassFuerte#2026"

      # Login → obtiene access + refresh
      r = await client.post("/auth/login", data={"username": usuario, "password": pwd_old})
      tokens = r.json()
      access = tokens["access_token"]
      refresh = tokens["refresh_token"]

      # Cambia password
      r = await client.post(
          "/auth/change-password",
          json={"password_actual": pwd_old, "password_nuevo": pwd_new},
          headers={"Authorization": f"Bearer {access}"},
      )
      assert r.status_code == 204

      # El refresh viejo ya no debe servir
      r = await client.post("/auth/refresh", json={"refresh_token": refresh})
      assert r.status_code == 401

      # Restaurar para no contaminar otros tests
      r = await client.post("/auth/login", data={"username": usuario, "password": pwd_new})
      tokens2 = r.json()
      await client.post(
          "/auth/change-password",
          json={"password_actual": pwd_new, "password_nuevo": pwd_old},
          headers={"Authorization": f"Bearer {tokens2['access_token']}"},
      )
  ```

  Correr → rojo (refresh viejo sigue funcionando).

- [ ] **2.2.2** Modificar `routers/auth.py.change_password` para revocar todos los refresh del usuario:

  ```python
  @router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
  async def change_password(
      request: Request,
      payload: ChangePasswordRequest,
      user: CurrentUser,
      db: DbSession,
  ) -> None:
      if not verify_password(payload.password_actual, user.password_hash):
          raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
      if verify_password(payload.password_nuevo, user.password_hash):
          raise HTTPException(
              status_code=400, detail="La contraseña nueva debe ser distinta a la actual"
          )

      ip = _client_ip(request)
      user.password_hash = hash_password(payload.password_nuevo)
      user.debe_cambiar_password = False

      # Revocar TODOS los refresh tokens activos del usuario
      await db.execute(
          text("""UPDATE seguridad.refresh_tokens
                     SET revocado_en = now(), revocado_motivo = 'change_password'
                   WHERE usuario_id = :uid AND revocado_en IS NULL""")
          .bindparams(uid=user.id)
      )

      await _set_audit_context(db, user.id, ip)
      await _log_acceso(
          db, usuario_id=user.id, usuario=user.usuario, ip=ip,
          user_agent=request.headers.get("user-agent"),
          tipo_evento="CAMBIO_PASSWORD",
      )
  ```

- [ ] **2.2.3** Re-correr el test → verde.

- [ ] **2.2.4** Commit: `git commit -m "security: 2.2 change-password invalida refresh tokens (P1-3)"`.

---

### Tarea 2.3 — Rol SUPER_ADMIN segregado de ADMIN (P1-8)

**Contexto:** Cualquier ADMIN puede crear otro ADMIN ilimitadamente. No hay segregación. SUPER_ADMIN debe ser el único capaz de asignar el rol ADMIN; ADMIN regular solo asigna roles operativos (OPERADOR, LOGISTICA, RRHH, MEDICO, etc.).

**Files:**
- `apps/api/src/bomberos_api/routers/admin.py`
- `apps/api/src/bomberos_api/core/deps.py`
- `sql/04_seed.sql`
- `apps/api/alembic/versions/<nuevo>_super_admin_role.py` (nuevo)
- `apps/api/tests/test_super_admin.py` (nuevo)

**Steps:**

- [ ] **2.3.1** TDD: crear `apps/api/tests/test_super_admin.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_admin_cannot_assign_admin_role(client, admin_token, db_session):
      """Un ADMIN regular no puede asignar el rol ADMIN a otro usuario."""
      # crear usuario base
      r = await client.post(
          "/admin/usuarios",
          headers={"Authorization": f"Bearer {admin_token}"},
          json={
              "usuario": "test_promote",
              "nombre_completo": "Test Promote",
              "password": "PassFuerte#2026X",
              "roles": ["OPERADOR"],
          },
      )
      assert r.status_code == 201
      uid = r.json()["id"]

      # Intentar asignar ADMIN → debe ser 403
      r = await client.post(
          f"/admin/usuarios/{uid}/roles/ADMIN",
          headers={"Authorization": f"Bearer {admin_token}"},
      )
      assert r.status_code == 403

  async def test_super_admin_can_assign_admin_role(client, super_admin_token):
      r = await client.post(
          "/admin/usuarios",
          headers={"Authorization": f"Bearer {super_admin_token}"},
          json={
              "usuario": "test_sa_promote",
              "nombre_completo": "Test SA Promote",
              "password": "PassFuerte#2026X",
              "roles": ["ADMIN"],
          },
      )
      assert r.status_code == 201

  async def test_admin_cannot_create_user_with_admin_role(client, admin_token):
      r = await client.post(
          "/admin/usuarios",
          headers={"Authorization": f"Bearer {admin_token}"},
          json={
              "usuario": "test_admin_creates_admin",
              "nombre_completo": "x",
              "password": "PassFuerte#2026X",
              "roles": ["ADMIN"],
          },
      )
      assert r.status_code == 403
  ```

  Correr → rojo. Las fixtures `super_admin_token` no existen aún; añadir en `conftest.py`.

- [ ] **2.3.2** Migración Alembic — seed del rol `SUPER_ADMIN`:

  ```bash
  cd apps/api && alembic revision -m "super_admin_role"
  ```

  Contenido:

  ```python
  def upgrade() -> None:
      op.execute("""
      INSERT INTO seguridad.roles (codigo, nombre, descripcion, es_sistema, activo)
      VALUES ('SUPER_ADMIN', 'Super Administrador',
              'Único rol capaz de asignar el rol ADMIN. Custodia técnica del sistema.',
              TRUE, TRUE)
      ON CONFLICT (codigo) DO NOTHING;
      """)

  def downgrade() -> None:
      op.execute("DELETE FROM seguridad.roles WHERE codigo='SUPER_ADMIN'")
  ```

  Aplicar: `alembic upgrade head`. **No** asignar este rol automáticamente al admin de bootstrap — se asigna manualmente en producción.

- [ ] **2.3.3** Actualizar `sql/04_seed.sql` para que el seed inicial incluya `SUPER_ADMIN` cuando se recrea la BD desde cero (idempotente):

  ```sql
  INSERT INTO seguridad.roles (codigo, nombre, descripcion, es_sistema, activo)
  VALUES ('SUPER_ADMIN', 'Super Administrador',
          'Único rol capaz de asignar el rol ADMIN. Custodia técnica del sistema.',
          TRUE, TRUE)
  ON CONFLICT (codigo) DO NOTHING;
  ```

  Insertar antes de la sección que crea el admin de bootstrap. **No** asignarlo al admin de bootstrap por defecto.

- [ ] **2.3.4** Helper en `core/deps.py` que valida rol explícito:

  ```python
  ROLES_PROTEGIDOS = {"ADMIN", "SUPER_ADMIN"}

  def require_super_admin_for_protected_roles(roles_a_asignar: list[str], current_roles: list[str]) -> None:
      """Lanza 403 si current no es SUPER_ADMIN pero intenta asignar roles protegidos."""
      pedidos_protegidos = set(roles_a_asignar) & ROLES_PROTEGIDOS
      if pedidos_protegidos and "SUPER_ADMIN" not in current_roles:
          raise HTTPException(
              status_code=403,
              detail=f"Solo SUPER_ADMIN puede asignar: {sorted(pedidos_protegidos)}",
          )
  ```

  **Nota:** importar `HTTPException` desde `fastapi`. Asegurar que `CurrentUser` exponga los roles del usuario actual; si no, cargarlos en el helper.

- [ ] **2.3.5** Aplicar en `routers/admin.py.crear_usuario`:

  ```python
  from bomberos_api.core.deps import require_super_admin_for_protected_roles

  @router.post("/usuarios", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
  async def crear_usuario(
      request: Request, payload: UsuarioCreate, db: DbSession, user: CurrentUser
  ) -> UsuarioOut:
      # Cargar roles del usuario actual
      result = await db.execute(
          select(Rol.codigo)
          .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
          .where(UsuarioRol.usuario_id == user.id)
      )
      current_roles = list(result.scalars().all())
      require_super_admin_for_protected_roles(payload.roles, current_roles)

      await set_audit_ctx(db, user.id, client_ip(request))
      # ... resto sin cambios
  ```

- [ ] **2.3.6** Aplicar en `routers/admin.py.asignar_rol`:

  ```python
  @router.post("/usuarios/{usuario_id}/roles/{rol_codigo}", status_code=status.HTTP_204_NO_CONTENT)
  async def asignar_rol(
      request: Request, usuario_id: int, rol_codigo: str, db: DbSession, user: CurrentUser,
  ) -> None:
      result = await db.execute(
          select(Rol.codigo)
          .join(UsuarioRol, UsuarioRol.rol_id == Rol.id)
          .where(UsuarioRol.usuario_id == user.id)
      )
      current_roles = list(result.scalars().all())
      require_super_admin_for_protected_roles([rol_codigo], current_roles)
      # ... resto del código existente
  ```

- [ ] **2.3.7** Añadir fixture `super_admin_token` en `apps/api/tests/conftest.py`:

  ```python
  @pytest.fixture
  async def super_admin_user(db_session, hash_pwd):
      from bomberos_api.models.usuario import Usuario, Rol, UsuarioRol
      from sqlalchemy import select
      u = Usuario(
          usuario="super_admin_test",
          nombre_completo="Super Admin Test",
          password_hash=hash_pwd("SuperPassFuerte#2026"),
          activo=True, debe_cambiar_password=False,
      )
      db_session.add(u)
      await db_session.flush()
      # asignar SUPER_ADMIN + ADMIN (porque admin endpoints requieren ADMIN base)
      for codigo in ("SUPER_ADMIN", "ADMIN"):
          r = await db_session.scalar(select(Rol).where(Rol.codigo == codigo))
          db_session.add(UsuarioRol(usuario_id=u.id, rol_id=r.id))
      await db_session.flush()
      yield u

  @pytest.fixture
  async def super_admin_token(client, super_admin_user):
      r = await client.post("/auth/login",
                            data={"username": "super_admin_test", "password": "SuperPassFuerte#2026"})
      return r.json()["access_token"]
  ```

- [ ] **2.3.8** Correr `pytest tests/test_super_admin.py -v` → verde.

- [ ] **2.3.9** Documentar en `docs/RUNBOOK.md` cómo asignar SUPER_ADMIN al primer admin (vía `psql` directo, una sola vez):

  ```sql
  INSERT INTO seguridad.usuario_roles (usuario_id, rol_id)
  SELECT u.id, r.id
    FROM seguridad.usuarios u, seguridad.roles r
   WHERE u.usuario = 'admin' AND r.codigo = 'SUPER_ADMIN';
  ```

- [ ] **2.3.10** Commit: `git commit -m "security: 2.3 SUPER_ADMIN role para asignación de ADMIN (P1-8)"`.

---

### Tarea 2.4 — Sanitización de `integrity_409` (P1-4)

**Contexto:** `core/crud.py:integrity_409` devuelve `e.orig` crudo. Esto enumera nombres de columnas, constraints y datos (ej. `duplicate key value violates unique constraint "ix_usuarios_correo" DETAIL: Key (correo)=(juan@bombero.gov.ve) already exists`).

**Files:**
- `apps/api/src/bomberos_api/core/crud.py`
- `apps/api/tests/test_integrity_sanitization.py` (nuevo)

**Steps:**

- [ ] **2.4.1** TDD: crear `apps/api/tests/test_integrity_sanitization.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_duplicate_user_returns_generic_message(client, admin_token):
      payload = {
          "usuario": "dup_user_x",
          "nombre_completo": "Dup",
          "password": "PassFuerte#2026X",
          "roles": ["OPERADOR"],
      }
      r1 = await client.post("/admin/usuarios",
                             headers={"Authorization": f"Bearer {admin_token}"}, json=payload)
      assert r1.status_code == 201
      r2 = await client.post("/admin/usuarios",
                             headers={"Authorization": f"Bearer {admin_token}"}, json=payload)
      assert r2.status_code == 409
      detail = r2.json()["detail"].lower()
      # No debe enumerar columna, constraint, o valor
      for forbidden in ("constraint", "key (", "psycopg", "asyncpg",
                        "duplicate", "ix_", "uq_", "dup_user_x"):
          assert forbidden not in detail, f"Filtra: {forbidden!r} en {detail!r}"
  ```

  Correr → rojo.

- [ ] **2.4.2** Reescribir `core/crud.py`:

  ```python
  """Utilidades CRUD compartidas. Mantienen el patrón uniforme audit + paginación."""
  from typing import Any

  from fastapi import HTTPException, Request, status
  from sqlalchemy import func, select, text
  from sqlalchemy.exc import IntegrityError
  from sqlalchemy.ext.asyncio import AsyncSession

  from bomberos_api.logging import get_logger

  log = get_logger("crud")


  def client_ip(request: Request) -> str | None:
      fwd = request.headers.get("x-forwarded-for")
      if fwd:
          return fwd.split(",")[0].strip()
      return request.client.host if request.client else None


  async def set_audit_ctx(db: AsyncSession, usuario_id: int, ip: str | None) -> None:
      await db.execute(
          text("SELECT set_config('app.usuario_id', :v, true)").bindparams(v=str(usuario_id))
      )
      if ip:
          await db.execute(
              text("SELECT set_config('app.usuario_ip', :v, true)").bindparams(v=ip)
          )


  async def paginate(
      db: AsyncSession, base_stmt, *, page: int, page_size: int,
  ) -> tuple[list[Any], int]:
      count_stmt = select(func.count()).select_from(base_stmt.subquery())
      total = await db.scalar(count_stmt) or 0
      rows = (
          await db.execute(base_stmt.offset((page - 1) * page_size).limit(page_size))
      ).scalars().all()
      return list(rows), total


  def _classify_integrity(e: IntegrityError) -> tuple[int, str]:
      """Clasifica un IntegrityError de Postgres y devuelve (status, mensaje genérico).

      Codes Postgres relevantes:
          23505 unique_violation
          23503 foreign_key_violation
          23502 not_null_violation
          23514 check_violation
      """
      pg_code = None
      orig = getattr(e, "orig", None)
      if orig is not None:
          pg_code = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)

      mapping = {
          "23505": (409, "El registro ya existe (valor único en conflicto)."),
          "23503": (409, "Referencia inválida a otro registro."),
          "23502": (400, "Falta un campo obligatorio."),
          "23514": (400, "Un valor no cumple la regla de validación."),
      }
      return mapping.get(pg_code, (409, "Conflicto de datos."))


  def integrity_409(e: IntegrityError) -> HTTPException:
      """Sanitiza el error de integridad. El detalle crudo va solo a log estructurado."""
      status_code, msg = _classify_integrity(e)
      log.warning(
          "integrity_error",
          pg_code=getattr(getattr(e, "orig", None), "sqlstate", None),
          message=str(getattr(e, "orig", e)),
      )
      return HTTPException(status_code=status_code, detail=msg)


  def not_found(name: str = "Registro") -> HTTPException:
      return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{name} no encontrado")
  ```

- [ ] **2.4.3** Verificar que ningún router usa `e.orig` directamente para devolver al cliente. Buscar:

  ```bash
  grep -rn "e.orig" apps/api/src/bomberos_api/routers/
  ```

  En `admin.py.asignar_rol` hay un `if "duplicate" in str(e.orig).lower()` — mantenerlo solo para la **detección**, pero el `HTTPException` lanzado debe ser genérico:

  ```python
  except IntegrityError as e:
      pg_code = getattr(getattr(e, "orig", None), "sqlstate", None)
      if pg_code == "23505":
          raise HTTPException(status_code=409, detail="Rol ya asignado") from e
      raise integrity_409(e) from e
  ```

- [ ] **2.4.4** Re-correr `pytest tests/test_integrity_sanitization.py -v` → verde.

- [ ] **2.4.5** Commit: `git commit -m "security: 2.4 sanitización de integrity_409 (P1-4)"`.

---

## Bloque B — Rate limiting y request handling

### Tarea 2.5 — `X-Forwarded-For` confiado solo con allowlist (P1-5)

**Contexto:** Hoy cualquier cliente envía `X-Forwarded-For: 1.2.3.4` y el sistema lo cree. Esto falsifica la IP de auditoría y permite saltar rate-limit por IP.

**Decisión arquitectónica:** la app está detrás de Caddy (Sprint 1). Solo confiar en `X-Forwarded-For` si la conexión TCP viene de una IP en la allowlist de proxies (típicamente solo Caddy en red docker `frontend`). En cualquier otro caso, usar `request.client.host`.

**Files:**
- `apps/api/src/bomberos_api/config.py`
- `apps/api/src/bomberos_api/core/request_utils.py` (nuevo)
- `apps/api/src/bomberos_api/core/middleware.py`
- `apps/api/src/bomberos_api/routers/auth.py`
- `apps/api/src/bomberos_api/core/crud.py`
- `apps/api/tests/test_client_ip.py` (nuevo)

**Steps:**

- [ ] **2.5.1** Añadir setting en `config.py`:

  ```python
  trusted_proxies: list[str] = Field(
      default_factory=list,
      description=(
          "IPs o CIDRs de proxies cuyo X-Forwarded-For confiamos. "
          "Ej: ['172.18.0.0/16'] para una red docker. Vacío = nunca confiar."
      ),
  )
  ```

  Soporte de parseo desde env (`TRUSTED_PROXIES=172.18.0.0/16,127.0.0.1`):

  ```python
  @field_validator("trusted_proxies", mode="before")
  @classmethod
  def split_csv(cls, v):
      if isinstance(v, str):
          return [s.strip() for s in v.split(",") if s.strip()]
      return v
  ```

- [ ] **2.5.2** Crear `apps/api/src/bomberos_api/core/request_utils.py`:

  ```python
  """Utilidades de inspección de requests (IP del cliente con allowlist de proxies)."""
  from ipaddress import ip_address, ip_network

  from fastapi import Request

  from bomberos_api.config import get_settings


  def _is_trusted_proxy(remote_addr: str) -> bool:
      s = get_settings()
      if not s.trusted_proxies:
          return False
      try:
          ip = ip_address(remote_addr)
      except ValueError:
          return False
      for spec in s.trusted_proxies:
          try:
              if ip in ip_network(spec, strict=False):
                  return True
          except ValueError:
              continue
      return False


  def client_ip(request: Request) -> str | None:
      """Devuelve la IP real del cliente.

      Reglas:
      - Si la conexión TCP viene de un proxy en la allowlist, usar el ÚLTIMO valor de
        X-Forwarded-For (el más cercano al proxy de borde, no el self-reported del cliente).
      - En cualquier otro caso (incluyendo cuando `trusted_proxies` está vacío),
        ignorar X-Forwarded-For y usar request.client.host.
      """
      remote = request.client.host if request.client else None
      if remote and _is_trusted_proxy(remote):
          fwd = request.headers.get("x-forwarded-for", "")
          if fwd:
              parts = [p.strip() for p in fwd.split(",") if p.strip()]
              if parts:
                  # Toma el último valor (el que el proxy agregó, no el self-claimed)
                  return parts[-1]
      return remote
  ```

- [ ] **2.5.3** TDD: crear `apps/api/tests/test_client_ip.py`:

  ```python
  from unittest.mock import patch
  from fastapi import Request

  def _make_request(client_host: str, xff: str | None = None) -> Request:
      headers = []
      if xff:
          headers.append((b"x-forwarded-for", xff.encode()))
      scope = {
          "type": "http", "method": "GET", "headers": headers,
          "client": (client_host, 12345), "path": "/", "query_string": b"",
          "scheme": "http", "server": ("api", 8000),
      }
      return Request(scope)


  def test_xff_ignored_when_no_trusted_proxies():
      from bomberos_api.core.request_utils import client_ip
      from bomberos_api.config import get_settings
      get_settings.cache_clear()
      with patch.dict("os.environ", {"TRUSTED_PROXIES": ""}, clear=False):
          req = _make_request("203.0.113.5", xff="1.2.3.4")
          get_settings.cache_clear()
          assert client_ip(req) == "203.0.113.5"


  def test_xff_used_when_remote_is_trusted_proxy():
      import os
      from bomberos_api.core.request_utils import client_ip
      from bomberos_api.config import get_settings
      os.environ["TRUSTED_PROXIES"] = "172.18.0.0/16"
      get_settings.cache_clear()
      try:
          req = _make_request("172.18.0.2", xff="10.0.0.5, 203.0.113.5")
          # Toma el último (más cercano al proxy)
          assert client_ip(req) == "203.0.113.5"
      finally:
          os.environ.pop("TRUSTED_PROXIES", None)
          get_settings.cache_clear()


  def test_xff_ignored_when_remote_not_trusted():
      import os
      from bomberos_api.core.request_utils import client_ip
      from bomberos_api.config import get_settings
      os.environ["TRUSTED_PROXIES"] = "172.18.0.0/16"
      get_settings.cache_clear()
      try:
          req = _make_request("10.0.0.5", xff="1.2.3.4")
          assert client_ip(req) == "10.0.0.5"
      finally:
          os.environ.pop("TRUSTED_PROXIES", None)
          get_settings.cache_clear()
  ```

  Correr → rojo (la función aún no existe en ese path).

- [ ] **2.5.4** Reemplazar todos los `_client_ip` y `client_ip` por el nuevo helper:

  - `routers/auth.py`: eliminar la función `_client_ip` local; importar `from bomberos_api.core.request_utils import client_ip as _client_ip`.
  - `core/crud.py`: reemplazar la función `client_ip` por re-export:

    ```python
    from bomberos_api.core.request_utils import client_ip  # re-export para compat
    ```

  - `core/middleware.py.SimpleRateLimitMiddleware.dispatch`: en vez de leer `x-forwarded-for` directamente, llamar al helper:

    ```python
    from bomberos_api.core.request_utils import client_ip as _client_ip
    # ...
    ip = _client_ip(request) or "unknown"
    ```

- [ ] **2.5.5** Documentar en `.env.example` y `docker-compose.yml`:

  ```env
  # Red interna de docker (Sprint 1 dejó frontend/backend networks).
  # Solo Caddy puede añadir X-Forwarded-For confiable.
  TRUSTED_PROXIES=172.20.0.0/16
  ```

- [ ] **2.5.6** Correr `pytest tests/test_client_ip.py -v` → verde. Correr `pytest -q` completo → verde.

- [ ] **2.5.7** Commit: `git commit -m "security: 2.5 X-Forwarded-For con allowlist de proxies (P1-5)"`.

---

### Tarea 2.6 — Rate-limit dedicado `/auth/login` (P1-6)

**Contexto:** Hoy `SimpleRateLimitMiddleware` aplica 120/min global. `/auth/login` debe tener 5/min por IP **y** 5/min por username. El diccionario `self.hits` crece sin cota.

**Files:**
- `apps/api/src/bomberos_api/core/middleware.py`
- `apps/api/src/bomberos_api/main.py`
- `apps/api/tests/test_rate_limit.py` (nuevo o extender)

**Steps:**

- [ ] **2.6.1** TDD: crear `apps/api/tests/test_rate_limit.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_login_rate_limit_per_ip(client):
      ok_user = "admin"
      bad_pwd = "x" * 12
      # 5 intentos → cualquier 6º debe ser 429
      for _ in range(5):
          r = await client.post("/auth/login", data={"username": ok_user, "password": bad_pwd})
          assert r.status_code in (401, 403)
      r = await client.post("/auth/login", data={"username": ok_user, "password": bad_pwd})
      assert r.status_code == 429

  async def test_login_rate_limit_per_username(client):
      """Misma IP probando varios usuarios todavía está limitado por username total."""
      for i in range(5):
          await client.post("/auth/login",
                            data={"username": "victima_x", "password": f"bad-{i}-pass"})
      r = await client.post("/auth/login",
                            data={"username": "victima_x", "password": "otra-mas"})
      assert r.status_code == 429

  async def test_global_rate_limit_does_not_throttle_login_separately(client):
      """El bucket de login es independiente del global; verificar que /health/db no se ve
      afectado por intentos de login fallidos."""
      for _ in range(6):
          await client.post("/auth/login", data={"username": "admin", "password": "wrong"})
      r = await client.get("/health")
      assert r.status_code == 200
  ```

  Correr → rojo.

- [ ] **2.6.2** Reescribir `core/middleware.py.SimpleRateLimitMiddleware`:

  ```python
  import asyncio
  from collections import defaultdict
  from time import monotonic

  from fastapi import Request, status
  from fastapi.responses import JSONResponse
  from starlette.middleware.base import BaseHTTPMiddleware

  from bomberos_api.config import get_settings
  from bomberos_api.core.request_utils import client_ip
  from bomberos_api.logging import get_logger

  log = get_logger("middleware")


  class _Bucket:
      """Bucket sliding-window in-memory por clave."""
      __slots__ = ("limit", "window", "hits", "_lock")

      def __init__(self, limit: int, window_s: float):
          self.limit = limit
          self.window = window_s
          self.hits: dict[str, list[float]] = defaultdict(list)
          self._lock = asyncio.Lock()

      async def check(self, key: str, now: float) -> bool:
          """Devuelve True si la request está permitida; False si excede."""
          async with self._lock:
              bucket = self.hits[key]
              cutoff = now - self.window
              bucket[:] = [t for t in bucket if t > cutoff]
              if len(bucket) >= self.limit:
                  return False
              bucket.append(now)
              return True

      async def sweep(self, now: float) -> None:
          """Elimina claves vacías para evitar memory leak."""
          cutoff = now - self.window
          async with self._lock:
              dead = [k for k, v in self.hits.items() if not v or max(v) < cutoff]
              for k in dead:
                  self.hits.pop(k, None)


  class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
      """Rate limiting in-memory con buckets separados.

      - Bucket global: per_minute hits / IP en cualquier endpoint.
      - Bucket login_ip: 5 hits / IP en /auth/login (más estricto).
      - Bucket login_user: 5 hits / username en /auth/login.

      Barrido periódico cada 60s del diccionario interno para evitar leaks.
      """

      def __init__(self, app, per_minute: int = 120, login_per_minute: int = 5):
          super().__init__(app)
          self.global_bucket = _Bucket(limit=per_minute, window_s=60.0)
          self.login_ip_bucket = _Bucket(limit=login_per_minute, window_s=60.0)
          self.login_user_bucket = _Bucket(limit=login_per_minute, window_s=60.0)
          self._last_sweep = monotonic()
          self._sweep_interval = 60.0

      async def _maybe_sweep(self, now: float) -> None:
          if now - self._last_sweep < self._sweep_interval:
              return
          self._last_sweep = now
          for b in (self.global_bucket, self.login_ip_bucket, self.login_user_bucket):
              await b.sweep(now)

      async def dispatch(self, request: Request, call_next):
          path = request.url.path
          if path in {"/health", "/health/db", "/docs", "/openapi.json", "/redoc"}:
              return await call_next(request)

          now = monotonic()
          await self._maybe_sweep(now)

          ip = client_ip(request) or "unknown"

          # Bucket especializado para /auth/login
          if path == "/auth/login" and request.method == "POST":
              if not await self.login_ip_bucket.check(f"ip:{ip}", now):
                  log.warning("login_rate_limit_ip", ip=ip)
                  return self._too_many("Demasiados intentos de login desde esta IP. Espera 1 minuto.")
              # Intentamos leer el username del form sin consumir el body permanentemente
              try:
                  form = await request.form()
                  username = (form.get("username") or "").strip().lower()
              except Exception:
                  username = ""
              if username and not await self.login_user_bucket.check(f"u:{username}", now):
                  log.warning("login_rate_limit_user", username=username, ip=ip)
                  return self._too_many("Demasiados intentos para esta cuenta. Espera 1 minuto.")

          if not await self.global_bucket.check(ip, now):
              log.warning("rate_limit_exceeded", ip=ip)
              return self._too_many("Demasiadas solicitudes. Intenta en 1 minuto.")

          return await call_next(request)

      @staticmethod
      def _too_many(detail: str) -> JSONResponse:
          return JSONResponse(
              status_code=status.HTTP_429_TOO_MANY_REQUESTS,
              content={"detail": detail},
              headers={"Retry-After": "60"},
          )
  ```

  **Caveat técnico:** `await request.form()` consume el body. Starlette permite re-leerlo si se hace cuidadosamente, pero para no romper el flujo, mejor leer del cuerpo con `await request.body()` y dejar que FastAPI reuse. Implementación alternativa segura: leer body raw, parsearlo y re-inyectarlo. **Si el test 2.6.1 falla por este motivo**, mover el rate-limit por username al propio router `login` (helper `_check_login_user_limit(username)` llamado al inicio del handler).

- [ ] **2.6.3** Plan B si `request.form()` rompe el handler — extraer la lógica `login_user_bucket.check` a un helper y llamarlo desde `routers/auth.py.login` ANTES de cualquier query a BD:

  ```python
  # En routers/auth.py, importar el middleware singleton expuesto en main.py:
  from bomberos_api.core.middleware import get_login_user_bucket

  async def login(...):
      now = monotonic()
      bucket = get_login_user_bucket()
      if not await bucket.check(f"u:{form.username.strip().lower()}", now):
          raise HTTPException(status_code=429, detail="Demasiados intentos para esta cuenta.")
      # ... resto
  ```

  Añadir en `core/middleware.py`:

  ```python
  _login_user_bucket: _Bucket | None = None

  def init_login_user_bucket(limit: int = 5) -> _Bucket:
      global _login_user_bucket
      _login_user_bucket = _Bucket(limit=limit, window_s=60.0)
      return _login_user_bucket

  def get_login_user_bucket() -> _Bucket:
      assert _login_user_bucket is not None, "init_login_user_bucket no fue llamado"
      return _login_user_bucket
  ```

  En `main.py` llamar `init_login_user_bucket()` al inicializar la app.

- [ ] **2.6.4** Actualizar `main.py` para registrar el middleware y la fixture de buckets:

  ```python
  from bomberos_api.core.middleware import (
      SimpleRateLimitMiddleware, init_login_user_bucket,
  )

  init_login_user_bucket(limit=5)
  app.add_middleware(SimpleRateLimitMiddleware, per_minute=120, login_per_minute=5)
  ```

- [ ] **2.6.5** Re-correr `pytest tests/test_rate_limit.py -v` → verde. Si los 5/min fueron muy estrictos para otros tests, ajustar fixture `client` para resetear los buckets entre tests:

  ```python
  @pytest.fixture(autouse=True)
  def _reset_rate_limit_buckets():
      from bomberos_api.core.middleware import (
          _login_user_bucket,
      )
      if _login_user_bucket:
          _login_user_bucket.hits.clear()
      yield
  ```

- [ ] **2.6.6** Commit: `git commit -m "security: 2.6 rate-limit dedicado para /auth/login (P1-6)"`.

---

### Tarea 2.7 — Refactor anti-pattern `Annotated[..., Depends()] = ...` (P1-7)

**Contexto:** En `routers/ops.py:127` y `routers/equipo.py:136` se usa:

```python
async def marcar_asistencia(
    ...,
    asistio: bool,
    motivo_inasistencia: str | None = None,
    db: DbSession = ...,
    user: CurrentUser = ...,
):
```

`DbSession` y `CurrentUser` son `Annotated[..., Depends()]`. Asignarles `= ...` es válido sintácticamente pero el comportamiento de FastAPI puede cambiar en upgrades — además los parámetros `asistio` y `motivo_inasistencia` quedan como query params, lo cual es incorrecto para una operación de mutación (deberían ir en body).

**Files:**
- `apps/api/src/bomberos_api/routers/ops.py`
- `apps/api/src/bomberos_api/routers/equipo.py`
- `apps/api/src/bomberos_api/schemas/ops.py`
- `apps/api/src/bomberos_api/schemas/equipo.py`
- `apps/api/tests/test_ops_asistencia.py` (extender o crear)
- `apps/api/tests/test_equipo_devolucion.py` (extender o crear)

**Steps:**

- [ ] **2.7.1** TDD: crear/extender `apps/api/tests/test_ops_asistencia.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_marcar_asistencia_acepta_body_json(client, operador_token, seed_guardia):
      gid, gfid = seed_guardia
      r = await client.patch(
          f"/ops/guardias/{gid}/funcionarios/{gfid}/asistencia",
          headers={"Authorization": f"Bearer {operador_token}"},
          json={"asistio": True, "motivo_inasistencia": None},
      )
      assert r.status_code == 200
      assert r.json()["asistio"] is True

  async def test_marcar_asistencia_rechaza_query_params(client, operador_token, seed_guardia):
      """Pasar asistio como query debe ser ignorado / rechazado, no aceptado."""
      gid, gfid = seed_guardia
      r = await client.patch(
          f"/ops/guardias/{gid}/funcionarios/{gfid}/asistencia?asistio=true",
          headers={"Authorization": f"Bearer {operador_token}"},
      )
      assert r.status_code == 422  # missing body
  ```

  Correr → rojo.

- [ ] **2.7.2** Añadir schema en `schemas/ops.py`:

  ```python
  class MarcarAsistenciaIn(BaseModel):
      model_config = ConfigDict(extra="forbid")
      asistio: bool
      motivo_inasistencia: str | None = Field(default=None, max_length=255)
  ```

- [ ] **2.7.3** Reescribir `routers/ops.py.marcar_asistencia`:

  ```python
  from bomberos_api.schemas.ops import MarcarAsistenciaIn

  @router.patch(
      "/guardias/{guardia_id}/funcionarios/{gf_id}/asistencia",
      dependencies=[Depends(require_role("OPERADOR", "ADMIN"))],
  )
  async def marcar_asistencia(
      request: Request,
      guardia_id: int,
      gf_id: int,
      payload: MarcarAsistenciaIn,
      db: DbSession,
      user: CurrentUser,
  ):
      await set_audit_ctx(db, user.id, client_ip(request))
      gf = await db.scalar(
          select(GuardiaFuncionario).where(
              GuardiaFuncionario.id == gf_id,
              GuardiaFuncionario.guardia_id == guardia_id,
          )
      )
      if gf is None:
          raise not_found("Asignación")
      gf.asistio = payload.asistio
      gf.motivo_inasistencia = payload.motivo_inasistencia
      await db.flush()
      return {"id": gf.id, "asistio": gf.asistio}
  ```

- [ ] **2.7.4** Análogamente en `schemas/equipo.py`:

  ```python
  class DevolverProteccionIn(BaseModel):
      model_config = ConfigDict(extra="forbid")
      estado_devolucion: str | None = Field(default=None, max_length=255)
      fecha_devolucion: date | None = None
  ```

  Y en `routers/equipo.py.devolver_proteccion`:

  ```python
  from bomberos_api.schemas.equipo import DevolverProteccionIn

  @router.post(
      "/proteccion/asignaciones/{asignacion_id}/devolver",
      response_model=ProteccionAsignacionOut,
      dependencies=[Depends(require_role("LOGISTICA", "ADMIN"))],
  )
  async def devolver_proteccion(
      request: Request,
      asignacion_id: int,
      payload: DevolverProteccionIn,
      db: DbSession,
      user: CurrentUser,
  ):
      from datetime import date as _d
      await set_audit_ctx(db, user.id, client_ip(request))
      a = await db.scalar(
          select(ProteccionAsignacion).where(ProteccionAsignacion.id == asignacion_id)
      )
      if a is None:
          raise not_found("Asignación")
      if a.devuelto:
          raise HTTPException(status_code=400, detail="Ya estaba devuelto")
      a.fecha_devolucion = payload.fecha_devolucion or _d.today()
      a.estado_devolucion = payload.estado_devolucion
      a.devuelto = True
      inv = await db.scalar(
          select(ProteccionInventario).where(ProteccionInventario.id == a.inventario_id)
      )
      if inv:
          inv.estatus = "DISPONIBLE"
      await db.flush()
      return ProteccionAsignacionOut.model_validate(a)
  ```

- [ ] **2.7.5** Actualizar el frontend si llamaba a estos endpoints con query string:

  ```bash
  grep -rn "asistencia\?asistio" apps/web/src/
  grep -rn "devolver" apps/web/src/app/(app)/equipo/
  ```

  Corregir a `body: JSON.stringify({asistio, motivo_inasistencia})`.

- [ ] **2.7.6** Re-correr `pytest tests/test_ops_asistencia.py tests/test_equipo_devolucion.py -v` → verde.

- [ ] **2.7.7** Commit: `git commit -m "security: 2.7 mover params a body Pydantic en asistencia/devolución (P1-7)"`.

---

## Bloque C — Frontend hardening

### Tarea 2.8 — Helper `requireServerRole` en server actions de admin (P1-10)

**Contexto:** Las server actions de `/admin/*` solo validan `requireAuth()` — un usuario autenticado de cualquier rol puede invocarlas vía POST directo. La página tiene gate por rol, pero el endpoint server action no.

**Files:**
- `apps/web/src/lib/session.ts`
- `apps/web/src/app/(app)/admin/**/actions.ts` (todos)
- `apps/web/src/__tests__/requireServerRole.test.ts` (nuevo)

**Steps:**

- [ ] **2.8.1** TDD: crear `apps/web/src/__tests__/requireServerRole.test.ts`:

  ```ts
  import { describe, it, expect, vi } from "vitest";
  import { requireServerRole } from "@/lib/session";

  vi.mock("@/lib/api", () => ({
    api: { get: vi.fn() },
  }));
  vi.mock("@/lib/session", async (orig) => {
    const real = await orig<typeof import("@/lib/session")>();
    return { ...real, requireAuth: vi.fn().mockResolvedValue("fake-token") };
  });

  describe("requireServerRole", () => {
    it("acepta si el usuario tiene uno de los roles requeridos", async () => {
      const { api } = await import("@/lib/api");
      (api.get as any).mockResolvedValueOnce({ id: 1, roles: ["ADMIN"] });
      const r = await requireServerRole(["ADMIN", "SUPER_ADMIN"]);
      expect(r.token).toBe("fake-token");
    });

    it("lanza si el usuario no tiene rol requerido", async () => {
      const { api } = await import("@/lib/api");
      (api.get as any).mockResolvedValueOnce({ id: 1, roles: ["OPERADOR"] });
      await expect(requireServerRole(["ADMIN"])).rejects.toThrow(/permis/i);
    });
  });
  ```

  Correr `cd apps/web && npm test -- requireServerRole` → rojo.

- [ ] **2.8.2** Añadir helper en `apps/web/src/lib/session.ts`:

  ```ts
  import { api } from "@/lib/api";

  export type SessionUser = {
    id: number;
    usuario: string;
    nombre_completo: string;
    roles: string[];
  };

  /**
   * Valida que el usuario autenticado tenga al menos uno de los roles indicados.
   * Lanza Error con mensaje neutro si no.
   *
   * Defense in depth: el backend también valida con require_role(...).
   * Este check evita golpear el backend con payloads inválidos.
   */
  export async function requireServerRole(
    allowedRoles: readonly string[],
  ): Promise<{ token: string; user: SessionUser }> {
    const token = await requireAuth();
    let me: SessionUser;
    try {
      me = await api.get<SessionUser>("/auth/me", token);
    } catch {
      throw new Error("Sesión inválida");
    }
    const ok = me.roles.some((r) => allowedRoles.includes(r));
    if (!ok) {
      throw new Error("No tienes permiso para realizar esta acción");
    }
    return { token, user: me };
  }
  ```

  (`requireAuth` ya existe en el archivo desde Sprint 1.)

- [ ] **2.8.3** Aplicar en cada server action de `(app)/admin/**/actions.ts`. Ejemplo para `admin/usuarios/nuevo/actions.ts`:

  ```ts
  "use server";

  import { redirect } from "next/navigation";
  import { revalidatePath } from "next/cache";
  import { api, ApiError } from "@/lib/api";
  import { requireServerRole } from "@/lib/session";

  export type NuevoUsuarioState = { error?: string; ok?: boolean };

  const ALLOWED = ["ADMIN", "SUPER_ADMIN"] as const;

  export async function crearUsuario(
    _prev: NuevoUsuarioState,
    formData: FormData,
  ): Promise<NuevoUsuarioState> {
    let session;
    try {
      session = await requireServerRole(ALLOWED);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Sin permiso" };
    }

    // ... validación zod (tarea 2.9) y llamada a api.post con session.token
  }
  ```

  Hacer este reemplazo en **todas** estas rutas (lista completa):

  ```
  apps/web/src/app/(app)/admin/campos-custom/actions.ts
  apps/web/src/app/(app)/admin/catalogos/actions.ts
  apps/web/src/app/(app)/admin/modulos/actions.ts
  apps/web/src/app/(app)/admin/organizacion/actions.ts
  apps/web/src/app/(app)/admin/parametros/actions.ts
  apps/web/src/app/(app)/admin/permisos/actions.ts
  apps/web/src/app/(app)/admin/roles/actions.ts
  apps/web/src/app/(app)/admin/usuarios/[id]/actions.ts
  apps/web/src/app/(app)/admin/usuarios/nuevo/actions.ts
  ```

- [ ] **2.8.4** Verificación grep — ninguna server action de admin queda con solo `requireAuth`:

  ```bash
  for f in apps/web/src/app/\(app\)/admin/**/actions.ts; do
    if grep -L "requireServerRole" "$f"; then
      echo "FALTA: $f"
    fi
  done
  ```

  Si lista algo, completar el reemplazo.

- [ ] **2.8.5** Re-correr `npm test -- requireServerRole` → verde. Smoke test manual: usuario OPERADOR intenta `POST /admin/usuarios` desde devtools → 403 con mensaje neutro.

- [ ] **2.8.6** Commit: `git commit -m "security: 2.8 requireServerRole en server actions de admin (P1-10)"`.

---

### Tarea 2.9 — Validación zod en server actions (P1-11)

**Contexto:** `zod` está en `package.json` pero no se usa. Las server actions hacen `String(formData.get("x"))`, `Number(formData.get("y"))` y validan con regex sueltas dispersas. Necesitamos un schema por action.

**Files:**
- `apps/web/src/lib/schemas/admin.ts` (nuevo)
- `apps/web/src/lib/schemas/funcionarios.ts` (nuevo)
- `apps/web/src/lib/schemas/ops.ts` (nuevo)
- `apps/web/src/lib/schemas/equipo.ts` (nuevo)
- `apps/web/src/lib/schemas/salud.ts` (nuevo)
- `apps/web/src/lib/schemas/carrera.ts` (nuevo)
- `apps/web/src/lib/schemas/beneficios.ts` (nuevo)
- `apps/web/src/app/(app)/**/actions.ts` (todos)
- `apps/web/src/__tests__/schemas.test.ts` (nuevo)

**Steps:**

- [ ] **2.9.1** TDD: `apps/web/src/__tests__/schemas.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { nuevoUsuarioSchema } from "@/lib/schemas/admin";

  describe("nuevoUsuarioSchema", () => {
    it("rechaza password débil", () => {
      const r = nuevoUsuarioSchema.safeParse({
        usuario: "abc", nombre_completo: "Juan", password: "123", roles: [],
      });
      expect(r.success).toBe(false);
    });
    it("rechaza usuario con espacios", () => {
      const r = nuevoUsuarioSchema.safeParse({
        usuario: "con espacios", nombre_completo: "Juan",
        password: "Pass#2026Largo", roles: [],
      });
      expect(r.success).toBe(false);
    });
    it("acepta payload completo", () => {
      const r = nuevoUsuarioSchema.safeParse({
        usuario: "juan.perez", nombre_completo: "Juan Pérez",
        correo: "juan@bomberos.gov.ve",
        password: "Pass#2026Largo", roles: ["OPERADOR"],
      });
      expect(r.success).toBe(true);
    });
    it("rechaza rol desconocido", () => {
      const r = nuevoUsuarioSchema.safeParse({
        usuario: "juan", nombre_completo: "Juan",
        password: "Pass#2026Largo", roles: ["HACKER"],
      });
      expect(r.success).toBe(false);
    });
  });
  ```

  Correr → rojo.

- [ ] **2.9.2** Crear `apps/web/src/lib/schemas/_common.ts`:

  ```ts
  import { z } from "zod";

  export const strongPassword = z.string()
    .min(10, "Mínimo 10 caracteres")
    .regex(/[A-Z]/, "Requiere mayúscula")
    .regex(/[a-z]/, "Requiere minúscula")
    .regex(/\d/, "Requiere dígito")
    .regex(/[^A-Za-z0-9]/, "Requiere carácter especial");

  export const usernameSlug = z.string()
    .min(3).max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Solo letras, dígitos, _, . o -");

  export const ROLES_CONOCIDOS = [
    "SUPER_ADMIN", "ADMIN", "OPERADOR", "LOGISTICA",
    "RRHH", "MEDICO", "CARRERA", "BENEFICIOS", "EGRESOS",
  ] as const;
  export type RolConocido = (typeof ROLES_CONOCIDOS)[number];

  export const rolesSchema = z.array(z.enum(ROLES_CONOCIDOS));

  export const idPositivo = z.coerce.number().int().positive();

  export const fechaIso = z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD",
  );

  /** Helper para parsear FormData a un objeto plano. */
  export function formToObject(fd: FormData): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of new Set(Array.from(fd.keys()))) {
      const all = fd.getAll(key);
      out[key] = all.length === 1 ? all[0] : all;
    }
    return out;
  }
  ```

- [ ] **2.9.3** Crear `apps/web/src/lib/schemas/admin.ts`:

  ```ts
  import { z } from "zod";
  import { rolesSchema, strongPassword, usernameSlug } from "./_common";

  export const nuevoUsuarioSchema = z.object({
    usuario: usernameSlug,
    nombre_completo: z.string().min(3).max(100),
    correo: z.string().email().nullable().or(z.literal("").transform(() => null)),
    funcionario_id: z.coerce.number().int().positive().optional().nullable(),
    password: strongPassword,
    roles: rolesSchema.default([]),
  });
  export type NuevoUsuarioInput = z.infer<typeof nuevoUsuarioSchema>;

  export const editarUsuarioSchema = z.object({
    nombre_completo: z.string().min(3).max(100).optional(),
    correo: z.string().email().nullable().optional(),
    activo: z.coerce.boolean().optional(),
    bloqueado: z.coerce.boolean().optional(),
    motivo_bloqueo: z.string().max(255).nullable().optional(),
  });
  export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

  export const resetPasswordSchema = z.object({
    password_nuevo: strongPassword,
  });
  ```

- [ ] **2.9.4** Crear schemas por dominio: ejemplo `apps/web/src/lib/schemas/funcionarios.ts`:

  ```ts
  import { z } from "zod";
  import { fechaIso, idPositivo } from "./_common";

  export const nuevoFuncionarioSchema = z.object({
    nacionalidad: z.enum(["V", "E"]),
    cedula: z.coerce.number().int().positive().max(999_999_999),
    nombres: z.string().min(2).max(100),
    apellidos: z.string().min(2).max(100),
    fecha_nacimiento: fechaIso.optional(),
    sexo: z.enum(["M", "F"]).optional(),
    telefono_movil: z.string().max(30).optional().nullable(),
    correo: z.string().email().optional().nullable(),
    zona_id: idPositivo.optional().nullable(),
    estacion_id: idPositivo.optional().nullable(),
    jerarquia_id: idPositivo.optional().nullable(),
  });
  ```

  Análogamente para `ops`, `equipo`, `salud`, `carrera`, `beneficios`. Cada uno cubre las server actions correspondientes. (El plan no transcribe todos por brevedad — el patrón es idéntico.)

- [ ] **2.9.5** Refactorizar cada `actions.ts` para usar `safeParse`. Ejemplo completo de `admin/usuarios/nuevo/actions.ts` integrando 2.8 + 2.9:

  ```ts
  "use server";

  import { redirect } from "next/navigation";
  import { revalidatePath } from "next/cache";
  import { isRedirectError } from "next/dist/client/components/redirect";
  import { api, ApiError } from "@/lib/api";
  import { requireServerRole } from "@/lib/session";
  import { formToObject } from "@/lib/schemas/_common";
  import { nuevoUsuarioSchema } from "@/lib/schemas/admin";

  export type NuevoUsuarioState = { error?: string; ok?: boolean };

  const ALLOWED = ["ADMIN", "SUPER_ADMIN"] as const;

  export async function crearUsuario(
    _prev: NuevoUsuarioState,
    formData: FormData,
  ): Promise<NuevoUsuarioState> {
    let session;
    try {
      session = await requireServerRole(ALLOWED);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Sin permiso" };
    }

    const parsed = nuevoUsuarioSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { error: `${first.path.join(".")}: ${first.message}` };
    }

    try {
      const created = await api.post<{ id: number }>(
        "/admin/usuarios", parsed.data, session.token,
      );
      revalidatePath("/admin/usuarios");
      redirect(`/admin/usuarios/${created.id}`);
    } catch (e) {
      if (isRedirectError(e)) throw e;
      if (e instanceof ApiError) return { error: e.message };
      return { error: e instanceof Error ? e.message : "Error al crear usuario" };
    }
  }
  ```

  **Nota:** sustituir el chequeo `e.message === "NEXT_REDIRECT"` por `isRedirectError(e)` solo en archivos que ya se toquen (alcance de Sprint 2: las server actions modificadas). El barrido global queda para Sprint 3 / P3-4.

- [ ] **2.9.6** Repetir el patrón en **todas** las server actions listadas en 2.8.3 más las no-admin:

  ```
  apps/web/src/app/(app)/funcionarios/nuevo/actions.ts
  apps/web/src/app/(app)/funcionarios/[id]/editar/actions.ts
  apps/web/src/app/(app)/funcionarios/[id]/acciones/actions.ts
  apps/web/src/app/(app)/salud/reposos/nuevo/actions.ts
  apps/web/src/app/(app)/salud/reposos/[id]/editar/actions.ts
  apps/web/src/app/(app)/ops/guardias/nuevo/actions.ts
  apps/web/src/app/(app)/ops/permisos/nuevo/actions.ts
  apps/web/src/app/(app)/ops/permisos/[id]/editar/actions.ts
  apps/web/src/app/(app)/ops/vacaciones/nuevo/actions.ts
  apps/web/src/app/(app)/ops/vacaciones/[id]/editar/actions.ts
  apps/web/src/app/(app)/ops/comisiones/nuevo/actions.ts
  apps/web/src/app/(app)/ops/faltas/nuevo/actions.ts
  apps/web/src/app/(app)/carrera/cursos/nuevo/actions.ts
  apps/web/src/app/(app)/carrera/ascensos/nuevo/actions.ts
  apps/web/src/app/(app)/equipo/proteccion/nuevo/actions.ts
  apps/web/src/app/(app)/equipo/proteccion/[id]/asignar/actions.ts
  apps/web/src/app/(app)/equipo/proteccion/asignaciones/actions.ts
  apps/web/src/app/(app)/equipo/radios/nuevo/actions.ts
  apps/web/src/app/(app)/equipo/radios/[id]/asignar/actions.ts
  apps/web/src/app/(app)/beneficios/nuevo/actions.ts
  apps/web/src/app/(app)/beneficios/[id]/editar/actions.ts
  apps/web/src/app/(app)/perfil/actions.ts
  ```

  Para las no-admin, usar `requireAuth()` directo (no `requireServerRole`) salvo que la acción requiera rol específico.

- [ ] **2.9.7** Verificación grep — ninguna action queda sin zod:

  ```bash
  for f in $(find apps/web/src/app -name actions.ts); do
    if ! grep -q "safeParse\|parseAsync" "$f" 2>/dev/null; then
      # excluir actions de login/logout/etc que no toman input estructurado
      if ! grep -q "FormData" "$f"; then continue; fi
      echo "FALTA ZOD: $f"
    fi
  done
  ```

- [ ] **2.9.8** Correr `npm test` y `npm run typecheck` → verde.

- [ ] **2.9.9** Commit: `git commit -m "security: 2.9 validación zod en server actions (P1-11)"`.

---

## Bloque D — Base de datos

### Tarea 2.10 — Cifrar `mfa_secret` y `token_recuperacion` con pgcrypto (P1-12)

**Contexto:** `seguridad.usuarios.mfa_secret` y `seguridad.usuarios.token_recuperacion` viajan en texto plano. `pgcrypto` ya está cargado en el cluster pero no se usa. Si la BD se filtra (dump robado, conexión directa de un admin), un atacante extrae los secretos MFA y se autentica como cualquier usuario que tenga MFA activo.

**Decisión:** cifrar simétricamente con `pgp_sym_encrypt(value, current_setting('app.kms_key'))`. La clave vive en `/etc/bomberos/kms.key` con perms 600 root y se inyecta en el entorno como `KMS_KEY`. En cada sesión se hace `SELECT set_config('app.kms_key', :v, false)` (no `LOCAL` porque debe sobrevivir transacciones del request).

**Files:**
- `apps/api/src/bomberos_api/database.py`
- `apps/api/src/bomberos_api/config.py`
- `apps/api/alembic/versions/<nuevo>_cifrar_secretos.py` (nuevo)
- `sql/01_base.sql` (documentación)
- `apps/api/src/bomberos_api/models/usuario.py` (si se persiste el secret)
- `apps/api/tests/test_cifrado_secretos.py` (nuevo)

**Steps:**

- [ ] **2.10.1** Añadir en `config.py`:

  ```python
  kms_key: str = Field(
      ...,
      min_length=32,
      description="Clave simétrica para cifrar mfa_secret y token_recuperacion. "
                  "Generar con: python -c 'import secrets;print(secrets.token_urlsafe(48))'. "
                  "Custodia: /etc/bomberos/kms.key (root 600).",
  )
  ```

- [ ] **2.10.2** Inyectar en cada sesión PG (en `database.py`, factory de sesiones):

  ```python
  from sqlalchemy import event

  @event.listens_for(engine.sync_engine, "connect")
  def _on_connect(dbapi_connection, _):
      with dbapi_connection.cursor() as cur:
          # SET local-session GUC accesible vía current_setting
          cur.execute("SELECT set_config('app.kms_key', %s, false)", (get_settings().kms_key,))
  ```

  Si el engine es async, usar el equivalente `sqlalchemy.ext.asyncio.AsyncEngine.sync_engine` y registrar el event antes del primer connect.

- [ ] **2.10.3** Crear migración Alembic `cifrar_secretos`:

  ```python
  def upgrade() -> None:
      op.execute("""
      -- 1) renombrar columnas viejas
      ALTER TABLE seguridad.usuarios RENAME COLUMN mfa_secret TO mfa_secret_legacy;
      ALTER TABLE seguridad.usuarios RENAME COLUMN token_recuperacion TO token_recuperacion_legacy;

      -- 2) crear columnas bytea cifradas
      ALTER TABLE seguridad.usuarios ADD COLUMN mfa_secret_enc BYTEA NULL;
      ALTER TABLE seguridad.usuarios ADD COLUMN token_recuperacion_enc BYTEA NULL;

      -- 3) migrar valores existentes (si los hubiera) — usa la kms_key de la sesión actual
      UPDATE seguridad.usuarios
         SET mfa_secret_enc = pgp_sym_encrypt(mfa_secret_legacy, current_setting('app.kms_key'))
       WHERE mfa_secret_legacy IS NOT NULL;
      UPDATE seguridad.usuarios
         SET token_recuperacion_enc = pgp_sym_encrypt(token_recuperacion_legacy, current_setting('app.kms_key'))
       WHERE token_recuperacion_legacy IS NOT NULL;

      -- 4) eliminar columnas legacy
      ALTER TABLE seguridad.usuarios DROP COLUMN mfa_secret_legacy;
      ALTER TABLE seguridad.usuarios DROP COLUMN token_recuperacion_legacy;
      """)

  def downgrade() -> None:
      op.execute("""
      ALTER TABLE seguridad.usuarios ADD COLUMN mfa_secret TEXT NULL;
      ALTER TABLE seguridad.usuarios ADD COLUMN token_recuperacion TEXT NULL;
      UPDATE seguridad.usuarios
         SET mfa_secret = pgp_sym_decrypt(mfa_secret_enc, current_setting('app.kms_key'))
       WHERE mfa_secret_enc IS NOT NULL;
      UPDATE seguridad.usuarios
         SET token_recuperacion = pgp_sym_decrypt(token_recuperacion_enc, current_setting('app.kms_key'))
       WHERE token_recuperacion_enc IS NOT NULL;
      ALTER TABLE seguridad.usuarios DROP COLUMN mfa_secret_enc;
      ALTER TABLE seguridad.usuarios DROP COLUMN token_recuperacion_enc;
      """)
  ```

  **Importante:** la migración requiere que la sesión Alembic tenga `app.kms_key` seteado. Pasar `-x kms_key=<value>` o setearlo en `env.py`:

  ```python
  # alembic/env.py
  import os
  context.execute(f"SELECT set_config('app.kms_key', '{os.environ['KMS_KEY']}', false)")
  ```

- [ ] **2.10.4** Actualizar el modelo `models/usuario.py`:

  ```python
  from sqlalchemy import LargeBinary

  class Usuario(Base):
      # ...
      mfa_secret_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
      token_recuperacion_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
  ```

  Eliminar referencias al campo `mfa_secret` y `token_recuperacion` plano.

- [ ] **2.10.5** Helper en `core/security.py`:

  ```python
  async def cifrar_secreto(db, plain: str) -> bytes:
      """Cifra un secreto usando pgp_sym_encrypt con la kms_key de la sesión."""
      from sqlalchemy import text
      r = await db.scalar(
          text("SELECT pgp_sym_encrypt(:v, current_setting('app.kms_key'))")
          .bindparams(v=plain)
      )
      return r

  async def descifrar_secreto(db, cipher: bytes) -> str | None:
      from sqlalchemy import text
      if cipher is None:
          return None
      r = await db.scalar(
          text("SELECT pgp_sym_decrypt(:v, current_setting('app.kms_key'))")
          .bindparams(v=cipher)
      )
      return r
  ```

- [ ] **2.10.6** TDD: `apps/api/tests/test_cifrado_secretos.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_pgp_sym_roundtrip(db_session):
      from sqlalchemy import text
      r = await db_session.scalar(
          text("SELECT pgp_sym_decrypt(pgp_sym_encrypt(:v, current_setting('app.kms_key')), "
               "current_setting('app.kms_key'))").bindparams(v="JBSWY3DPEHPK3PXP")
      )
      assert r == "JBSWY3DPEHPK3PXP"

  async def test_no_plain_columns_remain(db_session):
      from sqlalchemy import text
      cols = (await db_session.execute(
          text("""SELECT column_name FROM information_schema.columns
                   WHERE table_schema='seguridad' AND table_name='usuarios'""")
      )).scalars().all()
      assert "mfa_secret" not in cols
      assert "token_recuperacion" not in cols
      assert "mfa_secret_enc" in cols
      assert "token_recuperacion_enc" in cols
  ```

  Correr → verde si la migración corrió.

- [ ] **2.10.7** Documentar en `docs/SECRETS.md` (crear si no existe):

  ```markdown
  ## KMS_KEY

  Clave simétrica para cifrar `mfa_secret` y `token_recuperacion`.

  - **Generación:** `python -c "import secrets;print(secrets.token_urlsafe(48))"`.
  - **Custodia:** `/etc/bomberos/kms.key` (root, perms 600).
  - **Inyección:** la app lee `KMS_KEY` del entorno (export desde `env_file`).
  - **Rotación:** ver `docs/RUNBOOK.md` sección "Rotar KMS_KEY".
  - **Pérdida:** sin esta clave, los secretos cifrados son irrecuperables. Mantener copia en bóveda física.
  ```

- [ ] **2.10.8** Commit: `git commit -m "security: 2.10 cifrar mfa_secret y token_recuperacion con pgcrypto (P1-12)"`.

---

### Tarea 2.11 — `security_invoker=true` en vistas (P1-13)

**Contexto:** En PostgreSQL 16, las vistas corren por defecto con privilegios del owner (típicamente `postgres` superuser). Con RLS activo (Sprint 1), las vistas **bypasean** las policies de las tablas subyacentes. La solución es activar `security_invoker = true` en cada vista de datos personales.

**Files:**
- `sql/03_funciones_vistas.sql`
- `apps/api/alembic/versions/<nuevo>_security_invoker_vistas.py` (nuevo)
- `apps/api/tests/test_rls_views.py` (nuevo)

**Steps:**

- [ ] **2.11.1** Crear migración Alembic:

  ```python
  def upgrade() -> None:
      op.execute("""
      ALTER VIEW personal.v_funcionarios_completo SET (security_invoker = true);
      ALTER VIEW salud.v_reposos_activos          SET (security_invoker = true);
      ALTER VIEW ops.v_vacaciones_actuales        SET (security_invoker = true);
      ALTER VIEW personal.v_distribucion_zona     SET (security_invoker = true);
      ALTER VIEW equipo.v_inventario_disponible   SET (security_invoker = true);
      ALTER VIEW sys.v_dashboard                  SET (security_invoker = true);
      """)
      # Si existen vistas adicionales descubiertas en el grep del paso 2.11.2,
      # añadirlas aquí.

  def downgrade() -> None:
      op.execute("""
      ALTER VIEW personal.v_funcionarios_completo SET (security_invoker = false);
      ALTER VIEW salud.v_reposos_activos          SET (security_invoker = false);
      ALTER VIEW ops.v_vacaciones_actuales        SET (security_invoker = false);
      ALTER VIEW personal.v_distribucion_zona     SET (security_invoker = false);
      ALTER VIEW equipo.v_inventario_disponible   SET (security_invoker = false);
      ALTER VIEW sys.v_dashboard                  SET (security_invoker = false);
      """)
  ```

- [ ] **2.11.2** Descubrir vistas adicionales (algunas se crearon en Sprint 1 o son adicionales):

  ```bash
  grep -nE "^CREATE OR REPLACE VIEW|^CREATE VIEW" sql/03_funciones_vistas.sql sql/06_seguridad_rls.sql
  ```

  Para cada vista listada que toque tablas con RLS, agregarla al `ALTER VIEW ... SET (security_invoker=true)` en la migración.

- [ ] **2.11.3** Modificar `sql/03_funciones_vistas.sql` para que las vistas nuevas se creen ya con la opción:

  ```sql
  CREATE OR REPLACE VIEW personal.v_funcionarios_completo
  WITH (security_invoker = true)
  AS
  SELECT
      f.id,
      ...
  FROM personal.funcionarios f
  ...;
  ```

  Aplicar en las 6 vistas listadas (más las descubiertas en 2.11.2). Verificar que `CREATE OR REPLACE VIEW ... WITH (...)` es la sintaxis correcta para PG 16 — sí lo es.

- [ ] **2.11.4** TDD: `apps/api/tests/test_rls_views.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  async def test_all_personal_data_views_use_security_invoker(db_session):
      from sqlalchemy import text
      rows = (await db_session.execute(text("""
          SELECT n.nspname || '.' || c.relname AS qualname,
                 (SELECT option_value
                    FROM unnest(c.reloptions) opt(option_value)
                   WHERE option_value LIKE 'security_invoker=%') AS opt
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind = 'v'
             AND n.nspname IN ('personal','salud','ops','carrera',
                               'beneficios','egresos','equipo','sys')
      """))).all()
      bad = [r for r in rows if r.opt != "security_invoker=true"]
      assert not bad, f"Vistas sin security_invoker: {[r.qualname for r in bad]}"
  ```

  Aplicar la migración → re-correr el test → verde.

- [ ] **2.11.5** Commit: `git commit -m "security: 2.11 security_invoker=true en vistas (P1-13)"`.

---

### Tarea 2.12 — `SET search_path` fijo en funciones (P1-14)

**Contexto:** Funciones SQL/PLPGSQL sin `SET search_path` heredan el path del caller. Si alguna se vuelve `SECURITY DEFINER` en el futuro, un atacante con `CREATE` en `public` puede crear un objeto homónimo (ej. tabla `funcionarios` falsa en `public`) que la función importará en vez del oficial.

**Decisión:** todas las funciones afectadas reciben `SET search_path = pg_catalog, <schema_propio>, public`. `pg_catalog` primero para prevenir shadowing de tipos/operadores nativos.

**Files:**
- `sql/03_funciones_vistas.sql`
- `apps/api/alembic/versions/<nuevo>_search_path_funciones.py` (nuevo)
- `apps/api/tests/test_funciones_search_path.py` (nuevo)

**Steps:**

- [ ] **2.12.1** Crear migración Alembic:

  ```python
  def upgrade() -> None:
      stmts = [
          "ALTER FUNCTION aud.fn_audit() SET search_path = pg_catalog, aud, public",
          "ALTER FUNCTION sys.fn_attach_audit(text, text) SET search_path = pg_catalog, sys, public",
          "ALTER FUNCTION sys.fn_set_updated_at() SET search_path = pg_catalog, sys, public",
          "ALTER FUNCTION personal.fn_buscar(text, smallint, smallint, core.estatus_funcionario, integer) "
            "SET search_path = pg_catalog, personal, core, org, sys, public",
          "ALTER FUNCTION carrera.fn_calcular_merito(bigint, smallint) "
            "SET search_path = pg_catalog, carrera, personal, public",
          "ALTER FUNCTION salud.fn_sync_estatus_reposo() SET search_path = pg_catalog, salud, personal, public",
          "ALTER FUNCTION personal.fn_sync_historicos() SET search_path = pg_catalog, personal, public",
          "ALTER FUNCTION personal.fn_sync_periodo_servicio() SET search_path = pg_catalog, personal, core, public",
          "ALTER FUNCTION personal.fn_sync_numero_equipo() SET search_path = pg_catalog, personal, public",
          "ALTER FUNCTION personal.fn_sync_condicion() SET search_path = pg_catalog, personal, public",
      ]
      # Si fn_recalcular_meritos_periodo, fn_registrar_ingreso, fn_registrar_egreso existen,
      # añadirlas en el descubrimiento (2.12.2)
      for s in stmts:
          op.execute(s)

  def downgrade() -> None:
      stmts = [
          "ALTER FUNCTION aud.fn_audit() RESET search_path",
          "ALTER FUNCTION sys.fn_attach_audit(text, text) RESET search_path",
          "ALTER FUNCTION sys.fn_set_updated_at() RESET search_path",
          "ALTER FUNCTION personal.fn_buscar(text, smallint, smallint, core.estatus_funcionario, integer) RESET search_path",
          "ALTER FUNCTION carrera.fn_calcular_merito(bigint, smallint) RESET search_path",
          "ALTER FUNCTION salud.fn_sync_estatus_reposo() RESET search_path",
          "ALTER FUNCTION personal.fn_sync_historicos() RESET search_path",
          "ALTER FUNCTION personal.fn_sync_periodo_servicio() RESET search_path",
          "ALTER FUNCTION personal.fn_sync_numero_equipo() RESET search_path",
          "ALTER FUNCTION personal.fn_sync_condicion() RESET search_path",
      ]
      for s in stmts:
          op.execute(s)
  ```

- [ ] **2.12.2** Descubrir todas las funciones que necesitan el SET:

  ```bash
  grep -nE "^CREATE OR REPLACE FUNCTION|^CREATE FUNCTION" sql/03_funciones_vistas.sql sql/06_seguridad_rls.sql
  ```

  Para cada función listada, decidir si necesita SET (si toca tablas de schemas no-`pg_catalog`, sí). Añadir a la migración.

- [ ] **2.12.3** Modificar `sql/03_funciones_vistas.sql` para que las **futuras** ejecuciones del bootstrap creen las funciones ya con el SET. Patrón:

  ```sql
  CREATE OR REPLACE FUNCTION aud.fn_audit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = pg_catalog, aud, public
  AS $$
  ...
  $$;
  ```

  Aplicar el `SET search_path = ...` a cada función afectada.

- [ ] **2.12.4** TDD: `apps/api/tests/test_funciones_search_path.py`:

  ```python
  import pytest
  pytestmark = pytest.mark.asyncio

  FUNCIONES_OBLIGATORIAS = {
      ("aud", "fn_audit"),
      ("sys", "fn_attach_audit"),
      ("sys", "fn_set_updated_at"),
      ("personal", "fn_buscar"),
      ("carrera", "fn_calcular_merito"),
      ("salud", "fn_sync_estatus_reposo"),
      ("personal", "fn_sync_historicos"),
      ("personal", "fn_sync_periodo_servicio"),
      ("personal", "fn_sync_numero_equipo"),
      ("personal", "fn_sync_condicion"),
  }

  async def test_funciones_tienen_search_path_fijo(db_session):
      from sqlalchemy import text
      for schema, name in FUNCIONES_OBLIGATORIAS:
          row = (await db_session.execute(text(f"""
              SELECT p.proname, c.proconfig
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = :s AND p.proname = :n
          """).bindparams(s=schema, n=name))).first()
          assert row is not None, f"{schema}.{name} no existe"
          config = row.proconfig or []
          assert any(c.startswith("search_path=") for c in config), (
              f"{schema}.{name} no tiene search_path fijo: {config}"
          )
  ```

  Re-correr → verde.

- [ ] **2.12.5** Commit: `git commit -m "security: 2.12 SET search_path en funciones (P1-14)"`.

---

## Bloque E — Infraestructura

### Tarea 2.13 — Container hardening en docker-compose.yml (P1-15)

**Contexto:** Los contenedores corren sin restricciones. Cualquier vulnerabilidad en un proceso del contenedor → root en el host. Añadir `no-new-privileges`, `cap_drop`, `read_only`, `tmpfs`, `pids_limit`, `mem_limit`, `cpus`.

**Files:**
- `docker-compose.yml`

**Steps:**

- [ ] **2.13.1** Reescribir `docker-compose.yml`. Estado **completo** después de los cambios (integra también 2.14 networks y 2.19 SHA digests):

  ```yaml
  services:
    postgres:
      image: postgres:16-alpine@sha256:<PIN_2.19>  # ver tarea 2.19
      container_name: bomberos_pg
      restart: unless-stopped
      environment:
        POSTGRES_USER: ${POSTGRES_USER:?required}
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
        POSTGRES_DB: ${POSTGRES_DB:-bomberos_caracas}
        LANG: es_VE.UTF-8
      # Sin ports: solo accesible desde la red 'backend'
      volumes:
        - bomberos_pg_data:/var/lib/postgresql/data
        - ./sql:/docker-entrypoint-initdb.d:ro
      networks: [backend]
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
        interval: 10s
        timeout: 3s
        retries: 5
      security_opt:
        - "no-new-privileges:true"
      cap_drop: ["ALL"]
      cap_add: ["CHOWN", "FOWNER", "SETUID", "SETGID", "DAC_READ_SEARCH"]
      # Postgres necesita escribir en su data dir: read_only=false aquí.
      # Las protecciones críticas son no-new-privileges + cap_drop.
      pids_limit: 200
      mem_limit: 2g
      cpus: 2.0
      logging:
        driver: json-file
        options:
          max-size: "10m"
          max-file: "7"

    api:
      build:
        context: .
        dockerfile: apps/api/Dockerfile
      container_name: bomberos_api
      restart: unless-stopped
      depends_on:
        postgres:
          condition: service_healthy
      environment:
        APP_ENV: ${APP_ENV:-production}
        APP_DEBUG: "false"
        DATABASE_URL: ${DATABASE_URL:?required}
        JWT_SECRET_KEY: ${JWT_SECRET_KEY:?required}
        KMS_KEY: ${KMS_KEY:?required}
        TRUSTED_PROXIES: ${TRUSTED_PROXIES:-172.20.0.0/16}
        CORS_ORIGINS: ${CORS_ORIGINS:-https://bomberos.dc.local}
        LOG_LEVEL: ${LOG_LEVEL:-INFO}
        LOG_FORMAT: ${LOG_FORMAT:-json}
        BOOTSTRAP_ADMIN_PASSWORD: ${BOOTSTRAP_ADMIN_PASSWORD:?required}
      # Sin ports: solo accesible por Caddy en la red 'frontend'
      networks: [backend, frontend]
      security_opt:
        - "no-new-privileges:true"
      cap_drop: ["ALL"]
      read_only: true
      tmpfs:
        - /tmp
        - /run
      pids_limit: 200
      mem_limit: 1g
      cpus: 1.0
      logging:
        driver: json-file
        options:
          max-size: "10m"
          max-file: "7"

    caddy:
      image: caddy:2-alpine@sha256:<PIN_2.19>
      container_name: bomberos_caddy
      restart: unless-stopped
      depends_on: [api]
      ports:
        - "443:443"
        - "80:80"
      volumes:
        - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
        - caddy_data:/data
        - caddy_config:/config
      networks: [frontend]
      security_opt:
        - "no-new-privileges:true"
      cap_drop: ["ALL"]
      cap_add: ["NET_BIND_SERVICE"]
      read_only: true
      tmpfs:
        - /tmp
      pids_limit: 100
      mem_limit: 256m
      cpus: 0.5
      logging:
        driver: json-file
        options:
          max-size: "10m"
          max-file: "7"

  volumes:
    bomberos_pg_data:
    caddy_data:
    caddy_config:

  networks:
    backend:
      driver: bridge
      internal: true  # sin acceso a internet
    frontend:
      driver: bridge
  ```

  **Caveat 1:** si la app intenta escribir a `/tmp` (por ejemplo para uploads), `tmpfs: /tmp` lo cubre. Si necesita un directorio persistente para uploads, montar un volumen separado y dejar el resto `read_only: true`.

  **Caveat 2:** `read_only: true` en API requiere que el `pip install` se haya hecho en build (ya está; Dockerfile lo hace). Verificar que ningún script de arranque escribe en el filesystem fuera de `/tmp`.

- [ ] **2.13.2** **Verificación manual** post-aplicación:

  ```bash
  docker compose down -v
  docker compose up -d
  # Esperar healthcheck OK
  docker compose ps  # todos "healthy" o "running"

  # Confirmar el hardening
  docker inspect bomberos_api | grep -E "ReadonlyRootfs|SecurityOpt|CapDrop"
  # Esperado:
  #   "ReadonlyRootfs": true,
  #   "SecurityOpt": [ "no-new-privileges:true" ],
  #   "CapDrop": [ "ALL" ]

  # Confirmar que el contenedor no puede escalar privilegios
  docker compose exec api id
  # Esperado: uid=1000(appuser) gid=1000(appuser) — NO uid=0

  docker compose exec api sh -c "echo test > /etc/x" 2>&1
  # Esperado: error "Read-only file system"
  ```

  Documentar los outputs esperados en `docs/RUNBOOK.md`.

- [ ] **2.13.3** Commit: `git commit -m "security: 2.13 container hardening en docker-compose (P1-15)"`.

---

### Tarea 2.14 — Networks separadas (P1-16)

**Contexto:** Hoy todos los servicios viven en la default bridge. En la intranet final debe haber una red `backend` (`internal: true`, sin internet) donde vive Postgres, y una `frontend` donde vive Caddy. La API está en ambas.

**Files:**
- `docker-compose.yml` (ya integrado en 2.13)

**Steps:**

- [ ] **2.14.1** Confirmar que el `docker-compose.yml` de 2.13.1 ya define:

  ```yaml
  networks:
    backend:
      driver: bridge
      internal: true
    frontend:
      driver: bridge
  ```

  Y que cada servicio declara `networks: [...]` correctamente:
  - `postgres`: solo `backend`
  - `api`: `backend` + `frontend`
  - `caddy`: solo `frontend`

- [ ] **2.14.2** **Verificación manual:**

  ```bash
  docker compose up -d
  docker network ls | grep bomberos
  # Esperado: dos redes: bomberos_caracas-bd_backend y _frontend

  docker network inspect bomberos-caracas-bd_backend | grep '"Internal"'
  # Esperado: "Internal": true

  # Verificar que Postgres no puede hacer outbound
  docker compose exec postgres ping -c 1 -W 2 8.8.8.8 || echo "OK: sin internet en backend"

  # Verificar que Caddy NO puede hablar con Postgres directamente
  docker compose exec caddy nc -zv bomberos_pg 5432 2>&1 | grep -i refused
  # Esperado: connection refused / unreachable
  ```

- [ ] **2.14.3** Smoke test funcional: `curl -k https://localhost/health` → 200 desde el host.

- [ ] **2.14.4** Commit: `git commit -m "security: 2.14 networks backend (internal) y frontend separadas (P1-16)"`.

---

### Tarea 2.15 — Eliminar passlib, migrar a bcrypt directo (P1-17)

**Contexto:** `passlib` sin updates desde 2020 y `bcrypt==4.0.1` pin estricto que bloquea fixes. Usar `bcrypt>=4.2.1,<5` directo.

**Files:**
- `apps/api/pyproject.toml`
- `apps/api/src/bomberos_api/core/security.py`
- `apps/api/tests/test_password_hash.py` (nuevo o extender)

**Steps:**

- [ ] **2.15.1** TDD: `apps/api/tests/test_password_hash.py`:

  ```python
  def test_hash_password_returns_bcrypt_string():
      from bomberos_api.core.security import hash_password
      h = hash_password("UnaPass#2026")
      # bcrypt empieza con $2a$, $2b$ o $2y$
      assert h.startswith("$2"), f"hash no parece bcrypt: {h[:10]}"
      # Cost factor 12
      assert h[4:6] == "12", f"cost factor != 12: {h[:10]}"

  def test_verify_password_roundtrip():
      from bomberos_api.core.security import hash_password, verify_password
      h = hash_password("UnaPass#2026")
      assert verify_password("UnaPass#2026", h) is True
      assert verify_password("Otra", h) is False

  def test_verify_password_resiste_payload_invalido():
      from bomberos_api.core.security import verify_password
      assert verify_password("x", "no-es-un-hash-valido") is False
      assert verify_password("x", "") is False

  def test_hash_legacy_passlib_aceptado(monkeypatch):
      """Hashes generados por passlib con cost 12 deben seguir verificando."""
      from bomberos_api.core.security import verify_password
      # Hash generado offline con: passlib.hash.bcrypt.hash("ViejaPass#2024", rounds=12)
      legacy = "$2b$12$KIXqLcktcS5KhWXkdMSyHe6cgQp.0J9DZ8tSlpJ9Dq2sMx2A0Z3z6"  # ejemplo
      # Si el hash de muestra no verifica, generar uno con passlib en un script aparte
      # y pegarlo aquí. Lo importante: bcrypt directo lo acepta.
      # assert verify_password("ViejaPass#2024", legacy) is True
  ```

  Correr → verifica el estado actual (todos deben pasar al final).

- [ ] **2.15.2** Editar `apps/api/pyproject.toml`:

  ```toml
  dependencies = [
      "fastapi[standard]>=0.115.0",
      "uvicorn[standard]>=0.32.0",
      "sqlalchemy[asyncio]>=2.0.36",
      "asyncpg>=0.30.0",
      "alembic>=1.14.0",
      "pydantic>=2.10.0",
      "pydantic-settings>=2.7.0",
      "bcrypt>=4.2.1,<5",
      # Eliminado: passlib[bcrypt]>=1.7.4 (sin updates desde 2020)
      "pyjwt>=2.10.0,<3",  # ya migrado en Sprint 1, sin python-jose
      "python-multipart>=0.0.20",
      "email-validator>=2.2.0",
      "structlog>=24.4.0",
  ]
  ```

- [ ] **2.15.3** Reescribir `apps/api/src/bomberos_api/core/security.py`:

  ```python
  from datetime import UTC, datetime, timedelta
  from typing import Any, Literal
  from uuid import uuid4

  import bcrypt
  import jwt

  from bomberos_api.config import get_settings

  TokenType = Literal["access", "refresh"]
  _BCRYPT_ROUNDS = 12


  def hash_password(plain: str) -> str:
      """Genera hash bcrypt con cost factor 12. Devuelve string ASCII."""
      salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
      h = bcrypt.hashpw(plain.encode("utf-8"), salt)
      return h.decode("ascii")


  def verify_password(plain: str, hashed: str) -> bool:
      """Comparación constant-time. Devuelve False ante cualquier hash inválido."""
      if not plain or not hashed:
          return False
      try:
          return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("ascii"))
      except (ValueError, TypeError):
          return False


  def create_token(
      subject: str | int,
      token_type: TokenType = "access",
      extra_claims: dict[str, Any] | None = None,
      *,
      jti: str | None = None,
  ) -> tuple[str, str]:
      s = get_settings()
      now = datetime.now(UTC)
      if token_type == "access":
          expires = now + timedelta(minutes=s.jwt_access_token_expire_minutes)
      else:
          expires = now + timedelta(days=s.jwt_refresh_token_expire_days)

      effective_jti = jti or str(uuid4())
      payload: dict[str, Any] = {
          "sub": str(subject),
          "iat": int(now.timestamp()),
          "exp": int(expires.timestamp()),
          "type": token_type,
          "jti": effective_jti,
      }
      if extra_claims:
          payload.update(extra_claims)
      token = jwt.encode(payload, s.jwt_secret_key, algorithm=s.jwt_algorithm)
      return token, effective_jti


  def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
      s = get_settings()
      try:
          payload = jwt.decode(
              token, s.jwt_secret_key, algorithms=[s.jwt_algorithm],
              options={"require": ["exp", "iat", "sub", "type"]},
          )
      except jwt.PyJWTError as e:
          raise ValueError(f"token inválido: {e}") from e
      if expected_type and payload.get("type") != expected_type:
          raise ValueError(f"se esperaba token tipo '{expected_type}'")
      return payload
  ```

  **Nota:** asumimos que en Sprint 1 ya se migró de `python-jose` a `PyJWT`. Si no, este step lo cubre.

- [ ] **2.15.4** Buscar y eliminar cualquier import residual:

  ```bash
  grep -rn "passlib" apps/api/src/ apps/api/tests/
  grep -rn "from jose" apps/api/src/ apps/api/tests/
  ```

  Reemplazar con `bcrypt` / `jwt` directo.

- [ ] **2.15.5** Re-instalar deps: `cd apps/api && pip install -e ".[dev]"`. Correr `pytest tests/test_password_hash.py -v` → verde. Correr `pytest -q` completo → verde.

- [ ] **2.15.6** Commit: `git commit -m "security: 2.15 eliminar passlib, migrar a bcrypt directo (P1-17)"`.

---

### Tarea 2.16 — CI hardening (P1-18)

**Files:**
- `.github/workflows/ci.yml`

**Steps:**

- [ ] **2.16.1** Resolver SHA full de cada action que use el workflow. **Verificación manual** (requiere internet, ejecutar en máquina dev):

  ```bash
  # actions/checkout@v4
  gh api repos/actions/checkout/git/ref/tags/v4 --jq '.object.sha'
  # actions/setup-python@v5
  gh api repos/actions/setup-python/git/ref/tags/v5 --jq '.object.sha'
  # actions/setup-node@v4
  gh api repos/actions/setup-node/git/ref/tags/v4 --jq '.object.sha'
  # docker/setup-buildx-action@v3
  gh api repos/docker/setup-buildx-action/git/ref/tags/v3 --jq '.object.sha'
  # docker/build-push-action@v6
  gh api repos/docker/build-push-action/git/ref/tags/v6 --jq '.object.sha'
  ```

  Anotar los SHA en variables locales (ej. `CHECKOUT_SHA=692973e3...`).

- [ ] **2.16.2** Reescribir `.github/workflows/ci.yml`:

  ```yaml
  name: CI

  on:
    push:
      branches: [main]
      paths:
        - "apps/**"
        - "sql/**"
        - ".github/workflows/ci.yml"
    pull_request:
      branches: [main]
      paths:
        - "apps/**"
        - "sql/**"
        - ".github/workflows/ci.yml"
    workflow_dispatch:

  # Permisos mínimos al GITHUB_TOKEN
  permissions:
    contents: read

  jobs:
    api-test:
      name: API — Lint + Tests
      runs-on: ubuntu-latest
      permissions:
        contents: read
      services:
        postgres:
          image: postgres:16-alpine@sha256:<PIN_2.19>
          env:
            POSTGRES_USER: postgres
            POSTGRES_PASSWORD: ${{ secrets.PG_TEST_PASSWORD }}
            POSTGRES_DB: bomberos_caracas
          ports: ["5432:5432"]
          options: >-
            --health-cmd "pg_isready -U postgres"
            --health-interval 5s
            --health-timeout 3s
            --health-retries 10
      steps:
        - uses: actions/checkout@<SHA_CHECKOUT_V4>  # v4

        - name: Setup Python 3.11
          uses: actions/setup-python@<SHA_SETUP_PYTHON_V5>  # v5
          with:
            python-version: "3.11"
            cache: "pip"
            cache-dependency-path: apps/api/pyproject.toml

        - name: Install API
          working-directory: apps/api
          run: |
            python -m pip install --upgrade pip
            pip install -e ".[dev]"

        - name: Lint (ruff)
          working-directory: apps/api
          run: ruff check src tests

        - name: Cargar esquema BD
          env:
            PGPASSWORD: ${{ secrets.PG_TEST_PASSWORD }}
          run: |
            psql -h localhost -U postgres -d bomberos_caracas -c "SELECT set_config('app.kms_key', '${{ secrets.KMS_KEY_TEST }}', false)"
            psql -h localhost -U postgres -d bomberos_caracas -f sql/99_run_all.sql

        - name: Tests
          working-directory: apps/api
          env:
            DATABASE_URL: postgresql+asyncpg://postgres:${{ secrets.PG_TEST_PASSWORD }}@localhost:5432/bomberos_caracas
            JWT_SECRET_KEY: ${{ secrets.JWT_SECRET_TEST }}
            KMS_KEY: ${{ secrets.KMS_KEY_TEST }}
          run: pytest -q

    web-build:
      name: Web — Build
      runs-on: ubuntu-latest
      permissions:
        contents: read
      steps:
        - uses: actions/checkout@<SHA_CHECKOUT_V4>
        - uses: actions/setup-node@<SHA_SETUP_NODE_V4>
          with:
            node-version: "20"
            cache: "npm"
            cache-dependency-path: apps/web/package-lock.json
        - name: Install
          working-directory: apps/web
          run: npm ci
        - name: Typecheck
          working-directory: apps/web
          run: npm run typecheck
        - name: Tests
          working-directory: apps/web
          run: npm test -- --run
        - name: Build
          working-directory: apps/web
          env:
            API_URL: http://localhost:8000
          run: npm run build

    api-docker:
      name: API — Docker build
      runs-on: ubuntu-latest
      permissions:
        contents: read
      steps:
        - uses: actions/checkout@<SHA_CHECKOUT_V4>
        - uses: docker/setup-buildx-action@<SHA_BUILDX_V3>
        - name: Build image (no push)
          uses: docker/build-push-action@<SHA_BUILD_PUSH_V6>
          with:
            context: .
            file: apps/api/Dockerfile
            push: false
            load: true
            tags: bomberos-api:ci
            cache-from: type=gha
            cache-to: type=gha,mode=max
        - name: Smoke test bootstrap import
          run: |
            docker run --rm --entrypoint python bomberos-api:ci -c "from bomberos_api.main import app; from bomberos_api.scripts.bootstrap import main; print('imports OK')"
        - name: Verify sql/ copied
          run: |
            docker run --rm --entrypoint sh bomberos-api:ci -c "ls /app/sql/01_base.sql && ls /app/sql/05_campos_custom.sql"
  ```

  Sustituir los placeholders `<SHA_..._V?>` por los SHA reales del paso 2.16.1.

- [ ] **2.16.3** Crear los secrets necesarios en GitHub (Settings → Secrets):
  - `JWT_SECRET_TEST` — string aleatorio de 64 bytes (`python -c "import secrets;print(secrets.token_urlsafe(64))"`)
  - `KMS_KEY_TEST` — string aleatorio para tests
  - `PG_TEST_PASSWORD` — password aleatorio para Postgres de CI

  **Verificación manual:** `gh secret list --repo <owner>/<repo>` muestra los tres secrets.

- [ ] **2.16.4** Push de la rama → confirmar que el CI corre verde con la nueva config. Si la rama es de feature, abrir PR para validar.

- [ ] **2.16.5** Commit: `git commit -m "security: 2.16 CI hardening — permissions mínimas, actions pinneadas a SHA, secrets (P1-18)"`.

---

### Tarea 2.17 — Healthcheck sin curl (P1-19)

**Files:**
- `apps/api/Dockerfile`

**Steps:**

- [ ] **2.17.1** Editar `apps/api/Dockerfile`:

  ```dockerfile
  # syntax=docker/dockerfile:1.7
  # Build context: repo root (build con `docker build -f apps/api/Dockerfile .`)

  FROM python:3.12-slim@sha256:<PIN_2.19> AS builder

  ENV PYTHONDONTWRITEBYTECODE=1 \
      PYTHONUNBUFFERED=1 \
      PIP_NO_CACHE_DIR=1 \
      PIP_DISABLE_PIP_VERSION_CHECK=1

  RUN apt-get update && apt-get install -y --no-install-recommends \
          build-essential \
          libpq-dev \
          ca-certificates \
      && rm -rf /var/lib/apt/lists/*

  WORKDIR /build

  COPY apps/api/pyproject.toml ./
  COPY apps/api/src ./src

  RUN pip install --upgrade pip && pip wheel --wheel-dir /wheels .


  FROM python:3.12-slim@sha256:<PIN_2.19> AS runtime

  ENV PYTHONDONTWRITEBYTECODE=1 \
      PYTHONUNBUFFERED=1 \
      PORT=8000 \
      WEB_CONCURRENCY=2

  RUN apt-get update && apt-get install -y --no-install-recommends \
          libpq5 \
          ca-certificates \
      && rm -rf /var/lib/apt/lists/* \
      && useradd --create-home --uid 1000 appuser

  WORKDIR /app

  COPY --from=builder /wheels /wheels
  RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels

  COPY --chown=appuser:appuser apps/api/src ./src
  COPY --chown=appuser:appuser apps/api/alembic.ini ./alembic.ini
  COPY --chown=appuser:appuser apps/api/alembic ./alembic
  COPY --chown=appuser:appuser sql ./sql

  USER appuser

  EXPOSE 8000

  # Healthcheck sin curl — usa stdlib Python (urllib).
  HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
      CMD python -c "import urllib.request,os,sys; \
          r = urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT','8000') + '/health', timeout=3); \
          sys.exit(0 if r.status == 200 else 1)" \
          || exit 1

  CMD ["sh", "-c", "python -m bomberos_api.scripts.bootstrap && exec uvicorn bomberos_api.main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY}"]
  ```

  Nota: se eliminó `curl` del `apt-get install` runtime. El builder no lo tenía. Imagen final más pequeña y sin superficie de ataque adicional.

- [ ] **2.17.2** **Verificación manual:**

  ```bash
  docker compose build api
  docker compose up -d api
  # Esperar 20s (start_period)
  docker inspect bomberos_api --format '{{ .State.Health.Status }}'
  # Esperado: healthy

  # Confirmar que curl ya no está en la imagen
  docker compose exec api which curl
  # Esperado: (vacío, exit 1)
  ```

- [ ] **2.17.3** Commit: `git commit -m "security: 2.17 healthcheck sin curl, usa urllib stdlib (P1-19)"`.

---

### Tarea 2.18 — Bootstrap fail-fast (P1-20)

**Contexto:** Hoy `bootstrap.py` hace `sys.exit(0)` en algunos paths que deberían ser error fatal. Si `_apply_sql_files` o `_ensure_admin_user` lanzan, la BD queda inconsistente pero la API arranca igual.

**Files:**
- `apps/api/src/bomberos_api/scripts/bootstrap.py`
- `apps/api/tests/test_bootstrap.py` (nuevo)

**Steps:**

- [ ] **2.18.1** Leer el archivo actual:

  ```bash
  cat apps/api/src/bomberos_api/scripts/bootstrap.py
  ```

  Identificar líneas con `sys.exit(0)`, `except: pass`, o try/except sin re-raise.

- [ ] **2.18.2** Refactorizar a fail-fast. Patrón a aplicar:

  ```python
  import logging
  import sys

  log = logging.getLogger(__name__)


  def main() -> int:
      try:
          _apply_sql_files()
          _ensure_admin_user()
          log.info("bootstrap_ok")
          return 0
      except Exception as e:
          log.exception("bootstrap_failed", extra={"error": str(e)})
          # Salida con código != 0 → el orquestador (compose, k8s) re-intenta
          raise SystemExit(1) from e


  if __name__ == "__main__":
      sys.exit(main())
  ```

  Eliminar cualquier `try/except Exception: pass` o `sys.exit(0)` dentro de los helpers `_apply_sql_files` y `_ensure_admin_user`. Si fallan, deben propagar.

- [ ] **2.18.3** TDD: `apps/api/tests/test_bootstrap.py`:

  ```python
  import pytest
  from unittest.mock import patch

  def test_bootstrap_exit_code_zero_en_ok():
      from bomberos_api.scripts import bootstrap
      with patch.object(bootstrap, "_apply_sql_files"), \
           patch.object(bootstrap, "_ensure_admin_user"):
          rc = bootstrap.main()
      assert rc == 0

  def test_bootstrap_exit_no_cero_si_sql_falla():
      from bomberos_api.scripts import bootstrap
      with patch.object(bootstrap, "_apply_sql_files", side_effect=RuntimeError("boom")), \
           patch.object(bootstrap, "_ensure_admin_user"), \
           pytest.raises(SystemExit) as exc:
          bootstrap.main()
      assert exc.value.code == 1

  def test_bootstrap_exit_no_cero_si_admin_falla():
      from bomberos_api.scripts import bootstrap
      with patch.object(bootstrap, "_apply_sql_files"), \
           patch.object(bootstrap, "_ensure_admin_user", side_effect=RuntimeError("boom")), \
           pytest.raises(SystemExit) as exc:
          bootstrap.main()
      assert exc.value.code == 1
  ```

  Correr → verde.

- [ ] **2.18.4** **Verificación manual:**

  ```bash
  # Forzar un error con SQL inválido
  echo "SELECT bogus_function();" > sql/99_break.sql
  docker compose build api
  docker compose up api 2>&1 | tail -20
  # Esperado: "bootstrap_failed" en logs, container exit 1
  rm sql/99_break.sql
  ```

- [ ] **2.18.5** Commit: `git commit -m "security: 2.18 bootstrap fail-fast con SystemExit(1) (P1-20)"`.

---

### Tarea 2.19 — Pinear imágenes base por SHA256 digest (P2-20 elevado)

**Contexto:** En intranet sin internet, `docker pull python:3.12-slim` mañana puede traer una imagen distinta si el tag se mueve. Para reproducibilidad y supply chain, pinear por digest.

**Files:**
- `apps/api/Dockerfile`
- `docker-compose.yml`
- `.github/workflows/ci.yml`

**Steps:**

- [ ] **2.19.1** Resolver digests actuales. **Verificación manual** (requiere red):

  ```bash
  docker pull python:3.12-slim
  docker inspect --format='{{index .RepoDigests 0}}' python:3.12-slim
  # Esperado: python@sha256:abc123...

  docker pull postgres:16-alpine
  docker inspect --format='{{index .RepoDigests 0}}' postgres:16-alpine
  # Esperado: postgres@sha256:def456...

  docker pull caddy:2-alpine
  docker inspect --format='{{index .RepoDigests 0}}' caddy:2-alpine
  # Esperado: caddy@sha256:789...
  ```

  Anotar los tres digests.

- [ ] **2.19.2** Reemplazar en:
  - `apps/api/Dockerfile`: `FROM python:3.12-slim@sha256:<digest>` (en ambos `builder` y `runtime`).
  - `docker-compose.yml`: `image: postgres:16-alpine@sha256:<digest>` y `image: caddy:2-alpine@sha256:<digest>`.
  - `.github/workflows/ci.yml`: `image: postgres:16-alpine@sha256:<digest>` en `services.postgres`.

- [ ] **2.19.3** Documentar el procedimiento de **rotación de digests** en `docs/RUNBOOK.md`:

  ```markdown
  ## Rotar digests de imágenes base

  Cada 3 meses (o tras CVE crítico en upstream):
  1. En máquina con internet:
     ```bash
     docker pull python:3.12-slim
     docker inspect --format='{{index .RepoDigests 0}}' python:3.12-slim
     ```
  2. Reemplazar el digest en `apps/api/Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`.
  3. Verificar `docker compose build` y tests verdes.
  4. Commit: `chore: actualizar digest de <imagen> a <YYYY-MM>`.
  5. En intranet: `docker save` la imagen nueva, transferir por USB curado, `docker load`.
  ```

- [ ] **2.19.4** **Verificación manual:** `docker compose build && docker compose up -d` → todo healthy.

- [ ] **2.19.5** Commit: `git commit -m "security: 2.19 pinear imágenes base por SHA256 digest (P2-20)"`.

---

## Verificación final del Sprint

- [ ] **F1.** `cd apps/api && pytest -q` → verde, sin warnings nuevos.
- [ ] **F2.** `cd apps/api && ruff check src tests` → verde.
- [ ] **F3.** `cd apps/web && npm run typecheck && npm test -- --run` → verde.
- [ ] **F4.** `cd apps/web && npm run build` → verde.
- [ ] **F5.** `docker compose down -v && docker compose up -d` → todos los servicios healthy en ≤2 minutos.
- [ ] **F6.** Verificaciones manuales 2.13.2, 2.14.2, 2.17.2, 2.18.4, 2.19.4 ejecutadas y outputs documentados en `docs/RUNBOOK.md` con timestamp del sprint.
- [ ] **F7.** Grep de housekeeping:

  ```bash
  grep -rn "passlib" apps/api/        # → vacío
  grep -rn "from jose" apps/api/      # → vacío
  grep -rn "Annotated\[.*Depends.*\] = \.\.\." apps/api/src/  # → vacío
  grep -rn "e.orig" apps/api/src/bomberos_api/routers/  # solo para detección, no para devolver al cliente
  grep -rn "x-forwarded-for" apps/api/src/ | grep -v request_utils.py  # solo en request_utils.py
  ```

- [ ] **F8.** `SECURITY.md` actualizado: marcar todos los checkboxes P1-2 a P1-20 + P2-20 con `[x]` y referencia al commit que los cerró.
- [ ] **F9.** PR a `main` con título `security: cierre Sprint 2 (P1-2 a P1-20)`. Review por segundo dev/auditor.
- [ ] **F10.** Tras merge: tag `v0.4.0-security-sprint-2` con changelog.

  ```bash
  git tag -a v0.4.0-security-sprint-2 -m "Security Sprint 2: cierra P1-2..P1-20 + P2-20"
  git push origin v0.4.0-security-sprint-2
  ```

- [ ] **F11.** Actualizar `docs/ROADMAP.md` §5 con `(cerrado YYYY-MM-DD)` junto al título de Fase 2.

---

## Notas de coordinación entre tareas

- **2.1, 2.2 y 2.15** modifican `core/security.py`. Hacerlas en este orden: 2.15 (eliminar passlib) primero porque cambia `create_token` signature; luego 2.1 (refresh rotation usa el nuevo signature con `jti`); luego 2.2 (usa la tabla `refresh_tokens` de 2.1).
- **2.5 y 2.6** comparten `core/middleware.py` y `core/request_utils.py`. Hacer 2.5 primero (define `client_ip`), luego 2.6 (lo usa).
- **2.7** toca routers + schemas. Si Sprint 1 ya añadió `extra="forbid"` a otros schemas, mantener el patrón.
- **2.8 y 2.9** tocan las mismas server actions. Hacerlas en una sola pasada por archivo para evitar conflictos. Recomendación: empezar por `admin/usuarios/nuevo/actions.ts` como referencia, luego replicar.
- **2.10** depende de que `KMS_KEY` esté en el entorno. Asegurar que `docker-compose.yml` (tarea 2.13) lo declare como `${KMS_KEY:?required}` antes de aplicar la migración 2.10.3.
- **2.11 y 2.12** son migraciones SQL puras. Pueden correrse en cualquier orden, pero ambas requieren que Sprint 1 haya creado las tablas/vistas/funciones que modifican.
- **2.13, 2.14, 2.17, 2.19** modifican `docker-compose.yml` y `apps/api/Dockerfile`. Aplicarlas en un solo commit final si causan menos churn, o secuencialmente con compose-restart entre cada una. El plan las separa en commits para trazabilidad por hallazgo.
- **2.16** depende de que los secrets de GitHub estén creados antes de empujar. Crearlos como step manual.

---

## Riesgos y mitigaciones específicas del sprint

| Riesgo | Mitigación |
|---|---|
| `read_only: true` rompe procesos que escriben fuera de `/tmp` | `tmpfs: ["/tmp", "/run"]` cubre el caso común. Si aparece otro path, añadir tmpfs específico. |
| Migración 2.10 (cifrado) corre sin `KMS_KEY` seteado en alembic | Documentar en el commit: requiere `KMS_KEY=... alembic upgrade head`. Si falla, el `current_setting('app.kms_key')` lanza, no corrompe datos. |
| `request.form()` en middleware consume body | Plan B documentado en 2.6.3: mover el bucket por username al handler `login`. |
| `security_invoker=true` rompe vistas que dependían del owner | Tras aplicar 2.11, smoke test exhaustivo: `SELECT * FROM <view> LIMIT 1` para cada vista alterada con un usuario no-admin. |
| Healthcheck stdlib Python falla si el server tarda > 3s en responder | `timeout=5s` en la directiva HEALTHCHECK; el `urlopen(timeout=3)` debe respetar el outer. Verificar en 2.17.2. |
| Pin por digest hace que actualizar requiera intervención manual | Es el objetivo (reproducibilidad en intranet). Procedimiento en `docs/RUNBOOK.md` (2.19.3). |
| Tests E2E rate-limit fallan en CI por compartir bucket entre tests | Fixture autouse `_reset_rate_limit_buckets` (2.6.5). |
| Refresh token rotation introduce concurrencia (race entre dos refresh paralelos) | El `UPDATE ... usado_en` corre dentro de la tx del request; el segundo intento ve `usado_en IS NOT NULL` y revoca familia. Es el comportamiento deseado. |

---

**Fin del plan Security Sprint 2.**

Al cerrar este plan: marcar todos los checkboxes, ejecutar verificaciones finales, crear tag y actualizar `ROADMAP.md` + `SECURITY.md`.
