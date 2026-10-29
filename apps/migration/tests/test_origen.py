"""Lectura de scripts T-SQL de INSERTs (origen sin SQL Server)."""
import asyncio
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from bomberos_migration.destino import DestinoNulo
from bomberos_migration.migrate import Motor, Opciones
from bomberos_migration.origen import OrigenScriptTsql

SCRIPT = """SET NOCOUNT ON;
GO
-- FUNCIONARIOS
INSERT INTO dbo.[FUNCIONARIOS] ([CEDULA], [NACIONALIDAD], [APELLIDOS], [FECHA_INGRESO],
 [COD_JERARQUIA], [CORREO_ELECTRONICO]) VALUES
(90000001, N'V', N'O''BRIEN, NUÑEZ', '2012-12-24T00:00:00', 12, NULL),
(90000002, N'E', N'(PAREN), Y COMA', '1900-01-01T00:00:00', -3, N'a@b.c');
GO
INSERT INTO dbo.[EVALUACIONES] ([IDEVALUACION], [DESEMPEÑO], [Fecha Ultimo Ascenso]) VALUES
(1, 17.49, NULL);
GO
"""

DEMO = Path(__file__).resolve().parents[1] / "demo_legacy" / "datos_legacy.sql"


def test_script_tsql_literales(tmp_path):
    p = tmp_path / "datos.sql"
    p.write_text(SCRIPT, encoding="utf-8")
    o = OrigenScriptTsql(p)
    assert o.listar_tablas() == [("EVALUACIONES", 1), ("FUNCIONARIOS", 2)]
    f1, f2 = list(o.leer("funcionarios"))
    assert f1["APELLIDOS"] == "O'BRIEN, NUÑEZ"
    assert f1["FECHA_INGRESO"] == datetime(2012, 12, 24)
    assert f1["CORREO_ELECTRONICO"] is None and f1["CEDULA"] == 90000001
    assert f2["APELLIDOS"] == "(PAREN), Y COMA" and f2["COD_JERARQUIA"] == -3
    (ev,) = o.leer("EVALUACIONES")
    assert ev["DESEMPENO"] == Decimal("17.49") and "FECHA_ULTIMO_ASCENSO" in ev


@pytest.mark.skipif(not DEMO.exists(), reason="conjunto demostrativo no generado")
def test_demo_legacy_ensayo_solo_origen_por_zona():
    """El conjunto de demo_legacy recorre toda la herramienta sin errores."""
    op = Opciones(solo_origen=True, zona="1", hoy=date(2026, 5, 4))
    rep = asyncio.run(Motor(OrigenScriptTsql(DEMO), DestinoNulo(), op).ejecutar())
    assert rep.alcance["expedientes_en_alcance"] > 0
    assert rep.excluidas and not rep.errores
    exp = next(e for e in rep.tablas.values() if e.origen == "EXPEDIENTE")
    assert exp.insertadas + exp.descartadas == exp.en_alcance
