"""Carga ``ddl_legacy.sql`` y ``datos_legacy.sql`` en una instancia de SQL Server.

Crea la base si no existe (o la recrea con ``--recrear``), ejecuta los lotes
separados por ``GO`` y al final imprime el conteo de filas por tabla
comparado con ``conteos_esperados.json``.

Uso (autenticación integrada de Windows, por defecto):
    python cargar.py --server "localhost\\SQLEXPRESS"
    python cargar.py --server "localhost\\SQLEXPRESS" --database PERSONALINTEGRADA_DEMO \
        --driver "ODBC Driver 17 for SQL Server" --recrear

Autenticación SQL (la clave se lee de la variable PERSONALINTEGRADA_DEMO_CLAVE
o se pide por teclado; nunca por argumento):
    python cargar.py --server "localhost\\SQLEXPRESS" --usuario sa
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

DIR = Path(__file__).resolve().parent
DDL = DIR / "ddl_legacy.sql"
DATOS = DIR / "datos_legacy.sql"
CONTEOS = DIR / "conteos_esperados.json"
SEP_GO = re.compile(r"(?im)^\s*GO\s*$")
DRIVERS_PREFERIDOS = [
    "ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server",
    "SQL Server Native Client 11.0", "SQL Server",
]


def importar_pyodbc():
    """Importa pyodbc; si falta, lo instala con pip en el intérprete actual."""
    try:
        import pyodbc  # noqa: PLC0415
    except ImportError:
        print("pyodbc no está instalado: instalando con pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyodbc"])
        import pyodbc  # noqa: PLC0415
    return pyodbc


def elegir_driver(pyodbc, pedido: str) -> str:
    disponibles = pyodbc.drivers()
    if pedido in disponibles:
        return pedido
    for d in DRIVERS_PREFERIDOS:
        if d in disponibles:
            print(f"AVISO: el driver {pedido!r} no está instalado; se usa {d!r}.")
            return d
    raise SystemExit(
        f"No hay driver ODBC para SQL Server. Instalados: {disponibles}. Instale "
        "'ODBC Driver 17 for SQL Server' (https://learn.microsoft.com/sql/connect/odbc/)."
    )


def cadena_conexion(driver: str, server: str, database: str, usuario: str | None,
                    clave: str | None) -> str:
    partes = [f"DRIVER={{{driver}}}", f"SERVER={server}", f"DATABASE={database}"]
    if usuario:
        partes += [f"UID={usuario}", f"PWD={{{clave}}}"]
    else:
        partes.append("Trusted_Connection=yes")
    if driver.startswith("ODBC Driver"):
        # Instancia local con certificado autofirmado (Driver 18 cifra por defecto).
        partes += ["Encrypt=yes" if "18" in driver else "Encrypt=no", "TrustServerCertificate=yes"]
    return ";".join(partes) + ";"


def lotes(ruta: Path) -> list[str]:
    return [b.strip() for b in SEP_GO.split(ruta.read_text(encoding="utf-8")) if b.strip()]


def ejecutar_archivo(cn, ruta: Path) -> None:
    cur = cn.cursor()
    todos = lotes(ruta)
    t0 = time.perf_counter()
    for k, lote in enumerate(todos, start=1):
        try:
            cur.execute(lote)
            while cur.nextset():  # vaciar resultados intermedios, si los hubiera
                pass
        except Exception as e:  # noqa: BLE001 — se informa el lote y se aborta
            cabecera = next((ln for ln in lote.splitlines() if not ln.startswith("--")), "")[:160]
            raise SystemExit(f"Error en {ruta.name}, lote {k}/{len(todos)} ({cabecera}...):\n{e}")
        if k % 25 == 0 or k == len(todos):
            print(f"  {ruta.name}: {k}/{len(todos)} lotes ({time.perf_counter() - t0:.1f} s)")
    cur.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Carga el demo de PERSONALINTEGRADA en SQL Server")
    ap.add_argument("--server", default=r"localhost\SQLEXPRESS")
    ap.add_argument("--database", default="PERSONALINTEGRADA_DEMO")
    ap.add_argument("--driver", default="ODBC Driver 17 for SQL Server")
    ap.add_argument("--usuario", help="usuario SQL (si se omite: autenticación integrada)")
    ap.add_argument("--recrear", action="store_true", help="borra y vuelve a crear la base")
    ap.add_argument("--solo-conteo", action="store_true", help="no carga; solo cuenta filas")
    ap.add_argument("--timeout", type=int, default=15, help="segundos para conectar")
    args = ap.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9_]+", args.database):
        raise SystemExit("Nombre de base inválido: use solo letras, dígitos y '_'")
    if args.database.upper() == "PERSONALINTEGRADA":
        raise SystemExit("Por seguridad este script no escribe en una base llamada PERSONALINTEGRADA")

    pyodbc = importar_pyodbc()
    driver = elegir_driver(pyodbc, args.driver)
    clave = None
    if args.usuario:
        clave = os.environ.get("PERSONALINTEGRADA_DEMO_CLAVE") or getpass.getpass("Clave SQL: ")

    print(f"Servidor {args.server} · driver {driver!r} · base {args.database}")
    try:
        maestro = pyodbc.connect(cadena_conexion(driver, args.server, "master", args.usuario,
                                                 clave), autocommit=True, timeout=args.timeout)
    except pyodbc.Error as e:
        raise SystemExit(f"No se pudo conectar a {args.server}: {e}")
    version = maestro.execute("SELECT @@VERSION").fetchone()[0].splitlines()[0]
    print(f"Conectado: {version}")
    existe = maestro.execute("SELECT DB_ID(?)", args.database).fetchone()[0] is not None
    if existe and args.recrear and not args.solo_conteo:
        print(f"Borrando la base {args.database}...")
        maestro.execute(f"ALTER DATABASE [{args.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE")
        maestro.execute(f"DROP DATABASE [{args.database}]")
        existe = False
    if not existe:
        if args.solo_conteo:
            raise SystemExit(f"La base {args.database} no existe")
        print(f"Creando la base {args.database}...")
        maestro.execute(f"CREATE DATABASE [{args.database}]")
    maestro.close()

    cn = pyodbc.connect(cadena_conexion(driver, args.server, args.database, args.usuario,
                                        clave), autocommit=True, timeout=args.timeout)
    if not args.solo_conteo:
        print("Ejecutando DDL...")
        ejecutar_archivo(cn, DDL)
        print("Cargando datos...")
        ejecutar_archivo(cn, DATOS)

    esperado = json.loads(CONTEOS.read_text(encoding="utf-8"))["filas"]
    print(f"\n{'Tabla':<38} {'Filas':>7} {'Esperado':>9}")
    print("-" * 57)
    diferencias = 0
    for tabla, n_esp in esperado.items():
        nombre = "[" + tabla.replace("]", "]]") + "]"
        n = cn.execute(f"SELECT COUNT_BIG(*) FROM dbo.{nombre}").fetchone()[0]
        marca = "" if n == n_esp else "  <-- DIFERENTE"
        diferencias += n != n_esp
        print(f"{tabla:<38} {n:>7,} {n_esp:>9,}{marca}")
    total = sum(esperado.values())
    print("-" * 57)
    print(f"{'TOTAL esperado':<38} {'':>7} {total:>9,}")
    por_zona = cn.execute(
        "SELECT z.COD_ZONA, z.ZONA, "
        "(SELECT COUNT(*) FROM dbo.FUNCIONARIOS f JOIN dbo.UBICACION_ADMINISTRATIVA u "
        " ON u.ID = f.COD_UBICACION WHERE u.COD_ZONA = z.COD_ZONA), "
        "(SELECT COUNT(*) FROM dbo.FUNCIONARIOS_EGRESADOS f JOIN dbo.UBICACION_ADMINISTRATIVA u "
        " ON u.ID = f.COD_UBICACION WHERE u.COD_ZONA = z.COD_ZONA) "
        "FROM dbo.ZONAS z ORDER BY z.COD_ZONA").fetchall()
    print("\nExpedientes por zona (ubicación vigente):")
    for cod, nombre, act, egr in por_zona:
        print(f"  {int(cod):>2} {nombre:<22} activos {act:>3}  egresados {egr:>3}")
    cn.close()
    if diferencias:
        print(f"\n{diferencias} tablas con conteo distinto al esperado")
        return 1
    print("\nCarga completa y conteos correctos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
