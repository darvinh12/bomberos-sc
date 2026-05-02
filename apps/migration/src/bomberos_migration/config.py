"""Configuración de cadenas de conexión y parámetros."""
import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    legacy_dsn: str  # cadena pyodbc para SQL Server
    target_dsn: str  # cadena asyncpg para PostgreSQL
    batch_size: int = 500
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Config":
        legacy = os.getenv("LEGACY_DSN") or _build_legacy_default()
        target = os.getenv("TARGET_DSN") or (
            "postgresql://postgres:postgres@localhost:5432/bomberos_caracas"
        )
        return cls(
            legacy_dsn=legacy,
            target_dsn=target,
            batch_size=int(os.getenv("BATCH_SIZE", "500")),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )


def _build_legacy_default() -> str:
    """Cadena ODBC default para SQL Server local."""
    return (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=localhost;"
        "DATABASE=PERSONALINTEGRADA;"
        "Trusted_Connection=yes;"
    )
