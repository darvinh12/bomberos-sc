from fastapi.testclient import TestClient

from bomberos_api.main import app


def test_health() -> None:
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


def test_security_headers() -> None:
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert "Referrer-Policy" in r.headers


def test_openapi_schema_has_all_routers() -> None:
    """Smoke test: la app arranca sin errores y expone todos los grupos."""
    with TestClient(app) as client:
        r = client.get("/openapi.json")
        assert r.status_code == 200
        tags = {t["name"] for t in r.json().get("tags", [])} if "tags" in r.json() else set()
        # Si no hay tags top-level, extraerlos de las operaciones
        if not tags:
            for path_obj in r.json()["paths"].values():
                for op in path_obj.values():
                    if isinstance(op, dict):
                        for t in op.get("tags", []):
                            tags.add(t)
        expected = {
            "auth", "funcionarios", "catalogos", "salud", "ops",
            "carrera", "equipo", "beneficios", "egresos", "dashboard", "admin",
        }
        assert expected.issubset(tags), f"Faltan tags: {expected - tags}"
