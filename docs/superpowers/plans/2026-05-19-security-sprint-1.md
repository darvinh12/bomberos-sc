# Security Sprint 1 Implementation Plan

> **Para agentes:** SKILL REQUERIDA: usar superpowers:subagent-driven-development o superpowers:executing-plans para ejecutar este plan tarea por tarea. Steps usan checkbox (- [ ]) syntax para tracking.

**Goal:** Cerrar los 17 hallazgos P0 del audit de seguridad (ver docs/SECURITY.md §2 P0).

**Architecture:** TDD estricto. Cada fix empieza con test que falla, implementación mínima que pasa, commit. Hallazgos agrupados por capa (API, BD, Infra, Frontend) para minimizar context switching.

**Tech Stack:** Python 3.12 + FastAPI 0.115 + SQLAlchemy 2 + PostgreSQL 16. Tests con pytest. Frontend Next.js 14 + zod.

**Esfuerzo estimado:** 40 horas / 1 semana / 1 dev senior.

---

## Prerrequisitos de entorno

Antes de empezar la primera tarea, asegurar:

- Postgres 16 local accesible (`docker compose up -d postgres`) con la BD `bomberos_caracas` cargada con `sql/99_run_all.sql`.
- Variables de entorno mínimas en `apps/api/.env`:
  ```env
  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/bomberos_caracas
  JWT_SECRET_KEY=test-secret-only-for-local-dev-do-not-use-in-prod-64chars-min-pad
  APP_ENV=test
  ```
- Dependencias dev instaladas: `cd apps/api && pip install -e ".[dev]"`.
- Crear directorio de tests SQL: `mkdir -p tests/sql && mkdir -p apps/api/tests/security`.
- Branch dedicada: `git switch -c security/sprint-1`.

Comando de verificación: `pytest apps/api/tests/ -v` debe pasar (baseline 4 tests).

---

## Convenciones del plan

- Cada commit cita el hallazgo (`security: fix P0-X <descripción>`). Si un step implementa varias tareas relacionadas, citarlas todas.
- Tests SQL viven en `tests/sql/test_<nombre>.sql` y se corren con `psql -v ON_ERROR_STOP=1 -f tests/sql/test_<nombre>.sql`. Cada test envuelve su lógica en `BEGIN; ... ROLLBACK;` para no contaminar la BD.
- Helper `pg_assert(cond bool, msg text)` definido en la primera tarea SQL (Task 1.11) — todos los tests SQL posteriores asumen que existe.
- Helper Python `make_test_user(db, *, roles, scope)` definido en `apps/api/tests/conftest.py` en Task 1.4 — todos los tests E2E posteriores lo usan.

---

# Bloque API — Tareas 1.1 a 1.10

### Task 1.1: Refactor de get_session para persistir audit en login fallido

**Hallazgo:** P0-2 (`docs/SECURITY.md` §2 P0-2)
**Files:**
- Modify: `apps/api/src/bomberos_api/database.py:67-89`
- Modify: `apps/api/src/bomberos_api/routers/auth.py:60-154` (login)
- Create: `apps/api/tests/security/__init__.py` (vacío)
- Create: `apps/api/tests/security/conftest.py`
- Create: `apps/api/tests/security/test_login_lockout.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/conftest.py`:

```python
"""Fixtures compartidos para tests de seguridad."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Sequence

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from bomberos_api.core.security import hash_password
from bomberos_api.database import get_session_factory, session_scope
from bomberos_api.main import app


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with session_scope() as s:
        yield s


async def _ensure_rol(db: AsyncSession, codigo: str) -> int:
    rol_id = await db.scalar(
        text("SELECT id FROM seguridad.roles WHERE codigo=:c").bindparams(c=codigo)
    )
    if rol_id:
        return int(rol_id)
    return int(
        await db.scalar(
            text(
                "INSERT INTO seguridad.roles (codigo, nombre, descripcion) "
                "VALUES (:c, :c, :c) RETURNING id"
            ).bindparams(c=codigo)
        )
    )


@pytest_asyncio.fixture
async def make_test_user(db: AsyncSession):
    """Factory para crear usuarios sintéticos. Limpia al finalizar el test."""
    creados: list[int] = []

    async def _make(
        usuario: str,
        password: str = "Sup3rPass!2026",
        roles: Sequence[str] = ("VISTA",),
        scope: dict | None = None,
        activo: bool = True,
        bloqueado: bool = False,
    ) -> dict:
        h = hash_password(password)
        uid = await db.scalar(
            text(
                """INSERT INTO seguridad.usuarios
                       (usuario, nombre_completo, correo, password_hash,
                        activo, bloqueado, debe_cambiar_password)
                   VALUES (:u, :n, :e, :h, :a, :b, FALSE)
                   RETURNING id"""
            ).bindparams(
                u=usuario, n=f"Test {usuario}", e=f"{usuario}@test.local",
                h=h, a=activo, b=bloqueado,
            )
        )
        for r in roles:
            rid = await _ensure_rol(db, r)
            await db.execute(
                text(
                    "INSERT INTO seguridad.usuario_roles (usuario_id, rol_id) "
                    "VALUES (:u, :r) ON CONFLICT DO NOTHING"
                ).bindparams(u=uid, r=rid)
            )
        if scope:
            await db.execute(
                text(
                    """INSERT INTO seguridad.usuario_scopes
                           (usuario_id, zona_id, estacion_id, division_id, area_id)
                       VALUES (:u, :z, :e, :d, :a)"""
                ).bindparams(
                    u=uid,
                    z=scope.get("zona_id"),
                    e=scope.get("estacion_id"),
                    d=scope.get("division_id"),
                    a=scope.get("area_id"),
                )
            )
        await db.commit()
        creados.append(int(uid))
        return {"id": int(uid), "usuario": usuario, "password": password}

    yield _make

    if creados:
        ids = tuple(creados)
        async with session_scope() as s2:
            await s2.execute(
                text("DELETE FROM seguridad.usuario_scopes WHERE usuario_id = ANY(:ids)")
                .bindparams(ids=list(ids))
            )
            await s2.execute(
                text("DELETE FROM seguridad.usuario_roles WHERE usuario_id = ANY(:ids)")
                .bindparams(ids=list(ids))
            )
            await s2.execute(
                text("DELETE FROM aud.log_accesos WHERE usuario_id = ANY(:ids)")
                .bindparams(ids=list(ids))
            )
            await s2.execute(
                text("DELETE FROM seguridad.usuarios WHERE id = ANY(:ids)")
                .bindparams(ids=list(ids))
            )
            await s2.commit()
```

Crear `apps/api/tests/security/test_login_lockout.py`:

```python
"""Tests para P0-2: persistencia de intento fallido / lockout."""
from __future__ import annotations

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_login_fallido_persiste_intentos_fallidos(client, db, make_test_user):
    """Un intento fallido debe incrementar intentos_fallidos en BD aunque la
    respuesta sea 401 (la tx del audit no puede rollbackear)."""
    u = await make_test_user("test_p0_2_user")

    resp = await client.post(
        "/auth/login",
        data={"username": u["usuario"], "password": "PasswordIncorrectaXYZ!"},
    )
    assert resp.status_code == 401

    # Releer desde BD: la tx del request hizo rollback de TODO, esto debe
    # haberse persistido en una sesión separada.
    val = await db.scalar(
        text("SELECT intentos_fallidos FROM seguridad.usuarios WHERE id=:i")
        .bindparams(i=u["id"])
    )
    assert val == 1, f"intentos_fallidos no se persistió (= {val})"

    # También debe existir el log de acceso.
    n_log = await db.scalar(
        text(
            "SELECT count(*) FROM aud.log_accesos "
            "WHERE usuario_id=:i AND tipo_evento='LOGIN_FALLIDO'"
        ).bindparams(i=u["id"])
    )
    assert n_log >= 1, "no se registró LOGIN_FALLIDO en aud.log_accesos"
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_login_lockout.py -v`
Salida esperada: FAIL — `intentos_fallidos no se persistió (= 0)` y/o `no se registró LOGIN_FALLIDO`.

- [ ] **Step 3: Implementación mínima**

Modificar `apps/api/src/bomberos_api/routers/auth.py`. En el handler `login`, ANTES de cada `raise HTTPException` en rama de fallo, hacer `await db.commit()` para forzar persistencia. Reemplazar bloque P0-2 completo (líneas ~86 a ~125):

```python
    if user is None:
        await _log_acceso(
            db, usuario_id=None, usuario=form.username, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="usuario_inexistente"
        )
        await db.commit()  # P0-2: persistir audit antes de 401
        raise invalid_exc

    if not user.activo:
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="inactivo"
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta inactiva"
        )

    if user.bloqueado:
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="bloqueada"
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta bloqueada. Contacta al administrador.",
        )

    if not verify_password(form.password, user.password_hash):
        user.intentos_fallidos = (user.intentos_fallidos or 0) + 1
        if user.intentos_fallidos >= MAX_INTENTOS_FALLIDOS:
            user.bloqueado = True
            user.motivo_bloqueo = f"Excedió {MAX_INTENTOS_FALLIDOS} intentos fallidos"
            await _log_acceso(
                db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
                tipo_evento="BLOQUEO", detalle=user.motivo_bloqueo
            )
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle=f"intento_{user.intentos_fallidos}"
        )
        await db.commit()  # P0-2: persistir incremento + audit antes de 401
        raise invalid_exc
```

`get_session()` en `database.py` ya hace rollback ante excepción, pero ahora el commit explícito persiste la mutación antes de lanzar.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_login_lockout.py -v`
Salida esperada: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/security/__init__.py apps/api/tests/security/conftest.py \
        apps/api/tests/security/test_login_lockout.py \
        apps/api/src/bomberos_api/routers/auth.py
git commit -m "security: fix P0-2 persistir LOGIN_FALLIDO antes de 401"
```

---

### Task 1.2: Aplicar assert_scope_funcionario en routers sensibles

**Hallazgo:** P0-1
**Files:**
- Modify: `apps/api/src/bomberos_api/routers/salud.py` (cada endpoint con `funcionario_id`)
- Modify: `apps/api/src/bomberos_api/routers/ops.py`
- Modify: `apps/api/src/bomberos_api/routers/carrera.py`
- Modify: `apps/api/src/bomberos_api/routers/equipo.py`
- Modify: `apps/api/src/bomberos_api/routers/beneficios.py`
- Modify: `apps/api/src/bomberos_api/routers/egresos.py`
- Create: `apps/api/src/bomberos_api/core/scope_apply.py`
- Create: `apps/api/tests/security/test_idor_salud.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_idor_salud.py`:

```python
"""Tests IDOR para router salud: usuario con scope zona 1 NO puede leer
recursos cuyo funcionario pertenece a zona 2."""
from __future__ import annotations

import pytest
from sqlalchemy import text


async def _login(client, usuario, password):
    r = await client.post("/auth/login", data={"username": usuario, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _crear_funcionario(db, *, zona_id, estacion_id, cedula):
    fid = await db.scalar(
        text(
            """INSERT INTO personal.funcionarios
                   (nacionalidad, cedula, apellidos, nombres,
                    fecha_nacimiento, sexo, fecha_primer_ingreso,
                    zona_id, estacion_id)
               VALUES ('V', :c, 'TEST', 'IDOR', '1990-01-01', 'M',
                       '2020-01-01', :z, :e)
               RETURNING id"""
        ).bindparams(c=cedula, z=zona_id, e=estacion_id)
    )
    await db.commit()
    return int(fid)


async def _crear_reposo(db, funcionario_id):
    rid = await db.scalar(
        text(
            """INSERT INTO salud.reposos
                   (funcionario_id, fecha_inicio, fecha_fin, dias, motivo)
               VALUES (:f, '2026-01-01', '2026-01-05', 5, 'gripe')
               RETURNING id"""
        ).bindparams(f=funcionario_id)
    )
    await db.commit()
    return int(rid)


@pytest.mark.asyncio
async def test_idor_reposos_get_por_id_cross_zone_403(client, db, make_test_user):
    # Funcionario en zona 2
    f2 = await _crear_funcionario(db, zona_id=2, estacion_id=None, cedula=20202021)
    reposo_id = await _crear_reposo(db, f2)

    # Usuario con scope zona 1 (sin rol ADMIN)
    u1 = await make_test_user(
        "idor_salud_zona1", roles=("VISTA",), scope={"zona_id": 1}
    )
    token = await _login(client, u1["usuario"], u1["password"])

    r = await client.get(
        f"/salud/reposos/{reposo_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403, f"esperado 403, recibido {r.status_code}: {r.text}"
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_idor_salud.py -v`
Salida esperada: FAIL — `esperado 403, recibido 200` (el endpoint no chequea scope).

- [ ] **Step 3: Implementación mínima**

Crear helper `apps/api/src/bomberos_api/core/scope_apply.py`:

```python
"""Wrappers para aplicar scope en endpoints que reciben funcionario_id.

`assert_scope_by_funcionario_id` resuelve el funcionario por id y delega en
`assert_scope_funcionario`. Devuelve el objeto Funcionario cargado para que
el caller lo reutilice sin segundo query.
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bomberos_api.core.scope_check import assert_scope_funcionario
from bomberos_api.models.funcionario import Funcionario
from bomberos_api.models.usuario import Usuario


async def assert_scope_by_funcionario_id(
    db: AsyncSession, user: Usuario, funcionario_id: int
) -> Funcionario:
    f = await db.scalar(select(Funcionario).where(Funcionario.id == funcionario_id))
    if f is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario no encontrado"
        )
    await assert_scope_funcionario(db, user, f)
    return f
```

Modificar `apps/api/src/bomberos_api/routers/salud.py`. En el endpoint `GET /salud/reposos/{reposo_id}` (y análogos en lesiones, evaluacion_fisica), tras cargar el recurso, validar scope. Patrón a aplicar:

```python
from bomberos_api.core.scope_apply import assert_scope_by_funcionario_id

@router.get("/reposos/{reposo_id}", response_model=ReposoDetail)
async def obtener_reposo(
    reposo_id: int, db: DbSession, user: CurrentUser
) -> ReposoDetail:
    r = await db.scalar(select(Reposo).where(Reposo.id == reposo_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Reposo no encontrado")
    await assert_scope_by_funcionario_id(db, user, r.funcionario_id)
    return ReposoDetail.model_validate(r)
```

Para endpoints POST/PATCH que reciben `funcionario_id` en el body o path, añadir `await assert_scope_by_funcionario_id(db, user, payload.funcionario_id)` antes del flush.

Aplicar el MISMO patrón en:
- `routers/ops.py` (guardias, permisos, vacaciones, comisiones, faltas).
- `routers/carrera.py` (cursos_realizados, evaluaciones, ascensos, reconocimientos).
- `routers/equipo.py` (asignaciones de protección, radios).
- `routers/beneficios.py` (todos los endpoints con `funcionario_id`).
- `routers/egresos.py` (jubilados, fallecimientos, solicitudes).

Para cada endpoint detail (`GET /resource/{id}`) cargar el recurso → llamar `assert_scope_by_funcionario_id(db, user, recurso.funcionario_id)`. Para creates/patches con `funcionario_id` en el payload, validar antes del flush.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_idor_salud.py -v`
Salida esperada: PASS (403).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bomberos_api/core/scope_apply.py \
        apps/api/src/bomberos_api/routers/salud.py \
        apps/api/src/bomberos_api/routers/ops.py \
        apps/api/src/bomberos_api/routers/carrera.py \
        apps/api/src/bomberos_api/routers/equipo.py \
        apps/api/src/bomberos_api/routers/beneficios.py \
        apps/api/src/bomberos_api/routers/egresos.py \
        apps/api/tests/security/test_idor_salud.py
git commit -m "security: fix P0-1 aplicar assert_scope_funcionario en routers de dominio"
```

