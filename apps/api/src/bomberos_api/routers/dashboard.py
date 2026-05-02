from fastapi import APIRouter
from sqlalchemy import text

from bomberos_api.core.deps import CurrentUser, DbSession

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard(db: DbSession, _: CurrentUser) -> dict:
    res = await db.execute(text("SELECT * FROM sys.v_dashboard"))
    row = res.mappings().one()
    return dict(row)


@router.get("/distribucion-zona")
async def distribucion_zona(db: DbSession, _: CurrentUser) -> list[dict]:
    res = await db.execute(text("SELECT * FROM personal.v_distribucion_zona"))
    return [dict(r) for r in res.mappings().all()]


@router.get("/inventario-disponible")
async def inventario_disponible(db: DbSession, _: CurrentUser) -> list[dict]:
    res = await db.execute(text("SELECT * FROM equipo.v_inventario_disponible"))
    return [dict(r) for r in res.mappings().all()]


@router.get("/reposos-activos")
async def reposos_activos(db: DbSession, _: CurrentUser) -> list[dict]:
    res = await db.execute(text("SELECT * FROM salud.v_reposos_activos LIMIT 200"))
    return [dict(r) for r in res.mappings().all()]


@router.get("/vacaciones-actuales")
async def vacaciones_actuales(db: DbSession, _: CurrentUser) -> list[dict]:
    res = await db.execute(text("SELECT * FROM ops.v_vacaciones_actuales LIMIT 200"))
    return [dict(r) for r in res.mappings().all()]
