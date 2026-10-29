"""Punto de entrada para Vercel (Python serverless).

Vercel detecta la variable ASGI `app` y la sirve. Todas las rutas se reescriben
a esta función vía vercel.json.
"""
import os
import sys

# El paquete vive en apps/api/src/bomberos_api
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from bomberos_api.main import create_app  # noqa: E402

app = create_app()