---

### Task 1.3: Aplicar _scope_filter en listados

**Hallazgo:** P0-1 (parte listado)
**Files:**
- Modify: `apps/api/src/bomberos_api/routers/salud.py:listar_reposos`, `listar_lesiones`, `listar_evaluaciones_fisicas`
- Modify: `apps/api/src/bomberos_api/routers/ops.py` (listados)
- Modify: `apps/api/src/bomberos_api/routers/carrera.py` (listados)
- Modify: `apps/api/src/bomberos_api/routers/equipo.py` (listados)
- Modify: `apps/api/src/bomberos_api/routers/beneficios.py` (listados)
- Modify: `apps/api/src/bomberos_api/routers/egresos.py` (listados)
- Modify: `apps/api/src/bomberos_api/core/scope_apply.py` (añadir filtro genérico)
- Create: `apps/api/tests/security/test_idor_listados.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_idor_listados.py`:

```python
"""Tests IDOR para listados: GET /salud/reposos NO debe devolver registros
cuyo funcionario está fuera del scope del usuario."""
from __future__ import annotations

import pytest
from sqlalchemy import text


async def _login(client, usuario, password):
    r = await client.post("/auth/login", data={"username": usuario, "password": password})
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_idor_listado_reposos_filtrado_por_scope(client, db, make_test_user):
    # Crear 2 funcionarios: uno en zona 1, otro en zona 2
    f1 = await db.scalar(text(
        "INSERT INTO personal.funcionarios "
        "(nacionalidad, cedula, apellidos, nombres, fecha_nacimiento, sexo, "
        " fecha_primer_ingreso, zona_id) "
        "VALUES ('V', 30301, 'A', 'B', '1990-01-01', 'M', '2020-01-01', 1) "
        "RETURNING id"
    ))
    f2 = await db.scalar(text(
        "INSERT INTO personal.funcionarios "
        "(nacionalidad, cedula, apellidos, nombres, fecha_nacimiento, sexo, "
        " fecha_primer_ingreso, zona_id) "
        "VALUES ('V', 30302, 'C', 'D', '1990-01-01', 'M', '2020-01-01', 2) "
        "RETURNING id"
    ))
    await db.execute(text(
        "INSERT INTO salud.reposos (funcionario_id, fecha_inicio, fecha_fin, "
        "dias, motivo) VALUES (:f, '2026-01-01', '2026-01-05', 5, 'A')"
    ).bindparams(f=f1))
    await db.execute(text(
        "INSERT INTO salud.reposos (funcionario_id, fecha_inicio, fecha_fin, "
        "dias, motivo) VALUES (:f, '2026-02-01', '2026-02-05', 5, 'B')"
    ).bindparams(f=f2))
    await db.commit()

    u = await make_test_user(
        "idor_lst_zona1", roles=("VISTA",), scope={"zona_id": 1}
    )
    token = await _login(client, u["usuario"], u["password"])

    r = await client.get(
        "/salud/reposos", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    funcs = {item["funcionario_id"] for item in r.json()["items"]}
    assert f2 not in funcs, "fugó un funcionario fuera del scope (zona 2)"
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_idor_listados.py -v`
Salida esperada: FAIL — `fugó un funcionario fuera del scope`.

- [ ] **Step 3: Implementación mínima**

Añadir al final de `apps/api/src/bomberos_api/core/scope_apply.py`:

```python
from typing import Any

from sqlalchemy import and_, func, or_

from bomberos_api.models.usuario import Rol, UsuarioRol, UsuarioScope


async def scope_filter_funcionarios(db: AsyncSession, user: Usuario) -> Any | None:
    """Devuelve una condición SQLAlchemy `Funcionario.* in scope`, o None si
    el usuario es ADMIN o no tiene scopes asignados. Mismo patrón que
    routers/funcionarios.py:_scope_filter pero reutilizable.
    """
    es_admin = await db.scalar(
        select(func.count())
        .select_from(UsuarioRol)
        .join(Rol, Rol.id == UsuarioRol.rol_id)
        .where(UsuarioRol.usuario_id == user.id, Rol.codigo == "ADMIN")
    )
    if es_admin:
        return None
    scopes = (
        await db.execute(
            select(UsuarioScope).where(UsuarioScope.usuario_id == user.id)
        )
    ).scalars().all()
    if not scopes:
        return None
    conds: list = []
    for s in scopes:
        partes = []
        if s.zona_id is not None:
            partes.append(Funcionario.zona_id == s.zona_id)
        if s.estacion_id is not None:
            partes.append(Funcionario.estacion_id == s.estacion_id)
        if s.division_id is not None:
            partes.append(Funcionario.division_id == s.division_id)
        if s.area_id is not None:
            partes.append(Funcionario.area_id == s.area_id)
        if partes:
            conds.append(and_(*partes))
    return or_(*conds) if conds else None
```

En cada listado de los routers (ejemplo en `routers/salud.py`):

```python
from bomberos_api.core.scope_apply import scope_filter_funcionarios
from bomberos_api.models.funcionario import Funcionario

# Dentro de listar_reposos, después de armar filters:
scope_cond = await scope_filter_funcionarios(db, user)
if scope_cond is not None:
    stmt = stmt.join(Funcionario, Funcionario.id == Reposo.funcionario_id).where(scope_cond)
    count_stmt = count_stmt.join(
        Funcionario, Funcionario.id == Reposo.funcionario_id
    ).where(scope_cond)
```

Replicar el patrón en todos los listados de los routers indicados. Las tablas de los modelos respectivos exponen `funcionario_id`; el JOIN siempre es contra `personal.funcionarios`.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_idor_listados.py -v`
Salida esperada: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bomberos_api/core/scope_apply.py \
        apps/api/src/bomberos_api/routers/salud.py \
        apps/api/src/bomberos_api/routers/ops.py \
        apps/api/src/bomberos_api/routers/carrera.py \
        apps/api/src/bomberos_api/routers/equipo.py \
        apps/api/src/bomberos_api/routers/beneficios.py \
        apps/api/src/bomberos_api/routers/egresos.py \
        apps/api/tests/security/test_idor_listados.py
git commit -m "security: fix P0-1 aplicar scope_filter en listados de dominio"
```

---

### Task 1.4: Tests E2E IDOR cobertura mínima por router

**Hallazgo:** P0-1 (cobertura tests)
**Files:**
- Create: `apps/api/tests/security/test_idor_ops.py`
- Create: `apps/api/tests/security/test_idor_carrera.py`
- Create: `apps/api/tests/security/test_idor_equipo.py`
- Create: `apps/api/tests/security/test_idor_beneficios.py`
- Create: `apps/api/tests/security/test_idor_egresos.py`

- [ ] **Step 1: Escribir test que falla**

Patrón único reutilizable. Ejemplo `test_idor_ops.py`:

```python
"""IDOR tests para router ops."""
from __future__ import annotations

import pytest
from sqlalchemy import text


async def _login(client, u, p):
    r = await client.post("/auth/login", data={"username": u, "password": p})
    return r.json()["access_token"]


async def _crear_funcionario(db, zona_id, cedula):
    fid = await db.scalar(text(
        "INSERT INTO personal.funcionarios "
        "(nacionalidad, cedula, apellidos, nombres, fecha_nacimiento, sexo, "
        " fecha_primer_ingreso, zona_id) "
        "VALUES ('V', :c, 'X', 'Y', '1990-01-01', 'M', '2020-01-01', :z) "
        "RETURNING id"
    ).bindparams(c=cedula, z=zona_id))
    await db.commit()
    return int(fid)


@pytest.mark.asyncio
async def test_idor_permiso_get_cross_zone_403(client, db, make_test_user):
    f2 = await _crear_funcionario(db, zona_id=2, cedula=40402041)
    pid = await db.scalar(text(
        "INSERT INTO ops.permisos (funcionario_id, fecha_inicio, fecha_fin, motivo) "
        "VALUES (:f, '2026-03-01', '2026-03-02', 'personal') RETURNING id"
    ).bindparams(f=f2))
    await db.commit()

    u = await make_test_user(
        "idor_ops_z1", roles=("VISTA",), scope={"zona_id": 1}
    )
    token = await _login(client, u["usuario"], u["password"])
    r = await client.get(
        f"/ops/permisos/{int(pid)}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_idor_permiso_listado_no_fuga(client, db, make_test_user):
    f1 = await _crear_funcionario(db, zona_id=1, cedula=40402042)
    f2 = await _crear_funcionario(db, zona_id=2, cedula=40402043)
    for f in (f1, f2):
        await db.execute(text(
            "INSERT INTO ops.permisos (funcionario_id, fecha_inicio, fecha_fin, motivo) "
            "VALUES (:f, '2026-03-01', '2026-03-02', 'x')"
        ).bindparams(f=f))
    await db.commit()

    u = await make_test_user(
        "idor_ops_lst_z1", roles=("VISTA",), scope={"zona_id": 1}
    )
    token = await _login(client, u["usuario"], u["password"])
    r = await client.get(
        "/ops/permisos", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    funcs = {it["funcionario_id"] for it in r.json()["items"]}
    assert f2 not in funcs
```

Crear los archivos análogos para `carrera`, `equipo`, `beneficios`, `egresos` repitiendo el patrón con las tablas correspondientes:
- `carrera.cursos_realizados`, `carrera.ascensos`, `carrera.evaluaciones`, `carrera.reconocimientos`.
- `equipo.proteccion_asignaciones`, `equipo.radios_asignaciones`.
- `beneficios.ayudas_economicas`, `beneficios.entregas`.
- `egresos.jubilados`, `egresos.fallecimientos`.

Cada archivo tiene al menos dos tests: uno de GET por id (403 cross-zone) y uno de listado (no fuga).

- [ ] **Step 2: Correr tests y verificar que pasan**

Comando: `pytest apps/api/tests/security/test_idor_*.py -v`
Salida esperada: PASS en todos (las correcciones de Tasks 1.2 y 1.3 ya están aplicadas; estos tests son cobertura).

Si alguno falla, indica que esa tabla NO fue cubierta en 1.2/1.3 — completar el patch y repetir.

- [ ] **Step 3: Implementación**

(Solo necesario si algún test falla.) Completar los routers que aún no aplican scope. Misma técnica que Task 1.2/1.3.

- [ ] **Step 4: Correr todos los tests de IDOR**

Comando: `pytest apps/api/tests/security/ -v -k idor`
Salida esperada: PASS en todos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/security/test_idor_ops.py \
        apps/api/tests/security/test_idor_carrera.py \
        apps/api/tests/security/test_idor_equipo.py \
        apps/api/tests/security/test_idor_beneficios.py \
        apps/api/tests/security/test_idor_egresos.py
