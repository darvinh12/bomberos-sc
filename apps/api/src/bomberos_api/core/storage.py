"""Capa de almacenamiento de archivos binarios (fotos, huellas, firmas, documentos).

Deploy on-premise: solo se soporta filesystem local. La interfaz abstracta
permite cambiar a otro backend (NFS, MinIO interno) sin tocar los routers.
"""

from __future__ import annotations

import asyncio
import os
from abc import ABC, abstractmethod
from pathlib import Path

from bomberos_api.config import get_settings

# Mapa de extensiones → content-type. Se usa en read() para reconstruir el
# header al servir el archivo.
_EXT_TO_CT: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}

_DEFAULT_CT = "application/octet-stream"


def _validate_relative_path(path: str) -> None:
    """Rechaza path traversal y rutas absolutas. Se llama en todas las
    operaciones que reciben `path` desde el caller."""
    if not path or not path.strip():
        raise ValueError("path no puede estar vacío")
    # Normalizar separadores para chequeo de traversal en Windows + POSIX.
    normalized = path.replace("\\", "/")
    parts = normalized.split("/")
    if any(p == ".." for p in parts):
        raise ValueError("path no puede contener '..' (traversal)")
    if os.path.isabs(path) or normalized.startswith("/"):
        raise ValueError("path debe ser relativo")


class StorageBackend(ABC):
    """Interfaz mínima de almacenamiento. Async-first."""

    @abstractmethod
    async def save(self, path: str, content: bytes, content_type: str) -> str:
        """Guarda `content` en `path` (relativo al backend) y devuelve el
        identificador final (path) a persistir en BD."""

    @abstractmethod
    async def read(self, path: str) -> tuple[bytes, str]:
        """Devuelve (bytes, content_type). Lanza FileNotFoundError si no existe."""

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Borra el archivo. No lanza error si no existe."""

    @abstractmethod
    async def exists(self, path: str) -> bool:
        ...


class LocalStorage(StorageBackend):
    """Almacenamiento en filesystem local. Pensado para intranet on-premise."""

    def __init__(self, base_path: str) -> None:
        self._base = Path(base_path).resolve()

    def _full(self, path: str) -> Path:
        _validate_relative_path(path)
        full = (self._base / path).resolve()
        # Defensa en profundidad: garantizar que la ruta resuelta cae dentro
        # de la base, aún si pasó la validación textual.
        try:
            full.relative_to(self._base)
        except ValueError as e:
            raise ValueError("path fuera del directorio base") from e
        return full

    async def save(self, path: str, content: bytes, content_type: str) -> str:
        full = self._full(path)

        def _write() -> None:
            full.parent.mkdir(parents=True, exist_ok=True)
            with open(full, "wb") as f:
                f.write(content)

        await asyncio.to_thread(_write)
        # Retornar path relativo normalizado (POSIX-style), que es lo que se
        # guarda en BD y se devuelve al cliente.
        return path.replace("\\", "/")

    async def read(self, path: str) -> tuple[bytes, str]:
        full = self._full(path)

        def _read() -> bytes:
            with open(full, "rb") as f:
                return f.read()

        data = await asyncio.to_thread(_read)
        ext = full.suffix.lower()
        ct = _EXT_TO_CT.get(ext, _DEFAULT_CT)
        return data, ct

    async def delete(self, path: str) -> None:
        full = self._full(path)

        def _delete() -> None:
            try:
                os.remove(full)
            except FileNotFoundError:
                pass

        await asyncio.to_thread(_delete)

    async def exists(self, path: str) -> bool:
        full = self._full(path)
        return await asyncio.to_thread(os.path.exists, full)


_storage_singleton: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """Devuelve la instancia singleton de almacenamiento configurada por
    settings.storage_path. Pensado para usarse como dependencia o helper
    directo desde los routers."""
    global _storage_singleton
    if _storage_singleton is None:
        settings = get_settings()
        _storage_singleton = LocalStorage(settings.storage_path)
    return _storage_singleton
