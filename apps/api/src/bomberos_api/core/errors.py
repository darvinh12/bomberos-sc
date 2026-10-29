"""Manejadores globales de excepciones de base de datos.

Convierten errores de Postgres (que SQLAlchemy envuelve como DBAPIError /
IntegrityError) en respuestas HTTP 4xx correctas, en lugar de un 500 genérico:

- P0001 RAISE de PL/pgSQL (reglas de negocio, p. ej. "no tiene período activo")
  → 400 con el mensaje de la regla.
- 23514 check_violation, 23502 not_null, 22003 numeric_out_of_range,
  22P02 invalid_text (dato fuera de rango/mal formado) → 422.
- 23505 unique_violation, 23503 foreign_key_violation → 409.

Cualquier otro error de BD se re-lanza para que conserve su 500 y su traza: no
se enmascaran fallos inesperados. Es una red de seguridad transversal; los
routers pueden seguir capturando IntegrityError localmente (integrity_409).
"""

from asyncpg import exceptions as pgexc
from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

# SQLSTATE → (status HTTP, prefijo de mensaje)
_SQLSTATE_MAP: dict[str, tuple[int, str]] = {
    "P0001": (status.HTTP_400_BAD_REQUEST, "Regla de negocio"),
    "23514": (status.HTTP_422_UNPROCESSABLE_ENTITY, "Datos inválidos"),
    "23502": (status.HTTP_422_UNPROCESSABLE_ENTITY, "Falta un campo obligatorio"),
    "22003": (status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor fuera de rango"),
    "22P02": (status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor con formato inválido"),
    "23505": (status.HTTP_409_CONFLICT, "Registro duplicado"),
    "23503": (status.HTTP_409_CONFLICT, "Referencia inexistente"),
}


def _sqlstate(exc: BaseException) -> str | None:
    """Camina la cadena orig/__cause__ hasta encontrar el SQLSTATE de Postgres."""
    cur: BaseException | None = exc
    for _ in range(8):
        if cur is None:
            return None
        code = getattr(cur, "sqlstate", None) or getattr(cur, "pgcode", None)
        if code:
            return str(code)
        cur = getattr(cur, "orig", None) or cur.__cause__
    return None


def _clean_message(exc: DBAPIError) -> str:
    """Mensaje legible del error subyacente (sin el envoltorio de SQLAlchemy)."""
    orig = getattr(exc, "orig", None)
    cause = getattr(orig, "__cause__", None)
    msg = str(cause or orig or exc)
    return msg.splitlines()[0][:300]


def _chain(exc: BaseException):
    """Itera toda la cadena de causas: orig, __cause__ y __context__."""
    seen: set[int] = set()
    stack: list[BaseException | None] = [exc]
    while stack:
        cur = stack.pop()
        if cur is None or id(cur) in seen:
            continue
        seen.add(id(cur))
        yield cur
        stack.extend(
            [getattr(cur, "orig", None), cur.__cause__, cur.__context__]
        )


def _is_client_data_error(exc: BaseException) -> bool:
    """¿Hay en la cadena un error de dato/códec de entrada (→ 422)?

    Cubre el DataError del lado cliente de asyncpg (p. ej. un id fuera del rango
    de smallint), que no lleva SQLSTATE, y el OverflowError que lo origina.
    """
    for cur in _chain(exc):
        if isinstance(cur, (pgexc.DataError, OverflowError)):
            return True
        if type(cur).__name__ in {"DataError", "OverflowError"}:
            return True
    return False


async def dbapi_error_handler(request: Request, exc: DBAPIError) -> JSONResponse:
    code = _sqlstate(exc)
    mapping = _SQLSTATE_MAP.get(code or "")
    if mapping is None:
        # Sin SQLSTATE mapeado: los errores de códec de asyncpg (p. ej. un id de
        # ruta fuera del rango de smallint) son DataError del lado cliente, sin
        # sqlstate. Son entrada inválida → 422, no un fallo del servidor.
        if _is_client_data_error(exc):
            mapping = (status.HTTP_422_UNPROCESSABLE_ENTITY, "Valor fuera de rango")
        else:
            # Error de BD no contemplado: conservar el 500 y su traza.
            raise exc
    http_status, prefix = mapping
    return JSONResponse(
        status_code=http_status,
        content={"detail": f"{prefix}: {_clean_message(exc)}"},
    )


def register_exception_handlers(app) -> None:
    # IntegrityError es subclase de DBAPIError; un solo handler cubre ambos
    # porque Starlette resuelve por MRO y DBAPIError es la base común.
    app.add_exception_handler(DBAPIError, dbapi_error_handler)