git commit -m "security: tests P0-1 cobertura IDOR por router (ops/carrera/equipo/beneficios/egresos)"
```

---

### Task 1.5: Proteger /health/db-diag y /health/schema

**Hallazgo:** P0-7
**Files:**
- Modify: `apps/api/src/bomberos_api/routers/health.py:23-99`
- Create: `apps/api/tests/security/test_health_protected.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_health_protected.py`:

```python
"""P0-7: /health/db-diag y /health/schema no deben filtrar metadatos sin auth."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_db_diag_requiere_admin(client):
    r = await client.get("/health/db-diag")
    assert r.status_code in (401, 403), f"esperado 401/403, recibido {r.status_code}"


@pytest.mark.asyncio
async def test_health_schema_requiere_admin(client):
    r = await client.get("/health/schema")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_health_public_sigue_disponible(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_health_db_diag_ok_con_admin(client, make_test_user):
    u = await make_test_user("health_admin", roles=("ADMIN",))
    tok = (await client.post(
        "/auth/login", data={"username": u["usuario"], "password": u["password"]}
    )).json()["access_token"]
    r = await client.get(
        "/health/db-diag", headers={"Authorization": f"Bearer {tok}"}
    )
    assert r.status_code == 200
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_health_protected.py -v`
Salida esperada: FAIL — los dos primeros tests reciben 200.

- [ ] **Step 3: Implementación mínima**

Modificar `apps/api/src/bomberos_api/routers/health.py`. Añadir dependencia `require_role("ADMIN")`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy import text

from bomberos_api.config import get_settings
from bomberos_api.core.deps import DbSession, require_role
from bomberos_api.database import get_session_factory

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(db: DbSession) -> dict[str, str]:
    res = await db.execute(text("SELECT 1"))
    res.scalar_one()
    return {"status": "ok", "db": "ok"}


@router.get("/health/db-diag", dependencies=[Depends(require_role("ADMIN"))])
async def health_db_diag() -> dict:
    s = get_settings()
    url = s.database_url
    masked = url
    if "@" in url:
        prefix, suffix = url.split("@", 1)
        if "://" in prefix:
            proto, creds = prefix.split("://", 1)
            user = creds.split(":")[0] if ":" in creds else creds
            masked = f"{proto}://{user[:8]}***@{suffix}"
    out: dict = {"db_url_masked": masked}
    try:
        factory = get_session_factory()
        async with factory() as session:
            res = await session.execute(text("SELECT current_database(), current_user, version()"))
            row = res.first()
            out["connect_ok"] = True
            out["database"] = row[0]
            out["user"] = row[1]
            out["pg_version"] = row[2][:80]
    except Exception as e:
        out["connect_ok"] = False
        out["error"] = f"{type(e).__name__}: {str(e)[:500]}"
    return out


@router.get("/health/schema", dependencies=[Depends(require_role("ADMIN"))])
async def health_schema(db: DbSession) -> dict:
    out: dict = {}
    out["schemas"] = [
        r[0] for r in (await db.execute(text(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast','public') "
            "ORDER BY 1"
        ))).all()
    ]
    critical_tables = [
        ("seguridad", "usuarios"),
        ("seguridad", "roles"),
        ("seguridad", "usuario_roles"),
        ("seguridad", "modulos"),
        ("seguridad", "rol_permisos"),
        ("aud", "log_accesos"),
        ("aud", "log_cambios"),
        ("personal", "funcionarios"),
        ("core", "estados_civiles"),
    ]
    out["tables"] = {}
    for schema, table in critical_tables:
        exists = await db.scalar(text(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
            "WHERE table_schema=:s AND table_name=:t)"
        ).bindparams(s=schema, t=table))
        out["tables"][f"{schema}.{table}"] = bool(exists)
    try:
        admin = await db.execute(text(
            "SELECT id, activo, bloqueado, length(password_hash), intentos_fallidos "
            "FROM seguridad.usuarios WHERE usuario='admin'"
        ))
        row = admin.first()
        if row:
            out["admin"] = {
                "id": row[0],
                "activo": row[1],
                "bloqueado": row[2],
                "pwd_hash_len": row[3],
                "intentos_fallidos": row[4],
            }
        else:
            out["admin"] = "NOT FOUND"
    except Exception as e:
        out["admin"] = f"ERROR: {e}"
    return out
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_health_protected.py -v`
Salida esperada: PASS en los 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bomberos_api/routers/health.py \
        apps/api/tests/security/test_health_protected.py
git commit -m "security: fix P0-7 proteger /health/db-diag y /health/schema con require_role(ADMIN)"
```

---

### Task 1.6: Reemplazar python-jose por PyJWT

**Hallazgo:** P0-8 (CVE-2024-33663/33664)
**Files:**
- Modify: `apps/api/pyproject.toml:16`
- Modify: `apps/api/src/bomberos_api/core/security.py:1-56`
- Create: `apps/api/tests/security/test_jwt_pyjwt.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_jwt_pyjwt.py`:

```python
"""P0-8: el backend usa PyJWT (no python-jose). Verifica que jose no está
importado y que el roundtrip funciona con PyJWT directo."""
from __future__ import annotations

import sys

import jwt as pyjwt
import pytest

from bomberos_api.core.security import create_token, decode_token


def test_jose_no_importado():
    assert "jose" not in sys.modules, "python-jose sigue siendo importado"


def test_pyjwt_roundtrip():
    tok = create_token(99, "access", {"roles": ["MEDICO"]})
    decoded = decode_token(tok, expected_type="access")
    assert decoded["sub"] == "99"
    assert decoded["type"] == "access"
    assert decoded["roles"] == ["MEDICO"]


def test_pyjwt_rechaza_algoritmo_none():
    # Algorithm confusion CVE: si pasamos un token firmado con 'none', debe rechazarlo.
    from bomberos_api.config import get_settings
    s = get_settings()
    # Construir token con alg=none manualmente
    bad = pyjwt.encode({"sub": "1", "type": "access"}, "", algorithm="none")
    with pytest.raises(ValueError):
        decode_token(bad)
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_jwt_pyjwt.py -v`
Salida esperada: FAIL — `python-jose sigue siendo importado` y/o `ModuleNotFoundError: jwt`.

- [ ] **Step 3: Implementación mínima**

Editar `apps/api/pyproject.toml`. Reemplazar la línea:

```
    "python-jose[cryptography]>=3.3.0",
```

por:

```
    "pyjwt[crypto]>=2.10.0,<3",
```

Reescribir `apps/api/src/bomberos_api/core/security.py`:

```python
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt as pyjwt
from passlib.context import CryptContext

from bomberos_api.config import get_settings

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

TokenType = Literal["access", "refresh"]


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
    }
    if extra_claims:
        payload.update(extra_claims)
    return pyjwt.encode(payload, s.jwt_secret_key, algorithm=s.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    s = get_settings()
    try:
        payload = pyjwt.decode(
            token,
            s.jwt_secret_key,
            algorithms=[s.jwt_algorithm],  # algoritmo explícito: rechaza 'none' y confusión RS/HS
            options={"require": ["exp", "iat", "sub"]},
        )
    except pyjwt.PyJWTError as e:
        raise ValueError(f"token inválido: {e}") from e
    if expected_type and payload.get("type") != expected_type:
        raise ValueError(f"se esperaba token tipo '{expected_type}'")
    return payload
```

Instalar:

```bash
cd apps/api && pip uninstall -y python-jose && pip install -e ".[dev]"
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_jwt_pyjwt.py apps/api/tests/test_security.py -v`
Salida esperada: PASS (incluye el roundtrip preexistente).

- [ ] **Step 5: Commit**

```bash
git add apps/api/pyproject.toml apps/api/src/bomberos_api/core/security.py \
        apps/api/tests/security/test_jwt_pyjwt.py
git commit -m "security: fix P0-8 migrar python-jose a PyJWT 2.10 con algoritmo explícito"
```

---

### Task 1.7: Eliminar default de JWT_SECRET_KEY y forzar min_length=64

**Hallazgo:** P0-9
**Files:**
- Modify: `apps/api/src/bomberos_api/config.py:30`
- Create: `apps/api/tests/security/test_config_jwt_secret.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_config_jwt_secret.py`:

```python
"""P0-9: arranque debe fallar si JWT_SECRET_KEY no está seteado o es corto."""
from __future__ import annotations

import os

import pytest
from pydantic import ValidationError


def test_jwt_secret_corto_falla(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "short")
    # bust cache
    from bomberos_api.config import get_settings
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_jwt_secret_ausente_falla(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    from bomberos_api.config import get_settings
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        get_settings()


def test_jwt_secret_largo_ok(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "a" * 64)
    from bomberos_api.config import get_settings
    get_settings.cache_clear()
    s = get_settings()
    assert len(s.jwt_secret_key) >= 64
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_config_jwt_secret.py -v`
Salida esperada: FAIL — los dos primeros tests no fallan al instanciar Settings (porque el default `"dev-secret-change-me"` resuelve y `min_length=16` lo acepta).

- [ ] **Step 3: Implementación mínima**

En `apps/api/src/bomberos_api/config.py`, reemplazar la línea 30:

```python
    jwt_secret_key: str = Field(default="dev-secret-change-me", min_length=16)
```

por:

```python
    jwt_secret_key: str = Field(..., min_length=64)
```

(El `...` (Ellipsis) hace el campo obligatorio. Pydantic-settings lo lee desde env. Si no está, lanza `ValidationError` al instanciar.)

Notas para devs:
- En CI: setear `JWT_SECRET_KEY=$(python -c 'import secrets; print(secrets.token_urlsafe(64))')`.
- En `apps/api/.env`: poner un valor de 64+ chars.
- En producción intranet: viene del archivo de secrets (Task 1.20).

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `JWT_SECRET_KEY=$(python -c 'import secrets;print(secrets.token_urlsafe(64))') pytest apps/api/tests/security/test_config_jwt_secret.py -v`
Salida esperada: PASS los tres tests.

Verificar también que el resto de tests siguen pasando con env adecuado:

```bash
JWT_SECRET_KEY=$(python -c 'import secrets;print(secrets.token_urlsafe(64))') pytest apps/api/tests/ -v
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bomberos_api/config.py apps/api/tests/security/test_config_jwt_secret.py
git commit -m "security: fix P0-9 eliminar default JWT_SECRET_KEY, exigir min_length 64"
```

---

### Task 1.8: Lockout temporal exponencial

**Hallazgo:** P0-10
**Files:**
- Create: `apps/api/alembic/versions/p0_10_bloqueado_hasta.py`
- Modify: `apps/api/src/bomberos_api/models/usuario.py` (modelo Usuario)
- Modify: `apps/api/src/bomberos_api/routers/auth.py` (lógica de login)
- Create: `apps/api/tests/security/test_lockout_exponencial.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_lockout_exponencial.py`:

```python
"""P0-10: lockout exponencial con auto-unlock.

Política:
- 5 fallos consecutivos → bloquear 5 min.
- Si tras desbloquear automático vuelve a fallar 5 veces → 15 min.
- Si vuelve a fallar 5 veces → 1 h.
- A la 4ª serie (escalada=3) → bloqueo permanente (`bloqueado=TRUE`,
  `bloqueado_hasta=NULL`).
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text


async def _intentos(client, usuario, n):
    for _ in range(n):
        await client.post(
            "/auth/login",
            data={"username": usuario, "password": "Incorrect!"},
        )


