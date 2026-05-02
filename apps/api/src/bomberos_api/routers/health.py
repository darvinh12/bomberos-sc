from fastapi import APIRouter
from sqlalchemy import text

from bomberos_api.core.deps import DbSession

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db(db: DbSession) -> dict[str, str]:
    res = await db.execute(text("SELECT 1"))
    res.scalar_one()
    return {"status": "ok", "db": "ok"}