@pytest.mark.asyncio
async def test_lockout_temporal_5min(client, db, make_test_user):
    u = await make_test_user("p010_lock", password="Sup3rPass!2026")
    await _intentos(client, u["usuario"], 5)
    bloq_hasta = await db.scalar(
        text("SELECT bloqueado_hasta FROM seguridad.usuarios WHERE id=:i")
        .bindparams(i=u["id"])
    )
    assert bloq_hasta is not None
    delta = bloq_hasta - datetime.now(UTC)
    assert timedelta(minutes=4) <= delta <= timedelta(minutes=6)

    # 6º intento durante el bloqueo: 403 sin verificar password
    r = await client.post(
        "/auth/login",
        data={"username": u["usuario"], "password": "Sup3rPass!2026"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_auto_unlock_tras_expirar(client, db, make_test_user):
    u = await make_test_user("p010_unlock", password="Sup3rPass!2026")
    # Simular: bloqueado_hasta en el pasado
    await db.execute(text(
        "UPDATE seguridad.usuarios SET intentos_fallidos=5, "
        "bloqueado_hasta = now() - interval '1 minute', escalada_bloqueo=1 "
        "WHERE id=:i"
    ).bindparams(i=u["id"]))
    await db.commit()
    r = await client.post(
        "/auth/login",
        data={"username": u["usuario"], "password": "Sup3rPass!2026"},
    )
    assert r.status_code == 200, r.text
    # auto-unlock + login exitoso resetea intentos
    intentos = await db.scalar(text(
        "SELECT intentos_fallidos FROM seguridad.usuarios WHERE id=:i"
    ).bindparams(i=u["id"]))
    assert intentos == 0
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_lockout_exponencial.py -v`
Salida esperada: FAIL — columna `bloqueado_hasta` no existe.

- [ ] **Step 3: Implementación mínima**

Crear migración Alembic `apps/api/alembic/versions/p0_10_bloqueado_hasta.py`:

```python
"""P0-10: añadir bloqueado_hasta y escalada_bloqueo

Revision ID: p0_10_bloqueado_hasta
Revises: <último head>
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "p0_10_bloqueado_hasta"
down_revision = None  # ajustar al head actual al ejecutar `alembic heads`
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "usuarios",
        sa.Column("bloqueado_hasta", sa.TIMESTAMP(timezone=True), nullable=True),
        schema="seguridad",
    )
    op.add_column(
        "usuarios",
        sa.Column(
            "escalada_bloqueo",
            sa.SmallInteger(),
            nullable=False,
            server_default="0",
        ),
        schema="seguridad",
    )


def downgrade() -> None:
    op.drop_column("usuarios", "escalada_bloqueo", schema="seguridad")
    op.drop_column("usuarios", "bloqueado_hasta", schema="seguridad")
```

Aplicar: `cd apps/api && alembic upgrade head`.

Modificar `apps/api/src/bomberos_api/models/usuario.py` para añadir las dos columnas al modelo `Usuario`:

```python
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    escalada_bloqueo: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
```

(Asegurar imports de `datetime`, `SmallInteger`, `DateTime` en el head del archivo.)

Modificar `apps/api/src/bomberos_api/routers/auth.py`. Añadir constantes y helper al tope del módulo:

```python
LOCKOUT_LADDER_MINUTES = [5, 15, 60]  # escalada 0→5min, 1→15min, 2→60min, 3→permanente


def _aplicar_lockout(user) -> None:
    """Llama tras alcanzar MAX_INTENTOS_FALLIDOS. Sube escalada, fija
    bloqueado_hasta o bloqueo permanente."""
    nivel = user.escalada_bloqueo or 0
    if nivel >= len(LOCKOUT_LADDER_MINUTES):
        user.bloqueado = True
        user.motivo_bloqueo = "Excedió 3 series consecutivas de intentos fallidos"
        user.bloqueado_hasta = None
    else:
        minutos = LOCKOUT_LADDER_MINUTES[nivel]
        user.bloqueado_hasta = datetime.now(UTC) + timedelta(minutes=minutos)
        user.escalada_bloqueo = nivel + 1
        user.motivo_bloqueo = (
            f"5 intentos fallidos consecutivos; bloqueo temporal {minutos} min"
        )
```

(Importar `timedelta` desde `datetime` si falta.)

En el handler `login`, justo después del check `if user.bloqueado:` actual, añadir el chequeo temporal:

```python
    # Bloqueo permanente
    if user.bloqueado:
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="bloqueada"
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta bloqueada. Contacta al administrador.",
        )

    # Bloqueo temporal
    if user.bloqueado_hasta and user.bloqueado_hasta > datetime.now(UTC):
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="bloqueo_temporal_vigente"
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cuenta bloqueada temporalmente hasta {user.bloqueado_hasta.isoformat()}",
        )

    # Auto-unlock: si bloqueado_hasta venció, limpiar para que el verify_password decida
    if user.bloqueado_hasta and user.bloqueado_hasta <= datetime.now(UTC):
        user.bloqueado_hasta = None
        user.intentos_fallidos = 0
```

Reemplazar el bloque del verify fallido para usar la escalera:

```python
    if not verify_password(form.password, user.password_hash):
        user.intentos_fallidos = (user.intentos_fallidos or 0) + 1
        if user.intentos_fallidos >= MAX_INTENTOS_FALLIDOS:
            _aplicar_lockout(user)
            await _log_acceso(
                db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
                tipo_evento="BLOQUEO", detalle=user.motivo_bloqueo
            )
        await _log_acceso(
            db, usuario_id=user.id, usuario=user.usuario, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle=f"intento_{user.intentos_fallidos}"
        )
        await db.commit()
        raise invalid_exc
```

En la rama de login exitoso, resetear escalada SOLO tras éxito sostenido:

```python
    # Login exitoso
    user.intentos_fallidos = 0
    user.bloqueado_hasta = None
    user.escalada_bloqueo = 0
    user.ultimo_acceso = datetime.now(UTC)
    user.ultimo_ip = ip
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_lockout_exponencial.py -v`
Salida esperada: PASS los dos tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/alembic/versions/p0_10_bloqueado_hasta.py \
        apps/api/src/bomberos_api/models/usuario.py \
        apps/api/src/bomberos_api/routers/auth.py \
        apps/api/tests/security/test_lockout_exponencial.py
git commit -m "security: fix P0-10 lockout exponencial con auto-unlock"
```

---

### Task 1.9: Timing-safe login (rama usuario inexistente)

**Hallazgo:** P0-11
**Files:**
- Modify: `apps/api/src/bomberos_api/routers/auth.py:86-91`
- Create: `apps/api/tests/security/test_login_timing.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_login_timing.py`:

```python
"""P0-11: el tiempo de login para usuario inexistente debe estar dentro
del ±20% del tiempo para usuario existente con password erróneo.

(El bcrypt verify domina el tiempo del segundo path; el primero debe
ejecutar un verify dummy para igualar.)"""
from __future__ import annotations

import time

import pytest


async def _medir(client, usuario):
    t0 = time.perf_counter()
    await client.post(
        "/auth/login",
        data={"username": usuario, "password": "wrong"},
    )
    return time.perf_counter() - t0


@pytest.mark.asyncio
async def test_login_timing_diferencia_baja(client, make_test_user):
    u = await make_test_user("timing_real", password="Sup3rPass!2026")
    # Warmup (JIT, conexiones, bcrypt internal)
    for _ in range(3):
        await _medir(client, u["usuario"])
        await _medir(client, "this-user-does-not-exist-xyz")

    n = 6
    t_real = sum(await _medir(client, u["usuario"]) for _ in range(n)) / n
    t_fake = sum(
        await _medir(client, "this-user-does-not-exist-xyz") for _ in range(n)
    ) / n

    ratio = max(t_real, t_fake) / max(min(t_real, t_fake), 1e-6)
    # bcrypt(12) ≈ 250ms; sin dummy verify, t_fake ≈ 5ms → ratio ~50.
    # Con dummy verify aplicado, ratio debe ser ≤ 2.0.
    assert ratio <= 2.0, f"timing leak: ratio={ratio:.2f} (real={t_real*1000:.0f}ms fake={t_fake*1000:.0f}ms)"
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_login_timing.py -v`
Salida esperada: FAIL — `timing leak: ratio=50+`.

- [ ] **Step 3: Implementación mínima**

Modificar `apps/api/src/bomberos_api/routers/auth.py`. Añadir constante al tope (después de `MAX_INTENTOS_FALLIDOS`):

```python
# Hash bcrypt fijo (12 rounds) sobre la cadena 'dummy' — usado para timing-safe
# login en la rama "usuario inexistente". Generado una vez con hash_password('dummy').
_DUMMY_BCRYPT_HASH = "$2b$12$kE5fX5oXJ8mC0pHfP8YQfO/2WkQ8PqYbXxAcG7l7sZ7gJxQ4ZqYzC"
```

(Generar con `python -c "from bomberos_api.core.security import hash_password; print(hash_password('dummy'))"` y reemplazar el literal.)

Modificar la rama `if user is None:`:

```python
    if user is None:
        # P0-11: verify dummy para igualar tiempos con bcrypt verify real
        verify_password(form.password, _DUMMY_BCRYPT_HASH)
        await _log_acceso(
            db, usuario_id=None, usuario=form.username, ip=ip, user_agent=ua,
            tipo_evento="LOGIN_FALLIDO", detalle="usuario_inexistente"
        )
        await db.commit()
        raise invalid_exc
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_login_timing.py -v`
Salida esperada: PASS con `ratio` típicamente ≤ 1.2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bomberos_api/routers/auth.py \
        apps/api/tests/security/test_login_timing.py
git commit -m "security: fix P0-11 timing-safe login con verify dummy en rama usuario inexistente"
```

---

### Task 1.10: Tests adicionales de regresión sobre auth

**Hallazgo:** P0-2, P0-8, P0-10 (cobertura adicional)
**Files:**
- Create: `apps/api/tests/security/test_auth_regression.py`

- [ ] **Step 1: Escribir test**

Crear `apps/api/tests/security/test_auth_regression.py`:

```python
"""Regression suite para auth — fuerza que los fixes de P0-2/8/10
no se rompan al refactorizar."""
from __future__ import annotations

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_login_exitoso_resetea_escalada(client, db, make_test_user):
    u = await make_test_user("regr_login", password="Sup3rPass!2026")
    # Forzar estado "ya tuvo lockout"
    await db.execute(text(
        "UPDATE seguridad.usuarios SET escalada_bloqueo=2, intentos_fallidos=3 "
        "WHERE id=:i"
    ).bindparams(i=u["id"]))
    await db.commit()

    r = await client.post(
        "/auth/login",
        data={"username": u["usuario"], "password": "Sup3rPass!2026"},
    )
    assert r.status_code == 200
    row = await db.execute(text(
        "SELECT intentos_fallidos, escalada_bloqueo, bloqueado_hasta "
        "FROM seguridad.usuarios WHERE id=:i"
    ).bindparams(i=u["id"]))
    intentos, esc, bh = row.first()
    assert intentos == 0
    assert esc == 0
    assert bh is None


@pytest.mark.asyncio
async def test_jwt_token_decodifica_con_pyjwt(client, make_test_user):
    import jwt as pyjwt
    from bomberos_api.config import get_settings

    u = await make_test_user("regr_jwt", password="Sup3rPass!2026")
    r = await client.post(
        "/auth/login",
        data={"username": u["usuario"], "password": u["password"]},
    )
    access = r.json()["access_token"]
    s = get_settings()
    decoded = pyjwt.decode(access, s.jwt_secret_key, algorithms=[s.jwt_algorithm])
    assert decoded["sub"] == str(u["id"])
    assert decoded["type"] == "access"
    assert isinstance(decoded["roles"], list)
```

- [ ] **Step 2: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_auth_regression.py -v`
Salida esperada: PASS los dos tests.

- [ ] **Step 3: Implementación**

(No requerida — las correcciones previas ya cubren este path.)

- [ ] **Step 4: Correr suite completa**

Comando: `pytest apps/api/tests/security/ -v`
Salida esperada: PASS todos los tests del módulo `security`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/security/test_auth_regression.py
git commit -m "test: security regression de auth (login exitoso/PyJWT compat)"
```

---

# Bloque BD — Tareas 1.11 a 1.18

### Task 1.11: Crear roles bomberos_app/readonly/backup + helper pg_assert

**Hallazgo:** P0-4
**Files:**
- Create: `sql/06_seguridad_rls.sql`
- Modify: `sql/99_run_all.sql` (añadir referencia a 06)
- Create: `tests/sql/_lib.sql` (helper compartido)
- Create: `tests/sql/test_roles_existen.sql`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/sql/_lib.sql`:

```sql
-- tests/sql/_lib.sql — helpers reutilizables por todos los tests SQL.
-- Se inyecta con \i al principio de cada test.

CREATE OR REPLACE FUNCTION pg_assert(cond BOOLEAN, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF NOT cond THEN
        RAISE EXCEPTION 'ASSERT FAILED: %', msg;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_assert_eq(actual ANYELEMENT, expected ANYELEMENT, msg TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'ASSERT FAILED: % (actual=%, expected=%)', msg, actual, expected;
    END IF;
END;
$$;
```

Crear `tests/sql/test_roles_existen.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

SELECT pg_assert(
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bomberos_app'),
    'rol bomberos_app no existe'
);
SELECT pg_assert(
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bomberos_readonly'),
    'rol bomberos_readonly no existe'
);
SELECT pg_assert(
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bomberos_backup'),
    'rol bomberos_backup no existe'
);

-- Ninguno debe ser superuser o bypassrls
SELECT pg_assert(
    NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname IN ('bomberos_app','bomberos_readonly','bomberos_backup')
          AND (rolsuper OR rolbypassrls OR rolcreaterole)
    ),
    'algún rol bomberos_* tiene privilegios excesivos'
);

ROLLBACK;
\echo 'OK test_roles_existen'
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f tests/sql/test_roles_existen.sql
```
Salida esperada: `ASSERT FAILED: rol bomberos_app no existe`.

- [ ] **Step 3: Implementación mínima**

Crear `sql/06_seguridad_rls.sql`:

```sql
-- =============================================================================
-- 06_seguridad_rls.sql — Roles PG separados + RLS + policies
-- P0-3, P0-4
-- =============================================================================

-- Roles base. NOLOGIN para los roles "tipo"; un usuario login se mapea a ellos
-- via GRANT al rol login real que use la app (ej. bomberos_api_user).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomberos_app') THEN
        CREATE ROLE bomberos_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomberos_readonly') THEN
        CREATE ROLE bomberos_readonly NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bomberos_backup') THEN
        CREATE ROLE bomberos_backup NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
    END IF;
END $$;

-- Grants de lectura/escritura mínimos por schema para bomberos_app
GRANT USAGE ON SCHEMA core, geo, org, personal, salud, ops, carrera,
                  equipo, beneficios, vivienda, egresos, documentos,
                  seguridad, sys, aud
      TO bomberos_app;

GRANT SELECT, INSERT, UPDATE, DELETE
      ON ALL TABLES IN SCHEMA core, geo, org, personal, salud, ops, carrera,
                              equipo, beneficios, vivienda, egresos, documentos,
                              seguridad, sys
      TO bomberos_app;

-- aud: solo SELECT + INSERT — UPDATE/DELETE prohibidos (P0-5 lo refuerza con trigger)
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA aud TO bomberos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA aud FROM bomberos_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, geo, org, personal, salud,
                                                  ops, carrera, equipo, beneficios,
                                                  vivienda, egresos, documentos,
                                                  seguridad, sys, aud
      TO bomberos_app;

-- Default privileges para tablas/sequences que se creen luego
ALTER DEFAULT PRIVILEGES IN SCHEMA core, geo, org, personal, salud, ops, carrera,
                                    equipo, beneficios, vivienda, egresos, documentos,
                                    seguridad, sys
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bomberos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA aud
    GRANT SELECT, INSERT ON TABLES TO bomberos_app;

-- bomberos_readonly: solo SELECT en todo (dashboards, BI internos)
GRANT USAGE ON SCHEMA core, geo, org, personal, salud, ops, carrera,
                  equipo, beneficios, vivienda, egresos, documentos,
                  seguridad, sys, aud
      TO bomberos_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA core, geo, org, personal, salud, ops,
                                       carrera, equipo, beneficios, vivienda,
                                       egresos, documentos, seguridad, sys, aud
      TO bomberos_readonly;

-- bomberos_backup: SELECT en todo + USAGE; corre pg_dump
GRANT USAGE ON SCHEMA core, geo, org, personal, salud, ops, carrera,
                  equipo, beneficios, vivienda, egresos, documentos,
                  seguridad, sys, aud
      TO bomberos_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA core, geo, org, personal, salud, ops,
                                       carrera, equipo, beneficios, vivienda,
                                       egresos, documentos, seguridad, sys, aud
      TO bomberos_backup;

-- NOTA: el resto del archivo (RLS enable + policies) se añade en Tasks 1.12 y 1.13.
```

Actualizar `sql/99_run_all.sql` para incluir 06_seguridad_rls.sql al final:

```sql
-- Al final, después de 07_roles_por_departamento.sql:
\i 06_seguridad_rls.sql
```

Aplicar:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f sql/06_seguridad_rls.sql
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f tests/sql/test_roles_existen.sql
```
Salida esperada: `OK test_roles_existen`.

- [ ] **Step 5: Commit**

```bash
git add sql/06_seguridad_rls.sql sql/99_run_all.sql \
        tests/sql/_lib.sql tests/sql/test_roles_existen.sql
git commit -m "security: fix P0-4 crear roles bomberos_app/readonly/backup sin BYPASSRLS"
```

---

### Task 1.12: ENABLE + FORCE RLS en tablas de dominio

**Hallazgo:** P0-3
**Files:**
- Modify: `sql/06_seguridad_rls.sql` (sección RLS enable)
- Create: `tests/sql/test_rls_enabled.sql`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/sql/test_rls_enabled.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

-- Tablas que DEBEN tener RLS activado + forced
WITH expected(schema_name, table_name) AS (
    VALUES
      ('personal','funcionarios'),
      ('salud','reposos'),
      ('salud','lesiones'),
      ('salud','evaluacion_fisica'),
      ('ops','permisos'),
      ('ops','vacaciones'),
      ('ops','comisiones_servicio'),
      ('ops','faltas'),
      ('carrera','cursos_realizados'),
      ('carrera','ascensos'),
      ('carrera','evaluaciones'),
      ('carrera','reconocimientos'),
      ('equipo','proteccion_asignaciones'),
      ('equipo','radios_asignaciones'),
      ('beneficios','ayudas_economicas'),
      ('egresos','jubilados'),
      ('egresos','fallecimientos'),
      ('documentos','acervo_personal'),
      ('seguridad','usuarios')
), faltantes AS (
    SELECT e.schema_name, e.table_name
      FROM expected e
      JOIN pg_class c
        ON c.relname = e.table_name
      JOIN pg_namespace n
        ON n.oid = c.relnamespace
       AND n.nspname = e.schema_name
     WHERE NOT (c.relrowsecurity AND c.relforcerowsecurity)
)
SELECT pg_assert(
    NOT EXISTS (SELECT 1 FROM faltantes),
    'RLS no activado/forzado en: ' || COALESCE(
        (SELECT string_agg(schema_name || '.' || table_name, ', ')
           FROM faltantes), '<none>'
    )
);

ROLLBACK;
\echo 'OK test_rls_enabled'
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `psql ... -f tests/sql/test_rls_enabled.sql`
Salida esperada: `ASSERT FAILED: RLS no activado/forzado en: personal.funcionarios, salud.reposos, ...`.

- [ ] **Step 3: Implementación mínima**

Añadir al final de `sql/06_seguridad_rls.sql`:

```sql
-- =============================================================================
-- ENABLE + FORCE ROW LEVEL SECURITY (P0-3)
-- =============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND n.nspname IN (
               'personal','salud','ops','carrera','equipo',
               'beneficios','egresos','documentos','seguridad'
           )
           -- Excluir tablas de catálogo puro de seguridad que no llevan scope
           AND NOT (n.nspname = 'seguridad'
                    AND c.relname IN ('roles','modulos','rol_permisos','usuario_permisos'))
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
            r.schema_name, r.table_name
        );
        EXECUTE format(
            'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
            r.schema_name, r.table_name
        );
    END LOOP;
END $$;
```

Aplicar:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f sql/06_seguridad_rls.sql
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `psql ... -f tests/sql/test_rls_enabled.sql`
Salida esperada: `OK test_rls_enabled`.

- [ ] **Step 5: Commit**

```bash
git add sql/06_seguridad_rls.sql tests/sql/test_rls_enabled.sql
git commit -m "security: fix P0-3 ENABLE+FORCE row level security en tablas de dominio"
```

---

### Task 1.13: Policies RLS basadas en app.usuario_id + usuario_scopes

**Hallazgo:** P0-3
**Files:**
- Modify: `sql/06_seguridad_rls.sql` (sección policies)
- Create: `tests/sql/test_rls_policies_definidas.sql`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/sql/test_rls_policies_definidas.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

-- Cada tabla con RLS debe tener al menos UNA policy SELECT y UNA INSERT/UPDATE.
WITH tablas_rls AS (
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND c.relrowsecurity
       AND n.nspname IN ('personal','salud','ops','carrera','equipo',
                         'beneficios','egresos','documentos','seguridad')
), sin_policy AS (
    SELECT t.schema_name, t.table_name
      FROM tablas_rls t
      LEFT JOIN pg_policies p
        ON p.schemaname = t.schema_name
       AND p.tablename = t.table_name
     GROUP BY t.schema_name, t.table_name
    HAVING count(p.policyname) = 0
)
SELECT pg_assert(
    NOT EXISTS (SELECT 1 FROM sin_policy),
    'Tablas con RLS sin policies: ' || COALESCE(
        (SELECT string_agg(schema_name||'.'||table_name, ', ') FROM sin_policy),
        '<none>'
    )
);

ROLLBACK;
\echo 'OK test_rls_policies_definidas'
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `psql ... -f tests/sql/test_rls_policies_definidas.sql`
Salida esperada: `ASSERT FAILED: Tablas con RLS sin policies: personal.funcionarios, ...`.

- [ ] **Step 3: Implementación mínima**

Añadir al final de `sql/06_seguridad_rls.sql`:

```sql
-- =============================================================================
-- POLICIES (P0-3)
-- =============================================================================

-- Helper: ¿el usuario actual está habilitado para bypass por mantenimiento?
CREATE OR REPLACE FUNCTION sys.fn_rls_bypass()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('app.bypass_rls', TRUE), '')::BOOLEAN,
        FALSE
    );
$$;

-- Helper: usuario actual (NULL si no seteado → la policy lo rechaza)
CREATE OR REPLACE FUNCTION sys.fn_app_usuario_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.usuario_id', TRUE), '')::BIGINT;
$$;

-- Helper: ¿usuario actual es ADMIN?
CREATE OR REPLACE FUNCTION sys.fn_app_es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM seguridad.usuario_roles ur
          JOIN seguridad.roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = sys.fn_app_usuario_id()
           AND r.codigo = 'ADMIN'
    );
$$;

-- Helper: ¿el funcionario está en algún scope del usuario actual?
CREATE OR REPLACE FUNCTION sys.fn_funcionario_en_scope(p_funcionario_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT
        -- Sin scopes asignados → sin restricción (semántica heredada del API)
        NOT EXISTS (
            SELECT 1 FROM seguridad.usuario_scopes us
             WHERE us.usuario_id = sys.fn_app_usuario_id()
        )
        OR EXISTS (
            SELECT 1
              FROM personal.funcionarios f
              JOIN seguridad.usuario_scopes us
                ON us.usuario_id = sys.fn_app_usuario_id()
             WHERE f.id = p_funcionario_id
               AND (us.zona_id     IS NULL OR f.zona_id     = us.zona_id)
               AND (us.estacion_id IS NULL OR f.estacion_id = us.estacion_id)
               AND (us.division_id IS NULL OR f.division_id = us.division_id)
               AND (us.area_id     IS NULL OR f.area_id     = us.area_id)
        );
$$;

-- Macro para tablas con columna funcionario_id: crea policy "scope"
CREATE OR REPLACE FUNCTION sys.fn_attach_rls_policy(p_schema TEXT, p_table TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_qual TEXT := format('%I.%I', p_schema, p_table);
    v_policy TEXT := format('rls_scope_%s', p_table);
BEGIN
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', v_policy, v_qual);
    EXECUTE format($p$
        CREATE POLICY %I ON %s
        USING (
            sys.fn_rls_bypass()
            OR sys.fn_app_es_admin()
            OR sys.fn_funcionario_en_scope(funcionario_id)
        )
        WITH CHECK (
            sys.fn_rls_bypass()
            OR sys.fn_app_es_admin()
            OR sys.fn_funcionario_en_scope(funcionario_id)
        )
    $p$, v_policy, v_qual);
END $$;

-- Aplicar policy a tablas con columna funcionario_id
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid
         WHERE c.relkind = 'r' AND c.relrowsecurity
           AND a.attname = 'funcionario_id'
           AND a.attnum > 0
           AND n.nspname IN ('salud','ops','carrera','equipo','beneficios',
                             'egresos','documentos')
    LOOP
        PERFORM sys.fn_attach_rls_policy(r.schema_name, r.table_name);
    END LOOP;
END $$;

-- personal.funcionarios (la tabla maestra) — policy por id, no funcionario_id
DROP POLICY IF EXISTS rls_scope_funcionarios ON personal.funcionarios;
CREATE POLICY rls_scope_funcionarios ON personal.funcionarios
USING (
    sys.fn_rls_bypass()
    OR sys.fn_app_es_admin()
    OR sys.fn_funcionario_en_scope(id)
)
WITH CHECK (
    sys.fn_rls_bypass()
    OR sys.fn_app_es_admin()
    OR sys.fn_funcionario_en_scope(id)
);

-- seguridad.usuarios: cada usuario solo lee/edita su propia fila, admin todo
DROP POLICY IF EXISTS rls_self_usuario ON seguridad.usuarios;
CREATE POLICY rls_self_usuario ON seguridad.usuarios
USING (
    sys.fn_rls_bypass()
    OR sys.fn_app_es_admin()
    OR id = sys.fn_app_usuario_id()
)
WITH CHECK (
    sys.fn_rls_bypass()
    OR sys.fn_app_es_admin()
    OR id = sys.fn_app_usuario_id()
);
```

Aplicar:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f sql/06_seguridad_rls.sql
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `psql ... -f tests/sql/test_rls_policies_definidas.sql`
Salida esperada: `OK test_rls_policies_definidas`.

- [ ] **Step 5: Commit**

```bash
git add sql/06_seguridad_rls.sql tests/sql/test_rls_policies_definidas.sql
git commit -m "security: fix P0-3 policies RLS basadas en app.usuario_id + usuario_scopes"
```

---

### Task 1.14: Test SQL de aislamiento RLS con 2 usuarios

**Hallazgo:** P0-3 (verificación efectiva)
**Files:**
- Create: `tests/sql/test_rls_isolation.sql`

- [ ] **Step 1: Escribir test que falla (o pasa si las policies funcionan)**

Crear `tests/sql/test_rls_isolation.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

-- Setup: dos usuarios, dos funcionarios en zonas distintas, dos reposos.
INSERT INTO seguridad.roles (codigo, nombre, descripcion)
VALUES ('VISTA','Vista','test')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO seguridad.usuarios (usuario, nombre_completo, correo, password_hash,
                                activo, debe_cambiar_password)
VALUES ('rls_test_u1','U1','u1@t.local','$2b$12$xxx', TRUE, FALSE),
       ('rls_test_u2','U2','u2@t.local','$2b$12$xxx', TRUE, FALSE);

WITH u1 AS (SELECT id FROM seguridad.usuarios WHERE usuario='rls_test_u1'),
     u2 AS (SELECT id FROM seguridad.usuarios WHERE usuario='rls_test_u2'),
     rv AS (SELECT id FROM seguridad.roles WHERE codigo='VISTA')
INSERT INTO seguridad.usuario_roles (usuario_id, rol_id)
SELECT u1.id, rv.id FROM u1, rv
UNION ALL
SELECT u2.id, rv.id FROM u2, rv;

INSERT INTO seguridad.usuario_scopes (usuario_id, zona_id)
SELECT u.id, 1 FROM seguridad.usuarios u WHERE u.usuario='rls_test_u1';
INSERT INTO seguridad.usuario_scopes (usuario_id, zona_id)
SELECT u.id, 2 FROM seguridad.usuarios u WHERE u.usuario='rls_test_u2';

INSERT INTO personal.funcionarios
    (nacionalidad, cedula, apellidos, nombres, fecha_nacimiento, sexo,
     fecha_primer_ingreso, zona_id)
VALUES ('V', 99999991, 'RLS','U1','1990-01-01','M','2020-01-01', 1),
       ('V', 99999992, 'RLS','U2','1990-01-01','M','2020-01-01', 2);

INSERT INTO salud.reposos (funcionario_id, fecha_inicio, fecha_fin, dias, motivo)
SELECT id, '2026-01-01','2026-01-05',5,'rls test'
  FROM personal.funcionarios WHERE cedula IN (99999991, 99999992);

-- Act: setear usuario_id = u1 y consultar como bomberos_app
SET LOCAL ROLE bomberos_app;
SELECT set_config(
    'app.usuario_id',
    (SELECT id::text FROM seguridad.usuarios WHERE usuario='rls_test_u1'),
    TRUE
);

-- u1 (zona 1) debe ver solo el reposo del funcionario zona 1
SELECT pg_assert_eq(
    (SELECT count(*)::INT FROM salud.reposos WHERE motivo='rls test'),
    1,
    'u1 debe ver exactamente 1 reposo (zona 1)'
);

-- También vía personal.funcionarios
SELECT pg_assert_eq(
    (SELECT count(*)::INT FROM personal.funcionarios WHERE cedula IN (99999991, 99999992)),
    1,
    'u1 debe ver solo 1 funcionario (zona 1)'
);

-- u2 (zona 2)
RESET ROLE;
SET LOCAL ROLE bomberos_app;
SELECT set_config(
    'app.usuario_id',
    (SELECT id::text FROM seguridad.usuarios WHERE usuario='rls_test_u2'),
    TRUE
);
SELECT pg_assert_eq(
    (SELECT count(*)::INT FROM salud.reposos WHERE motivo='rls test'),
    1,
    'u2 debe ver exactamente 1 reposo (zona 2)'
);

-- Bypass: debe ver los 2
RESET ROLE;
SET LOCAL ROLE bomberos_app;
SELECT set_config('app.bypass_rls','true',TRUE);
SELECT pg_assert_eq(
    (SELECT count(*)::INT FROM salud.reposos WHERE motivo='rls test'),
    2,
    'bypass_rls=true debe revelar 2 reposos'
);

ROLLBACK;
\echo 'OK test_rls_isolation'
```

- [ ] **Step 2: Correr test y verificar que pasa**

Comando:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f tests/sql/test_rls_isolation.sql
```
Salida esperada: `OK test_rls_isolation`.

Si falla, revisar policies de Task 1.13.

- [ ] **Step 3: Implementación**

(No requerida si las policies de 1.13 son correctas.)

- [ ] **Step 4: Verificar de nuevo**

Mismo comando.

- [ ] **Step 5: Commit**

```bash
git add tests/sql/test_rls_isolation.sql
git commit -m "test: P0-3 aislamiento RLS verificado con 2 usuarios y bypass"
```

---

### Task 1.15: Bloquear UPDATE/DELETE/TRUNCATE en aud.* + REVOKE

**Hallazgo:** P0-5
**Files:**
- Modify: `sql/06_seguridad_rls.sql` (sección audit append-only)
- Create: `tests/sql/test_aud_append_only.sql`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/sql/test_aud_append_only.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

-- Insertar un registro para tener qué actualizar
INSERT INTO aud.log_accesos (usuario, tipo_evento, detalle)
VALUES ('aud_test', 'LOGIN', 'baseline');

-- Intento UPDATE: debe lanzar excepción
DO $$
BEGIN
    BEGIN
        UPDATE aud.log_accesos SET detalle='manipulado' WHERE usuario='aud_test';
        PERFORM pg_assert(FALSE, 'UPDATE en aud.log_accesos no fue bloqueado');
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_assert(
            SQLERRM ILIKE '%append-only%' OR SQLERRM ILIKE '%no se puede modificar%',
            'UPDATE bloqueado pero con mensaje incorrecto: ' || SQLERRM
        );
    END;
END $$;

-- Intento DELETE: debe lanzar excepción
DO $$
BEGIN
    BEGIN
        DELETE FROM aud.log_accesos WHERE usuario='aud_test';
        PERFORM pg_assert(FALSE, 'DELETE en aud.log_accesos no fue bloqueado');
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_assert(TRUE, 'DELETE bloqueado correctamente');
    END;
END $$;

-- Intento TRUNCATE: debe lanzar excepción
DO $$
BEGIN
    BEGIN
        TRUNCATE aud.log_accesos;
        PERFORM pg_assert(FALSE, 'TRUNCATE en aud.log_accesos no fue bloqueado');
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_assert(TRUE, 'TRUNCATE bloqueado correctamente');
    END;
END $$;

-- Mismo para log_cambios
INSERT INTO aud.log_cambios (schema_name, table_name, registro_id, operacion, valor_nuevo)
VALUES ('test', 'test', '1', 'I', '{"a":1}'::jsonb);

DO $$
BEGIN
    BEGIN
        UPDATE aud.log_cambios SET schema_name='hacked' WHERE table_name='test';
        PERFORM pg_assert(FALSE, 'UPDATE en aud.log_cambios no fue bloqueado');
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_assert(TRUE, 'UPDATE log_cambios bloqueado correctamente');
    END;
END $$;

ROLLBACK;
\echo 'OK test_aud_append_only'
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `psql ... -f tests/sql/test_aud_append_only.sql`
Salida esperada: `ASSERT FAILED: UPDATE en aud.log_accesos no fue bloqueado`.

- [ ] **Step 3: Implementación mínima**

Añadir al final de `sql/06_seguridad_rls.sql`:

```sql
-- =============================================================================
-- AUDIT APPEND-ONLY (P0-5)
-- =============================================================================

-- Trigger que bloquea cualquier modificación al log
CREATE OR REPLACE FUNCTION aud.fn_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'aud.% es append-only; no se puede modificar (op=%)',
                    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Aplicar a aud.log_cambios y aud.log_accesos
DROP TRIGGER IF EXISTS tr_block_mutation_log_cambios ON aud.log_cambios;
CREATE TRIGGER tr_block_mutation_log_cambios
    BEFORE UPDATE OR DELETE OR TRUNCATE ON aud.log_cambios
    FOR EACH STATEMENT EXECUTE FUNCTION aud.fn_block_mutation();

DROP TRIGGER IF EXISTS tr_block_mutation_log_accesos ON aud.log_accesos;
CREATE TRIGGER tr_block_mutation_log_accesos
    BEFORE UPDATE OR DELETE OR TRUNCATE ON aud.log_accesos
    FOR EACH STATEMENT EXECUTE FUNCTION aud.fn_block_mutation();

-- Trigger BEFORE EACH ROW para UPDATE/DELETE (defensa por si statement-level se evade)
DROP TRIGGER IF EXISTS tr_block_mutation_row_log_cambios ON aud.log_cambios;
CREATE TRIGGER tr_block_mutation_row_log_cambios
    BEFORE UPDATE OR DELETE ON aud.log_cambios
    FOR EACH ROW EXECUTE FUNCTION aud.fn_block_mutation();

DROP TRIGGER IF EXISTS tr_block_mutation_row_log_accesos ON aud.log_accesos;
CREATE TRIGGER tr_block_mutation_row_log_accesos
    BEFORE UPDATE OR DELETE ON aud.log_accesos
    FOR EACH ROW EXECUTE FUNCTION aud.fn_block_mutation();

-- REVOKE explícito (defense in depth)
REVOKE UPDATE, DELETE, TRUNCATE ON aud.log_cambios FROM PUBLIC, bomberos_app;
REVOKE UPDATE, DELETE, TRUNCATE ON aud.log_accesos FROM PUBLIC, bomberos_app;
```

Aplicar:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f sql/06_seguridad_rls.sql
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `psql ... -f tests/sql/test_aud_append_only.sql`
Salida esperada: `OK test_aud_append_only`.

- [ ] **Step 5: Commit**

```bash
git add sql/06_seguridad_rls.sql tests/sql/test_aud_append_only.sql
git commit -m "security: fix P0-5 audit append-only con trigger + REVOKE en aud.*"
```

---

### Task 1.16: Hash chain SHA-256 en aud.log_cambios y aud.log_accesos

**Hallazgo:** P0-5 (tamper-evidence)
**Files:**
- Modify: `sql/06_seguridad_rls.sql` (sección hash chain)
- Modify: `sql/03_funciones_vistas.sql:97-144` (`aud.fn_audit`)
- Create: `tests/sql/test_aud_hash_chain.sql`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/sql/test_aud_hash_chain.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

-- Generar 3 inserts y verificar hash chain
INSERT INTO aud.log_accesos (usuario, tipo_evento, detalle)
VALUES ('chain_test_u', 'LOGIN', 'a');
INSERT INTO aud.log_accesos (usuario, tipo_evento, detalle)
VALUES ('chain_test_u', 'LOGIN', 'b');
INSERT INTO aud.log_accesos (usuario, tipo_evento, detalle)
VALUES ('chain_test_u', 'LOGIN', 'c');

-- 1) record_hash existe y no es NULL en ninguno
SELECT pg_assert_eq(
    (SELECT count(*)::INT FROM aud.log_accesos
      WHERE usuario='chain_test_u' AND record_hash IS NULL),
    0,
    'record_hash NULL detectado'
);

-- 2) prev_hash del N+1 == record_hash del N
WITH chain AS (
    SELECT id, prev_hash, record_hash,
           LAG(record_hash) OVER (ORDER BY id) AS expected_prev
      FROM aud.log_accesos
     WHERE usuario='chain_test_u'
     ORDER BY id
), roto AS (
    SELECT count(*) AS n FROM chain
     WHERE expected_prev IS NOT NULL AND expected_prev IS DISTINCT FROM prev_hash
)
SELECT pg_assert_eq(
    (SELECT n::INT FROM roto),
    0,
    'hash chain roto: prev_hash != record_hash anterior'
);

ROLLBACK;
\echo 'OK test_aud_hash_chain'
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `psql ... -f tests/sql/test_aud_hash_chain.sql`
Salida esperada: FAIL — columnas `prev_hash`/`record_hash` no existen.

- [ ] **Step 3: Implementación mínima**

Añadir columnas: editar `sql/02_dominio.sql` líneas 1644-1646 (al final del `CREATE TABLE aud.log_cambios`) y 1664 (al final del `CREATE TABLE aud.log_accesos`). Para BD ya creada, usar migración inline en `sql/06_seguridad_rls.sql`:

```sql
-- =============================================================================
-- HASH CHAIN aud.* (P0-5 tamper-evidence)
-- =============================================================================

ALTER TABLE aud.log_cambios
    ADD COLUMN IF NOT EXISTS prev_hash   BYTEA,
    ADD COLUMN IF NOT EXISTS record_hash BYTEA;
ALTER TABLE aud.log_accesos
    ADD COLUMN IF NOT EXISTS prev_hash   BYTEA,
    ADD COLUMN IF NOT EXISTS record_hash BYTEA;

-- Trigger genérico que firma cada fila INSERTADA con sha256(prev_hash || row_json)
CREATE OR REPLACE FUNCTION aud.fn_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev BYTEA;
    v_row  BYTEA;
BEGIN
    -- Buscar el último record_hash de la misma tabla
    EXECUTE format(
        'SELECT record_hash FROM aud.%I ORDER BY id DESC LIMIT 1',
        TG_TABLE_NAME
    ) INTO v_prev;
    NEW.prev_hash := v_prev;  -- NULL en el primer registro
    -- Calcular hash sobre la representación JSON de la fila SIN el record_hash
    v_row := convert_to(
        (to_jsonb(NEW) - 'record_hash' - 'prev_hash')::text,
        'UTF8'
    );
    NEW.record_hash := digest(COALESCE(v_prev, ''::bytea) || v_row, 'sha256');
    RETURN NEW;
END;
$$;

-- Requiere pgcrypto para digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TRIGGER IF EXISTS tr_hash_chain_log_cambios ON aud.log_cambios;
CREATE TRIGGER tr_hash_chain_log_cambios
    BEFORE INSERT ON aud.log_cambios
    FOR EACH ROW EXECUTE FUNCTION aud.fn_hash_chain();

DROP TRIGGER IF EXISTS tr_hash_chain_log_accesos ON aud.log_accesos;
CREATE TRIGGER tr_hash_chain_log_accesos
    BEFORE INSERT ON aud.log_accesos
    FOR EACH ROW EXECUTE FUNCTION aud.fn_hash_chain();
```

Aplicar:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -f sql/06_seguridad_rls.sql
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `psql ... -f tests/sql/test_aud_hash_chain.sql`
Salida esperada: `OK test_aud_hash_chain`.

- [ ] **Step 5: Commit**

```bash
git add sql/06_seguridad_rls.sql tests/sql/test_aud_hash_chain.sql
git commit -m "security: fix P0-5 hash chain SHA-256 en aud.log_cambios/log_accesos"
```

---

### Task 1.17: Filtrar columnas sensibles en aud.fn_audit

**Hallazgo:** P0-6
**Files:**
- Modify: `sql/03_funciones_vistas.sql:97-144` (`aud.fn_audit`)
- Create: `tests/sql/test_aud_filtra_secretos.sql`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/sql/test_aud_filtra_secretos.sql`:

```sql
\set ON_ERROR_STOP on
\i tests/sql/_lib.sql

BEGIN;

-- Crear un usuario y luego actualizarlo para forzar trigger de audit
INSERT INTO seguridad.usuarios
    (usuario, nombre_completo, correo, password_hash, mfa_secret,
     token_recuperacion, activo, debe_cambiar_password)
VALUES ('secreto_test', 'Secreto', 's@t.local',
        '$2b$12$abcdefghijklmnopqrstuvwxyz0123456789',
        'JBSWY3DPEHPK3PXP', 'tok_recovery_xxx', TRUE, FALSE);

UPDATE seguridad.usuarios
   SET nombre_completo = 'Secreto Modificado',
       password_hash = '$2b$12$nuevoHashNuevoHashNuevoHashNuevoHash',
       mfa_secret = 'NEWMFASECRETXXX'
 WHERE usuario = 'secreto_test';

-- Verificar que el log de cambios NO contiene los hashes/secretos
SELECT pg_assert(
    NOT EXISTS (
        SELECT 1 FROM aud.log_cambios
         WHERE schema_name = 'seguridad' AND table_name = 'usuarios'
           AND (
               valor_anterior::text   ILIKE '%password_hash%'
            OR valor_anterior::text   ILIKE '%mfa_secret%'
            OR valor_anterior::text   ILIKE '%token_recuperacion%'
            OR valor_nuevo::text      ILIKE '%password_hash%'
            OR valor_nuevo::text      ILIKE '%mfa_secret%'
            OR valor_nuevo::text      ILIKE '%token_recuperacion%'
            OR campos_cambiados::text ILIKE '%password_hash%'
            OR campos_cambiados::text ILIKE '%mfa_secret%'
            OR campos_cambiados::text ILIKE '%token_recuperacion%'
           )
    ),
    'aud.log_cambios contiene password_hash/mfa_secret/token_recuperacion'
);

ROLLBACK;
\echo 'OK test_aud_filtra_secretos'
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `psql ... -f tests/sql/test_aud_filtra_secretos.sql`
Salida esperada: `ASSERT FAILED: aud.log_cambios contiene password_hash/...`.

- [ ] **Step 3: Implementación mínima**

Modificar `sql/03_funciones_vistas.sql:97-144`. Reescribir `aud.fn_audit`:

```sql
CREATE OR REPLACE FUNCTION aud.fn_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_old      JSONB;
    v_new      JSONB;
    v_diff     JSONB;
    v_usuario  BIGINT := NULLIF(current_setting('app.usuario_id', TRUE), '')::BIGINT;
    v_nombre   TEXT   := NULLIF(current_setting('app.usuario_nombre', TRUE), '');
    v_ip       INET   := NULLIF(current_setting('app.usuario_ip', TRUE), '')::INET;
    v_reg_id   TEXT;
    -- P0-6: lista de columnas sensibles a redactar en el diff
    v_redact   TEXT[] := ARRAY[
        'password_hash', 'mfa_secret', 'token_recuperacion', 'token_hash'
    ];
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD) - v_redact;
        v_reg_id := COALESCE(v_old->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_anterior, usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'D',
                v_old, v_usuario, v_nombre, v_ip);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD) - v_redact;
        v_new := to_jsonb(NEW) - v_redact;
        SELECT jsonb_object_agg(key, value) INTO v_diff
          FROM jsonb_each(v_new) e
         WHERE NOT (v_old @> jsonb_build_object(e.key, e.value));
        IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
            RETURN NEW;
        END IF;
        v_reg_id := COALESCE(v_new->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_anterior, valor_nuevo, campos_cambiados,
                                     usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'U',
                v_old, v_new, v_diff, v_usuario, v_nombre, v_ip);
        RETURN NEW;
    ELSE  -- INSERT
        v_new := to_jsonb(NEW) - v_redact;
        v_reg_id := COALESCE(v_new->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_nuevo, usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'I',
                v_new, v_usuario, v_nombre, v_ip);
        RETURN NEW;
    END IF;
END;
$$;
```

Aplicar:
```bash
psql "postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  -v ON_ERROR_STOP=1 -c "$(cat sql/03_funciones_vistas.sql | sed -n '/^CREATE OR REPLACE FUNCTION aud.fn_audit/,/^\$\$;$/p')"
```

(Alternativa práctica: re-aplicar `sql/03_funciones_vistas.sql` completo si el resto es idempotente con `OR REPLACE`.)

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `psql ... -f tests/sql/test_aud_filtra_secretos.sql`
Salida esperada: `OK test_aud_filtra_secretos`.

- [ ] **Step 5: Commit**

```bash
git add sql/03_funciones_vistas.sql tests/sql/test_aud_filtra_secretos.sql
git commit -m "security: fix P0-6 redactar password_hash/mfa_secret/token_* en aud.fn_audit"
```

---

### Task 1.18: Suite SQL ejecutable end-to-end

**Hallazgo:** consolidación bloque BD
**Files:**
- Create: `tests/sql/run_all.sh`
- Modify: `.github/workflows/ci.yml` (añadir job sql-tests)

- [ ] **Step 1: Escribir runner**

Crear `tests/sql/run_all.sh`:

```bash
#!/usr/bin/env bash
# Runner para todos los tests SQL del Sprint 1.
# Uso: TEST_DB_URL="postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
#      bash tests/sql/run_all.sh
set -euo pipefail

DB_URL="${TEST_DB_URL:-postgresql://postgres:postgres@localhost:5432/bomberos_caracas}"
TESTS=(
    tests/sql/test_roles_existen.sql
    tests/sql/test_rls_enabled.sql
    tests/sql/test_rls_policies_definidas.sql
    tests/sql/test_rls_isolation.sql
    tests/sql/test_aud_append_only.sql
    tests/sql/test_aud_hash_chain.sql
    tests/sql/test_aud_filtra_secretos.sql
)

fail=0
for t in "${TESTS[@]}"; do
    echo "==> $t"
    if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f "$t"; then
        echo "FAIL: $t"
        fail=$((fail+1))
    fi
done

if [ $fail -gt 0 ]; then
    echo "$fail test(s) fallaron"
    exit 1
fi
echo "Todos los tests SQL pasaron."
```

Marcar ejecutable:
```bash
chmod +x tests/sql/run_all.sh
```

- [ ] **Step 2: Correr runner**

Comando:
```bash
TEST_DB_URL="postgresql://postgres:postgres@localhost:5432/bomberos_caracas" \
  bash tests/sql/run_all.sh
```
Salida esperada: `Todos los tests SQL pasaron.`.

- [ ] **Step 3: Añadir job CI**

Editar `.github/workflows/ci.yml`. Añadir job `sql-tests` (asumiendo que el archivo ya tiene un job `api-tests`):

```yaml
  sql-tests:
    name: SQL tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: bomberos_caracas
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - name: Cargar esquema completo
        run: |
          for f in sql/01_base.sql sql/02_dominio.sql sql/03_funciones_vistas.sql \
                   sql/04_seed.sql sql/06_seguridad_rls.sql; do
            PGPASSWORD=postgres psql -h localhost -U postgres -d bomberos_caracas \
              -v ON_ERROR_STOP=1 -f "$f"
          done
      - name: Correr tests SQL
        env:
          TEST_DB_URL: postgresql://postgres:postgres@localhost:5432/bomberos_caracas
          PGPASSWORD: postgres
        run: bash tests/sql/run_all.sh
```

- [ ] **Step 4: Correr todos en local**

Comando: `bash tests/sql/run_all.sh`
Salida esperada: pasa todos.

- [ ] **Step 5: Commit**

```bash
git add tests/sql/run_all.sh .github/workflows/ci.yml
git commit -m "test: runner SQL + job CI para tests de RLS y audit"
```

---

# Bloque Infra — Tareas 1.19 a 1.25

### Task 1.19: Eliminar puerto público de Postgres

**Hallazgo:** P0-12
**Files:**
- Modify: `docker-compose.yml:11-12`
- Create: `tests/infra/test_postgres_no_exposed.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/infra/test_postgres_no_exposed.sh`:

```bash
#!/usr/bin/env bash
# P0-12: el servicio postgres del compose NO debe exponer puertos al host.
set -euo pipefail

if grep -E '^\s*-\s*"5432:5432"' docker-compose.yml >/dev/null; then
    echo "FAIL: docker-compose.yml expone postgres en 5432:5432"
    exit 1
fi

# El bloque del servicio postgres NO debe tener ports:
if awk '/^  postgres:/,/^  [a-z]/' docker-compose.yml \
     | grep -E '^\s*ports:' >/dev/null; then
    echo "FAIL: servicio postgres tiene bloque ports:"
    exit 1
fi
echo "OK test_postgres_no_exposed"
```

Marcar ejecutable: `chmod +x tests/infra/test_postgres_no_exposed.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/infra/test_postgres_no_exposed.sh`
Salida esperada: `FAIL: docker-compose.yml expone postgres en 5432:5432`.

- [ ] **Step 3: Implementación mínima**

Editar `docker-compose.yml`. Eliminar las líneas 11-12 (bloque `ports:` del servicio `postgres`):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: bomberos_pg
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: bomberos_caracas
      LANG: es_VE.UTF-8
    # ports: eliminado (P0-12): postgres no se expone al host
    volumes:
      - bomberos_pg_data:/var/lib/postgresql/data
      - ./sql:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d bomberos_caracas"]
      interval: 10s
      timeout: 3s
      retries: 5
```

Para dev local que necesite acceso desde el host, documentar uso de `docker compose exec postgres psql` o un archivo `docker-compose.override.yml` (no-commiteado) con el port mapping.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/infra/test_postgres_no_exposed.sh`
Salida esperada: `OK test_postgres_no_exposed`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml tests/infra/test_postgres_no_exposed.sh
git commit -m "security: fix P0-12 eliminar postgres ports 5432:5432 del compose"
```

---

### Task 1.20: Variables sensibles como ${VAR:?required} + env_file

**Hallazgo:** P0-13
**Files:**
- Modify: `docker-compose.yml`
- Create: `secrets/api.env.example`
- Create: `secrets/postgres.env.example`
- Modify: `.gitignore`
- Create: `tests/infra/test_no_default_credentials.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/infra/test_no_default_credentials.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1) No debe haber password=postgres hardcodeado
if grep -E 'POSTGRES_PASSWORD:\s*postgres' docker-compose.yml >/dev/null; then
    echo "FAIL: POSTGRES_PASSWORD: postgres hardcoded"
    exit 1
fi

# 2) No debe haber JWT_SECRET_KEY: cambiar-esto-* hardcoded
if grep -E 'JWT_SECRET_KEY:\s*cambiar-esto' docker-compose.yml >/dev/null; then
    echo "FAIL: JWT_SECRET_KEY default placeholder"
    exit 1
fi

# 3) Las variables sensibles deben usar ${VAR:?required} o env_file
required=("POSTGRES_PASSWORD" "JWT_SECRET_KEY" "BOOTSTRAP_ADMIN_PASSWORD")
for v in "${required[@]}"; do
    if grep -qE "$v" docker-compose.yml && \
       ! grep -qE "\$\{$v:\?" docker-compose.yml; then
        # Permitir si está en un env_file
        if ! grep -qE 'env_file:' docker-compose.yml; then
            echo "FAIL: $v no usa \${$v:?required} ni env_file"
            exit 1
        fi
    fi
done

echo "OK test_no_default_credentials"
```

Marcar ejecutable: `chmod +x tests/infra/test_no_default_credentials.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/infra/test_no_default_credentials.sh`
Salida esperada: `FAIL: POSTGRES_PASSWORD: postgres hardcoded`.

- [ ] **Step 3: Implementación mínima**

Crear `secrets/api.env.example`:

```env
# secrets/api.env — copiar a secrets/api.env, chmod 600, NO commitear.
JWT_SECRET_KEY=<generar con: python -c "import secrets;print(secrets.token_urlsafe(64))">
BOOTSTRAP_ADMIN_PASSWORD=<password fuerte 12+ chars con clases>
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_EMAIL=admin@bomberos.local
DATABASE_URL=postgresql+asyncpg://bomberos_api:${POSTGRES_PASSWORD}@postgres:5432/bomberos_caracas
APP_ENV=production
APP_DEBUG=false
LOG_LEVEL=INFO
LOG_FORMAT=json
CORS_ORIGINS=https://bomberos.dc.local
```

Crear `secrets/postgres.env.example`:

```env
# secrets/postgres.env — copiar a secrets/postgres.env, chmod 600, NO commitear.
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<password fuerte 32+ chars>
POSTGRES_DB=bomberos_caracas
```

Actualizar `.gitignore` (añadir al final):

```
# Secrets reales (Sprint 1 P0-13)
secrets/*.env
!secrets/*.env.example
```

Reescribir `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: bomberos_pg
    restart: unless-stopped
    env_file:
      - ./secrets/postgres.env
    environment:
      LANG: es_VE.UTF-8
    volumes:
      - bomberos_pg_data:/var/lib/postgresql/data
      - ./sql:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: bomberos_api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - ./secrets/postgres.env
      - ./secrets/api.env
    # ports: el caddy de Task 1.23 hará el proxy; en dev se puede exponer en override

volumes:
  bomberos_pg_data:
```

(Permisos del archivo en producción: `chmod 600 secrets/*.env && chown root:root secrets/*.env`.)

Documentar en `DEPLOY.md` el paso de copiar `*.env.example` → `*.env` y rellenar.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/infra/test_no_default_credentials.sh`
Salida esperada: `OK test_no_default_credentials`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml secrets/api.env.example secrets/postgres.env.example \
        .gitignore tests/infra/test_no_default_credentials.sh
git commit -m "security: fix P0-13 mover credenciales a env_file secrets/, eliminar defaults"
```

---

### Task 1.21: Validar complejidad de BOOTSTRAP_ADMIN_PASSWORD

**Hallazgo:** P0-14
**Files:**
- Modify: `apps/api/src/bomberos_api/scripts/bootstrap.py:107-145`
- Create: `apps/api/src/bomberos_api/core/password_policy.py`
- Create: `apps/api/tests/security/test_bootstrap_password.py`

- [ ] **Step 1: Escribir test que falla**

Crear `apps/api/tests/security/test_bootstrap_password.py`:

```python
"""P0-14: bootstrap rechaza passwords débiles."""
from __future__ import annotations

import pytest

from bomberos_api.core.password_policy import (
    PasswordPolicyError,
    enforce_password_policy,
)


@pytest.mark.parametrize("pw", [
    "admin",
    "1",
    "",
    "12345678",       # solo dígitos
    "abcdefghij",     # solo minúsculas
    "ABCDEFGHIJ",     # solo mayúsculas
    "Abcdef1!",       # < 10 chars
    "abcdefghij1!",   # sin mayúscula
    "ABCDEFGHIJ1!",   # sin minúscula
    "Abcdefghij!",    # sin dígito
    "Abcdefghij1",    # sin símbolo
])
def test_passwords_debiles_rechazadas(pw):
    with pytest.raises(PasswordPolicyError):
        enforce_password_policy(pw)


def test_password_fuerte_aceptada():
    enforce_password_policy("Sup3rPass!2026")
    enforce_password_policy("Bomberos#DC2026")
```

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `pytest apps/api/tests/security/test_bootstrap_password.py -v`
Salida esperada: FAIL — `ModuleNotFoundError: bomberos_api.core.password_policy`.

- [ ] **Step 3: Implementación mínima**

Crear `apps/api/src/bomberos_api/core/password_policy.py`:

```python
"""Política de complejidad de password (P0-14).

10+ caracteres, al menos una mayúscula, una minúscula, un dígito y un símbolo.
"""
from __future__ import annotations

import re

_MIN_LEN = 10
_REGEX_UPPER = re.compile(r"[A-Z]")
_REGEX_LOWER = re.compile(r"[a-z]")
_REGEX_DIGIT = re.compile(r"\d")
_REGEX_SYMBOL = re.compile(r"[^A-Za-z0-9]")


class PasswordPolicyError(ValueError):
    """La contraseña no cumple la política mínima."""


def enforce_password_policy(pw: str) -> None:
    """Lanza PasswordPolicyError si la password no cumple."""
    if not pw or len(pw) < _MIN_LEN:
        raise PasswordPolicyError(
            f"password debe tener al menos {_MIN_LEN} caracteres"
        )
    checks = [
        (_REGEX_UPPER, "una letra mayúscula"),
        (_REGEX_LOWER, "una letra minúscula"),
        (_REGEX_DIGIT, "un dígito"),
        (_REGEX_SYMBOL, "un símbolo"),
    ]
    faltantes = [desc for rgx, desc in checks if not rgx.search(pw)]
    if faltantes:
        raise PasswordPolicyError(
            "password debe contener al menos: " + ", ".join(faltantes)
        )
```

Modificar `apps/api/src/bomberos_api/scripts/bootstrap.py` líneas 107-115. Reemplazar:

```python
async def _ensure_admin_user(conn: asyncpg.Connection) -> None:
    user = os.environ.get("BOOTSTRAP_ADMIN_USER", "admin")
    pwd = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD")
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@bomberos.local")
    if not pwd:
        print("[bootstrap] BOOTSTRAP_ADMIN_PASSWORD no seteada; omitiendo seed de admin")
        return
```

por:

```python
async def _ensure_admin_user(conn: asyncpg.Connection) -> None:
    from bomberos_api.core.password_policy import (
        PasswordPolicyError,
        enforce_password_policy,
    )

    user = os.environ.get("BOOTSTRAP_ADMIN_USER", "admin")
    pwd = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD")
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@bomberos.local")
    if not pwd:
        print("[bootstrap] BOOTSTRAP_ADMIN_PASSWORD no seteada; omitiendo seed de admin")
        return
    try:
        enforce_password_policy(pwd)
    except PasswordPolicyError as e:
        # P0-14: fail fast — no arrancar con admin débil.
        raise SystemExit(
            f"[bootstrap] BOOTSTRAP_ADMIN_PASSWORD inválida: {e}"
        ) from e
```

(Después de Task 2.18 se reforzará el fail-fast en `_apply_sql_files`; en Sprint 1 alcanza con elevar la PasswordPolicyError.)

También exportar uso en `change-password`: editar `apps/api/src/bomberos_api/schemas/auth.py` para añadir el validator que use `enforce_password_policy` en `password_nuevo` (si ya existía un validator regex, sustituirlo por llamada al helper — verificar antes de modificar).

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `pytest apps/api/tests/security/test_bootstrap_password.py -v`
Salida esperada: PASS los 12 casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bomberos_api/core/password_policy.py \
        apps/api/src/bomberos_api/scripts/bootstrap.py \
        apps/api/tests/security/test_bootstrap_password.py
git commit -m "security: fix P0-14 validar BOOTSTRAP_ADMIN_PASSWORD con política de complejidad"
```

---

### Task 1.22: .dockerignore en raíz que excluya todo no-API

**Hallazgo:** P0-15
**Files:**
- Create: `.dockerignore`
- Create: `tests/infra/test_dockerignore_efectivo.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/infra/test_dockerignore_efectivo.sh`:

```bash
#!/usr/bin/env bash
# P0-15: el .dockerignore raíz debe excluir patrones sensibles del build context.
set -euo pipefail

if [ ! -f .dockerignore ]; then
    echo "FAIL: falta .dockerignore en raíz"
    exit 1
fi

required_patterns=(
    ".git"
    ".github"
    "node_modules"
    ".next"
    ".vercel"
    "bootstrap_logs.json"
    "now_logs.json"
    "secrets/"
    "apps/web"
    "docs"
    "*.md"
    "render.yaml"
    "railway.toml"
)

for p in "${required_patterns[@]}"; do
    if ! grep -qE "^${p//./\\.}$" .dockerignore; then
        echo "FAIL: .dockerignore no excluye '$p'"
        exit 1
    fi
done
echo "OK test_dockerignore_efectivo"
```

Marcar ejecutable: `chmod +x tests/infra/test_dockerignore_efectivo.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/infra/test_dockerignore_efectivo.sh`
Salida esperada: `FAIL: falta .dockerignore en raíz`.

- [ ] **Step 3: Implementación mínima**

Crear `.dockerignore` en la raíz del repo:

```
# .dockerignore — Sprint 1 P0-15
# Build context para apps/api: solo necesitamos apps/api/, sql/, alembic, pyproject.toml.

# VCS y CI
.git
.github
.gitignore
.gitattributes

# Docs (no van en imágenes)
docs
*.md
!apps/api/README.md

# Secrets (NUNCA en imagen)
secrets/
*.env
*.env.*
!*.env.example

# Frontend (otra imagen)
apps/web
node_modules
.next
.vercel

# Despliegues externos (eliminar tras cutover)
render.yaml
railway.toml
vercel.json

# Logs de scripts
bootstrap_logs.json
now_logs.json
*.log

# IDE / OS
.vscode
.idea
.DS_Store
Thumbs.db

# Tests no van en runtime image
tests
apps/api/tests
**/__pycache__
**/*.pyc

# Python build artifacts
*.egg-info
dist
build
.venv
venv

# Devcontainer
.devcontainer
```

Verificar que `apps/api/Dockerfile` usa `COPY apps/api/src ./src` (no `COPY . .`) — ya es así.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/infra/test_dockerignore_efectivo.sh`
Salida esperada: `OK test_dockerignore_efectivo`.

Verificación adicional: `docker build -f apps/api/Dockerfile . 2>&1 | grep "Sending build context"` debe mostrar tamaño claramente menor (~10-30 MB en vez de 200+).

- [ ] **Step 5: Commit**

```bash
git add .dockerignore tests/infra/test_dockerignore_efectivo.sh
git commit -m "security: fix P0-15 .dockerignore raíz para reducir build context"
```

---

### Task 1.23: Servicio Caddy con TLS

**Hallazgo:** P0-16
**Files:**
- Create: `infra/caddy/Caddyfile`
- Create: `infra/caddy/Caddyfile.dev`
- Modify: `docker-compose.yml`
- Create: `tests/infra/test_caddy_present.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/infra/test_caddy_present.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [ ! -f infra/caddy/Caddyfile ]; then
    echo "FAIL: falta infra/caddy/Caddyfile"
    exit 1
fi

if ! grep -qE '^\s*caddy:' docker-compose.yml; then
    echo "FAIL: servicio caddy no está en docker-compose.yml"
    exit 1
fi

# Caddy debe ser el único que expone 443
if ! grep -qE '"443:443"' docker-compose.yml; then
    echo "FAIL: caddy no expone 443:443"
    exit 1
fi

# API NO debe exponer 8000 al host (caddy lo proxiea)
if grep -E '^\s*-\s*"8000:8000"' docker-compose.yml >/dev/null; then
    echo "FAIL: api expone 8000:8000 directamente"
    exit 1
fi
echo "OK test_caddy_present"
```

Marcar ejecutable: `chmod +x tests/infra/test_caddy_present.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/infra/test_caddy_present.sh`
Salida esperada: `FAIL: falta infra/caddy/Caddyfile`.

- [ ] **Step 3: Implementación mínima**

Crear `infra/caddy/Caddyfile`:

```caddyfile
# infra/caddy/Caddyfile — Producción intranet
# Sirve frontend en / y proxy a API en /api/*.
# TLS con cert interno emitido por la CA del Cuerpo de Bomberos.

{
    # Servidor sin acceso a internet → no se puede usar ACME público
    auto_https off
    admin off
}

bomberos.dc.local:443 {
    tls /etc/caddy/certs/bomberos.dc.local.crt /etc/caddy/certs/bomberos.dc.local.key

    encode zstd gzip

    # Frontend (Next.js) en /
    reverse_proxy /api/* api:8000
    reverse_proxy /auth/* api:8000
    reverse_proxy /health api:8000
    reverse_proxy * web:3000

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        -Server
    }

    log {
        output stdout
        format json
    }
}

:80 {
    redir https://bomberos.dc.local{uri} permanent
}
```

Crear `infra/caddy/Caddyfile.dev` (TLS local con cert auto-firmado de Caddy):

```caddyfile
# infra/caddy/Caddyfile.dev — Desarrollo local con cert interno auto-firmado.
{
    local_certs
    admin off
}

localhost:443 {
    reverse_proxy /api/* api:8000
    reverse_proxy /auth/* api:8000
    reverse_proxy /health api:8000
    reverse_proxy * host.docker.internal:3000

    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}
```

Actualizar `docker-compose.yml`. Añadir servicio `caddy` y quitar publicación de puertos de `api` (versión completa que reemplaza el archivo dejado en Task 1.20):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: bomberos_pg
    restart: unless-stopped
    env_file:
      - ./secrets/postgres.env
    environment:
      LANG: es_VE.UTF-8
    volumes:
      - bomberos_pg_data:/var/lib/postgresql/data
      - ./sql:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 3s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: bomberos_api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - ./secrets/postgres.env
      - ./secrets/api.env
    expose:
      - "8000"
    # No 'ports' — solo accesible vía red interna; caddy hace el proxy

  caddy:
    image: caddy:2.8-alpine
    container_name: bomberos_caddy
    restart: unless-stopped
    depends_on:
      - api
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./infra/caddy/certs:/etc/caddy/certs:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  bomberos_pg_data:
  caddy_data:
  caddy_config:
```

Para dev: documentar uso de `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` con un override que monte `Caddyfile.dev`.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/infra/test_caddy_present.sh`
Salida esperada: `OK test_caddy_present`.

- [ ] **Step 5: Commit**

```bash
git add infra/caddy/Caddyfile infra/caddy/Caddyfile.dev docker-compose.yml \
        tests/infra/test_caddy_present.sh
git commit -m "security: fix P0-16 servicio caddy con TLS interno, único puerto público"
```

---

### Task 1.24: Servicio pgbackup automático cifrado

**Hallazgo:** P0-17
**Files:**
- Create: `infra/pgbackup/Dockerfile`
- Create: `infra/pgbackup/backup.sh`
- Create: `infra/pgbackup/crontab`
- Modify: `docker-compose.yml`
- Create: `tests/infra/test_pgbackup_service.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/infra/test_pgbackup_service.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

required_files=(
    infra/pgbackup/Dockerfile
    infra/pgbackup/backup.sh
    infra/pgbackup/crontab
)
for f in "${required_files[@]}"; do
    [ -f "$f" ] || { echo "FAIL: falta $f"; exit 1; }
done

# El script debe usar gpg para cifrar y pg_dump para volcar
if ! grep -qE 'gpg.*--encrypt' infra/pgbackup/backup.sh; then
    echo "FAIL: backup.sh no usa gpg --encrypt"
    exit 1
fi
if ! grep -qE 'pg_dump' infra/pgbackup/backup.sh; then
    echo "FAIL: backup.sh no usa pg_dump"
    exit 1
fi

if ! grep -qE '^\s*pgbackup:' docker-compose.yml; then
    echo "FAIL: servicio pgbackup no está en docker-compose.yml"
    exit 1
fi
echo "OK test_pgbackup_service"
```

Marcar ejecutable: `chmod +x tests/infra/test_pgbackup_service.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/infra/test_pgbackup_service.sh`
Salida esperada: `FAIL: falta infra/pgbackup/Dockerfile`.

- [ ] **Step 3: Implementación mínima**

Crear `infra/pgbackup/Dockerfile`:

```dockerfile
FROM alpine:3.20

RUN apk add --no-cache \
        postgresql16-client \
        gnupg \
        bash \
        tzdata \
    && rm -rf /var/cache/apk/*

ENV TZ=America/Caracas

COPY backup.sh /usr/local/bin/backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh

CMD ["crond", "-f", "-l", "8"]
```

Crear `infra/pgbackup/backup.sh`:

```bash
#!/usr/bin/env bash
# infra/pgbackup/backup.sh — dump cifrado del cluster cada N horas.
# Variables requeridas:
#   POSTGRES_HOST, POSTGRES_USER, POSTGRES_DB, PGPASSWORD
#   BACKUP_DIR (default /backups)
#   BACKUP_GPG_RECIPIENT (key id o email del recipient para gpg --encrypt)
#   BACKUP_RETENTION_DAYS (default 30)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
ts="$(date -u +'%Y%m%dT%H%M%SZ')"
out="${BACKUP_DIR}/bomberos_${ts}.sql.gpg"

mkdir -p "$BACKUP_DIR"

pg_dump \
    --host="${POSTGRES_HOST:?required}" \
    --username="${POSTGRES_USER:?required}" \
    --dbname="${POSTGRES_DB:?required}" \
    --format=custom \
    --no-owner \
    --no-acl \
    --compress=9 \
  | gpg --batch --yes --trust-model always \
        --recipient "${BACKUP_GPG_RECIPIENT:?required}" \
        --output "$out" \
        --encrypt

# SHA256 sidecar para integridad
sha256sum "$out" > "${out}.sha256"

# Rotación: borrar archivos > RETENTION días
find "$BACKUP_DIR" -name 'bomberos_*.sql.gpg' -type f -mtime "+${RETENTION}" -delete
find "$BACKUP_DIR" -name 'bomberos_*.sql.gpg.sha256' -type f -mtime "+${RETENTION}" -delete

echo "[pgbackup] OK $out ($(stat -c%s "$out") bytes)"
```

Crear `infra/pgbackup/crontab`:

```
# infra/pgbackup/crontab — backup cada 6 horas
0 */6 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1
```

Actualizar `docker-compose.yml`. Añadir servicio:

```yaml
  pgbackup:
    build:
      context: ./infra/pgbackup
    container_name: bomberos_pgbackup
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - ./secrets/postgres.env
      - ./secrets/pgbackup.env
    volumes:
      - bomberos_backups:/backups
      - ./secrets/gpg:/root/.gnupg:ro

volumes:
  bomberos_pg_data:
  caddy_data:
  caddy_config:
  bomberos_backups:
```

Crear `secrets/pgbackup.env.example`:

```env
# secrets/pgbackup.env
POSTGRES_HOST=postgres
BACKUP_GPG_RECIPIENT=backup@bomberos.dc.local
BACKUP_RETENTION_DAYS=30
```

Documentar generación de keypair GPG en `docs/RESTORE.md` (Task 1.25).

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/infra/test_pgbackup_service.sh`
Salida esperada: `OK test_pgbackup_service`.

Smoke test (opcional, requiere GPG configurado):
```bash
docker compose build pgbackup && \
docker compose run --rm pgbackup bash -c "ls /usr/local/bin/backup.sh && bash --version"
```

- [ ] **Step 5: Commit**

```bash
git add infra/pgbackup/Dockerfile infra/pgbackup/backup.sh infra/pgbackup/crontab \
        docker-compose.yml secrets/pgbackup.env.example \
        tests/infra/test_pgbackup_service.sh
git commit -m "security: fix P0-17 servicio pgbackup cron 6h con cifrado GPG"
```

---

### Task 1.25: Procedimiento de restore documentado

**Hallazgo:** P0-17 (operación)
**Files:**
- Create: `docs/RESTORE.md`

- [ ] **Step 1: Escribir test (smoke-doc)**

Crear `tests/infra/test_restore_doc.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
if [ ! -f docs/RESTORE.md ]; then
    echo "FAIL: docs/RESTORE.md no existe"
    exit 1
fi
required_sections=(
    "Prerequisitos"
    "Restore completo"
    "Restore parcial"
    "Verificación de integridad"
    "Rotación de GPG"
)
for s in "${required_sections[@]}"; do
    if ! grep -q "$s" docs/RESTORE.md; then
        echo "FAIL: docs/RESTORE.md no contiene sección '$s'"
        exit 1
    fi
done
echo "OK test_restore_doc"
```

Marcar ejecutable: `chmod +x tests/infra/test_restore_doc.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/infra/test_restore_doc.sh`
Salida esperada: `FAIL: docs/RESTORE.md no existe`.

- [ ] **Step 3: Implementación mínima**

Crear `docs/RESTORE.md`:

```markdown
# RESTORE — Sistema Bomberos Caracas

> Procedimiento de restauración desde backup cifrado generado por el servicio
> `pgbackup`. Probar este flujo mensualmente.

## Prerequisitos

- Acceso SSH al servidor de producción.
- Llave privada GPG del recipient configurado en `secrets/pgbackup.env`
  (`BACKUP_GPG_RECIPIENT`), instalada en el llavero local con `gpg --import`.
- Espacio en `/srv/bomberos/data` suficiente para el dump descomprimido (~3x
  el tamaño actual de la BD).

## Restore completo

1. Detener el servicio `api` y `caddy` (no postgres):
   ```bash
   docker compose stop api caddy
   ```
2. Identificar el backup a restaurar:
   ```bash
   docker compose exec pgbackup ls -lh /backups | tail -n 20
   ```
3. Copiar el archivo y su SHA256 al host:
   ```bash
   docker compose cp pgbackup:/backups/bomberos_<ts>.sql.gpg ./
   docker compose cp pgbackup:/backups/bomberos_<ts>.sql.gpg.sha256 ./
   ```
4. Verificar integridad:
   ```bash
   sha256sum -c bomberos_<ts>.sql.gpg.sha256
   ```
5. Desencriptar:
   ```bash
   gpg --batch --output bomberos_<ts>.sql --decrypt bomberos_<ts>.sql.gpg
   ```
6. Drop+create de la BD (CONFIRMAR antes — esto destruye datos actuales):
   ```bash
   docker compose exec postgres psql -U postgres -c "DROP DATABASE bomberos_caracas;"
   docker compose exec postgres psql -U postgres -c "CREATE DATABASE bomberos_caracas;"
   ```
7. Restaurar:
   ```bash
   docker compose exec -T postgres pg_restore -U postgres -d bomberos_caracas \
       --no-owner --no-acl < bomberos_<ts>.sql
   ```
8. Reaplicar 06_seguridad_rls.sql si no estaba en el dump:
   ```bash
   docker compose exec postgres psql -U postgres -d bomberos_caracas \
       -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/06_seguridad_rls.sql
   ```
9. Reiniciar:
   ```bash
   docker compose up -d api caddy
   ```
10. Verificar:
    - `/health/db` retorna 200.
    - Login con admin funciona.
    - Conteo de funcionarios en `/funcionarios` coincide con el esperado.

## Restore parcial (una sola tabla)

```bash
docker compose exec -T postgres pg_restore -U postgres -d bomberos_caracas \
    --no-owner --no-acl --data-only \
    --table=personal.funcionarios < bomberos_<ts>.sql
```

## Verificación de integridad

- El backup ya verifica con SHA256 en la rotación.
- Test mensual: `restore` a una BD scratch y comparar conteos con producción.

## Rotación de GPG

- Generar nuevo keypair anualmente: `gpg --batch --gen-key`.
- Cambiar `BACKUP_GPG_RECIPIENT` en `secrets/pgbackup.env`.
- Mantener llaves antiguas en cold storage hasta que expire la retención de los
  backups firmados con ellas (30 días).
- Documentar en `docs/HANDOVER.md` ubicación física de la llave privada en
  custodia (caja fuerte del Distrito Capital).
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/infra/test_restore_doc.sh`
Salida esperada: `OK test_restore_doc`.

- [ ] **Step 5: Commit**

```bash
git add docs/RESTORE.md tests/infra/test_restore_doc.sh
git commit -m "docs: P0-17 procedimiento de restore desde backup cifrado"
```

---

# Bloque Frontend — Tareas 1.26 a 1.28

### Task 1.26: Eliminar archivos de modo demo

**Hallazgo:** P1-9 (elevado a Sprint 1 por simpleza)
**Files:**
- Delete: `apps/web/src/lib/demo-fixtures.ts`
- Delete: `apps/web/src/app/actions/demo.ts`
- Delete: `apps/web/src/components/layout/RoleSwitcher.tsx`
- Create: `tests/frontend/test_demo_files_eliminados.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/frontend/test_demo_files_eliminados.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

prohibited=(
    apps/web/src/lib/demo-fixtures.ts
    apps/web/src/app/actions/demo.ts
    apps/web/src/components/layout/RoleSwitcher.tsx
)
for f in "${prohibited[@]}"; do
    if [ -f "$f" ]; then
        echo "FAIL: $f sigue existiendo"
        exit 1
    fi
done
echo "OK test_demo_files_eliminados"
```

Marcar ejecutable: `chmod +x tests/frontend/test_demo_files_eliminados.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/frontend/test_demo_files_eliminados.sh`
Salida esperada: `FAIL: apps/web/src/lib/demo-fixtures.ts sigue existiendo` (o uno de los tres).

- [ ] **Step 3: Implementación mínima**

```bash
git rm apps/web/src/lib/demo-fixtures.ts
git rm apps/web/src/app/actions/demo.ts
git rm apps/web/src/components/layout/RoleSwitcher.tsx
```

Eliminar también la importación y uso de `RoleSwitcher` en el layout. Editar `apps/web/src/app/(app)/layout.tsx`:

- Quitar la línea `import RoleSwitcher from '@/components/layout/RoleSwitcher'`.
- Quitar el `<RoleSwitcher />` del JSX.

Verificar TS no rompe:
```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/frontend/test_demo_files_eliminados.sh`
Salida esperada: `OK test_demo_files_eliminados`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/layout.tsx tests/frontend/test_demo_files_eliminados.sh
git commit -m "security: fix P1-9 eliminar archivos de modo demo (Sprint 1)"
```

---

### Task 1.27: Verificar que isDemoMode no se referencia en src/

**Hallazgo:** P1-9 (limpieza)
**Files:**
- Modify: archivos en `apps/web/src/` que aún referencian `isDemoMode`
- Create: `tests/frontend/test_no_isDemoMode.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/frontend/test_no_isDemoMode.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Buscar referencias a isDemoMode, demo-fixtures, RoleSwitcher
matches=$(grep -rIn -E "isDemoMode\(|demo-fixtures|RoleSwitcher|bcd_demo_role" \
            apps/web/src/ 2>/dev/null || true)
if [ -n "$matches" ]; then
    echo "FAIL: aún hay referencias al modo demo:"
    echo "$matches"
    exit 1
fi
echo "OK test_no_isDemoMode"
```

Marcar ejecutable: `chmod +x tests/frontend/test_no_isDemoMode.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/frontend/test_no_isDemoMode.sh`
Salida esperada: lista de archivos que aún referencian `isDemoMode`.

- [ ] **Step 3: Implementación mínima**

Para cada archivo listado:
1. Abrir y eliminar el branch `if (isDemoMode()) { ... }` completo, manteniendo
   solo el branch productivo (`else { ... }`).
2. Quitar el `import { isDemoMode } from '...'` correspondiente.
3. Eliminar cualquier dependencia muerta (tipos `DemoRole`, helpers, etc.).

Ejecutar tras cada archivo modificado: `cd apps/web && npx tsc --noEmit` para
verificar que no se rompe.

Si el `isDemoMode()` se exportaba desde un archivo común (`@/lib/env.ts` o similar):
- Eliminar la función exportada.
- Eliminar el `import` muerto donde quede.

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/frontend/test_no_isDemoMode.sh`
Salida esperada: `OK test_no_isDemoMode`.

Verificar build:
```bash
cd apps/web && npm run build
```
Salida esperada: build pasa sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ tests/frontend/test_no_isDemoMode.sh
git commit -m "security: fix P1-9 limpiar todas las ramas isDemoMode en apps/web/src"
```

---

### Task 1.28: Limpiar cookies bcd_demo_* al hacer login

**Hallazgo:** P1-9 / P2-14 (las cookies persisten en navegadores)
**Files:**
- Modify: `apps/web/src/app/actions/auth.ts` (o la action de login que aplique)
- Create: `apps/web/tests/auth_clears_demo_cookies.test.ts` (o test ad-hoc)
- Create: `tests/frontend/test_login_clears_demo_cookies.sh`

- [ ] **Step 1: Escribir test que falla**

Crear `tests/frontend/test_login_clears_demo_cookies.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# El login action debe llamar cookieStore.delete('bcd_demo_role') (o set con
# expires en el pasado).
file=apps/web/src/app/actions/auth.ts
if [ ! -f "$file" ]; then
    echo "SKIP: $file no existe; ajustar ruta del action de login"
    exit 0
fi

if ! grep -qE "(delete\(['\"]bcd_demo_|set\(['\"]bcd_demo_.*expires)" "$file"; then
    echo "FAIL: $file no limpia cookies bcd_demo_* al hacer login"
    exit 1
fi
echo "OK test_login_clears_demo_cookies"
```

Marcar ejecutable: `chmod +x tests/frontend/test_login_clears_demo_cookies.sh`.

- [ ] **Step 2: Correr test y verificar que falla**

Comando: `bash tests/frontend/test_login_clears_demo_cookies.sh`
Salida esperada: `FAIL: ... no limpia cookies bcd_demo_*`.

- [ ] **Step 3: Implementación mínima**

Editar `apps/web/src/app/actions/auth.ts` (o el archivo donde reside la server
action `loginAction`). Tras un login exitoso, antes de `redirect()`:

```typescript
import { cookies } from 'next/headers'

export async function loginAction(formData: FormData) {
  // ... lógica existente que setea bcd_access ...

  // P1-9 / P2-14: limpiar cookies legacy de modo demo
  const store = cookies()
  const DEMO_KEYS = ['bcd_demo_role', 'bcd_demo_user', 'bcd_demo_scope']
  for (const k of DEMO_KEYS) {
    store.set(k, '', { path: '/', expires: new Date(0), httpOnly: false })
  }

  redirect('/')
}
```

(El nombre exacto de las cookies y de la action puede variar; ajustar según
verifique cada archivo. La regla es: ANY cookie `bcd_demo_*` que existió debe
ser explícitamente expirada por el login.)

- [ ] **Step 4: Correr test y verificar que pasa**

Comando: `bash tests/frontend/test_login_clears_demo_cookies.sh`
Salida esperada: `OK test_login_clears_demo_cookies`.

Verificación manual en navegador:
1. En DevTools → Application → Cookies, crear manualmente `bcd_demo_role=ADMIN`.
2. Hacer login.
3. La cookie debe haber desaparecido (expires < now).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/actions/auth.ts tests/frontend/test_login_clears_demo_cookies.sh
git commit -m "security: fix P1-9 limpiar cookies bcd_demo_* al hacer login"
```

---

# Cierre del Sprint

### Task 1.29 (cierre): Marcar P0 cerrados en SECURITY.md y tag

**Files:**
- Modify: `docs/SECURITY.md` (marcar checkboxes de Sprint 1)

- [ ] **Step 1**: marcar cada hallazgo P0-1 a P0-17 con `[x]` en `docs/SECURITY.md` §3 Sprint 1.

- [ ] **Step 2**: correr suite completa:
  ```bash
  # API
  cd apps/api && pytest tests/ -v
  # SQL
  cd ../.. && bash tests/sql/run_all.sh
  # Infra
  bash tests/infra/test_postgres_no_exposed.sh
  bash tests/infra/test_no_default_credentials.sh
  bash tests/infra/test_dockerignore_efectivo.sh
  bash tests/infra/test_caddy_present.sh
  bash tests/infra/test_pgbackup_service.sh
  bash tests/infra/test_restore_doc.sh
  # Frontend
  bash tests/frontend/test_demo_files_eliminados.sh
  bash tests/frontend/test_no_isDemoMode.sh
  bash tests/frontend/test_login_clears_demo_cookies.sh
  cd apps/web && npx tsc --noEmit && npm run build
  ```
  Todos deben pasar.

- [ ] **Step 3**: tag de release.
  ```bash
  git add docs/SECURITY.md
  git commit -m "docs: marcar P0-1..P0-17 cerrados en Sprint 1"
  git tag -a v0.3.0-security-sprint-1 -m "Security Sprint 1 completado: 17 P0 cerrados"
  ```

- [ ] **Step 4**: PR.
  - Abrir PR desde `security/sprint-1` → `main` con título: `security: Sprint 1 — cierre de 17 hallazgos P0`.
  - Cuerpo del PR debe enumerar los 17 hallazgos cerrados con los IDs y un hash por commit.
  - Requerir review de segundo dev.

- [ ] **Step 5**: tras merge, abrir el plan de Sprint 2:
  `docs/superpowers/plans/2026-05-19-security-sprint-2.md`.

---

## Definition of Done — Sprint 1 (referencia ROADMAP §4)

- [x] Tareas 1.1 a 1.28 cerradas (cada una con `[x]` en su step 5).
- [x] `pytest apps/api/tests/` verde.
- [x] `bash tests/sql/run_all.sh` verde.
- [x] `bash tests/infra/test_*.sh` todos verdes.
- [x] `bash tests/frontend/test_*.sh` todos verdes.
- [x] `cd apps/web && npm run build && npx tsc --noEmit` verde.
- [x] CI verde.
- [x] Sección **P0** de `docs/SECURITY.md` con todos los items marcados.
- [x] Tag `v0.3.0-security-sprint-1` creado.
- [x] Demo en Render sigue funcionando (regresión nula).

**Fin del plan Sprint 1.**
