# Migración Legacy VB+SQL Server → PostgreSQL — Implementation Plan

> **Para agentes:** SKILL REQUERIDA: superpowers:subagent-driven-development o superpowers:executing-plans.

**Goal:** Migrar datos desde `PERSONALINTEGRADA` (SQL Server, ~230 tablas) a `bomberos_caracas` (PostgreSQL, ~85 tablas) en forma reproducible, idempotente y validable.

**Architecture:** Lecturas streaming con pyodbc, escritura batch con asyncpg COPY donde sea posible. Idempotencia vía UPSERT por (nacionalidad, cedula). Reporte detallado de filas migradas vs descartadas con razón. Migración corre con `app.bypass_rls='1'` para saltarse RLS del destino.

**Tech Stack:** Python 3.11+, pyodbc 5.1+, asyncpg 0.30+, SQLAlchemy 2, click + rich (CLI), PyYAML (mapping declarativo).

**Esfuerzo estimado:** 40-80 horas / 1-2 semanas / 1 dev senior. Depende de calidad de datos legacy.

---

## Índice

- [Sección 1 — Preparación (5.1-5.4)](#sección-1--preparación-51-54)
- [Sección 2 — Migración por dominio (5.5-5.18)](#sección-2--migración-por-dominio-en-orden-de-fks-55-518)
- [Sección 3 — Validación post-migración (5.19-5.21)](#sección-3--validación-post-migración-519-521)
- [Sección 4 — Cutover (5.22-5.24)](#sección-4--cutover-522-524)
- [Apéndice A — Tabla de cobertura 5.1-5.24](#apéndice-a--tabla-de-cobertura-5151-524)

---

## Sección 1 — Preparación (5.1-5.4)

Objetivo: dejar el entorno listo para correr `analyze` y `migrate --dry-run` con datos reales.

### 5.1 — Acceso a la BD legacy (dump restaurado o VPN/túnel)

Hay dos escenarios. Elegir uno y dejar documentado en `apps/migration/reports/2026-05-19-entorno.md`.

**Opción A: Dump `.bak` restaurado en SQL Server local (preferida).**

```powershell
# Pre-requisito: SQL Server Express 2022 instalado en localhost\SQLEXPRESS
# (descarga gratuita: https://www.microsoft.com/sql-server/sql-server-downloads)

# 1. Copiar el .bak al disco local (NUNCA dejarlo en pendrive durante la restauración)
Copy-Item -Path "E:\PERSONALINTEGRADA.bak" -Destination "C:\backups\PERSONALINTEGRADA.bak"

# 2. Restaurar
sqlcmd -S localhost\SQLEXPRESS -E -Q @"
RESTORE DATABASE PERSONALINTEGRADA
FROM DISK = N'C:\backups\PERSONALINTEGRADA.bak'
WITH MOVE 'PERSONALINTEGRADA' TO 'C:\SQLData\PI.mdf',
     MOVE 'PERSONALINTEGRADA_log' TO 'C:\SQLData\PI.ldf',
     REPLACE, STATS = 5;
"@

# 3. Validar
sqlcmd -S localhost\SQLEXPRESS -E -d PERSONALINTEGRADA -Q `
  "SELECT COUNT(*) AS total_tablas FROM sys.tables"

# 4. Crear usuario read-only para la migración (evita riesgo de modificar el origen por accidente)
sqlcmd -S localhost\SQLEXPRESS -E -d PERSONALINTEGRADA -Q @"
CREATE LOGIN bomberos_reader WITH PASSWORD = 'CHANGEME_LOCAL_ONLY!';
CREATE USER bomberos_reader FOR LOGIN bomberos_reader;
GRANT SELECT, VIEW DEFINITION ON SCHEMA::dbo TO bomberos_reader;
DENY INSERT, UPDATE, DELETE, ALTER ON SCHEMA::dbo TO bomberos_reader;
"@
```

**Opción B: Conexión directa al servidor del cliente vía VPN o túnel SSH.**

```powershell
# B.1 — OpenVPN: instalar perfil del cliente, conectar
& "C:\Program Files\OpenVPN\bin\openvpn-gui.exe" --connect bomberos.ovpn

# B.2 — Alternativa, túnel SSH local con clave pasada por el cliente
ssh -i ~/.ssh/bomberos_jump -L 14333:sqlserver.internal:1433 jump@bomberos.gob.ve -N

# Validar conectividad antes de avanzar
Test-NetConnection -ComputerName localhost -Port 14333
```

**Criterio de aceptación 5.1:** `sqlcmd -S <servidor> -d PERSONALINTEGRADA -Q "SELECT TOP 1 * FROM sys.tables"` devuelve filas sin error.

---

### 5.2 — Configurar `.env` de migration

Crear el archivo `apps/migration/.env` (nunca commitearlo: ya está en `.gitignore`).

**Plantilla para Opción A (dump local):**

```env
# apps/migration/.env
LEGACY_DSN=DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=PERSONALINTEGRADA;UID=bomberos_reader;PWD=CHANGEME_LOCAL_ONLY!;TrustServerCertificate=yes;ApplicationIntent=ReadOnly;
TARGET_DSN=postgresql://migrator:migrator_pw@localhost:5432/bomberos_caracas
BATCH_SIZE=500
LOG_LEVEL=INFO
PG_BYPASS_RLS=1
MIGRATION_RUN_ID=2026-05-19-prod-cutover
```

**Plantilla para Opción B (túnel SSH):**

```env
LEGACY_DSN=DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost,14333;DATABASE=PERSONALINTEGRADA;UID=lector;PWD=<provista_por_cliente>;TrustServerCertificate=yes;ApplicationIntent=ReadOnly;
TARGET_DSN=postgresql://migrator:migrator_pw@localhost:5432/bomberos_caracas
BATCH_SIZE=500
LOG_LEVEL=INFO
PG_BYPASS_RLS=1
MIGRATION_RUN_ID=2026-05-19-prod-cutover
```

Crear el rol `migrator` en Postgres destino (debe tener BYPASSRLS o ser miembro de un rol que pueda hacer `SET app.bypass_rls`):

```sql
-- Ejecutar como superuser en bomberos_caracas
CREATE ROLE migrator WITH LOGIN PASSWORD 'migrator_pw' BYPASSRLS;
GRANT USAGE ON SCHEMA core, personal, salud, ops, carrera, equipo,
                 beneficios, vivienda, egresos, documentos, org, geo,
                 seguridad, aud, public TO migrator;
GRANT INSERT, UPDATE, SELECT, REFERENCES ON ALL TABLES IN SCHEMA
    core, personal, salud, ops, carrera, equipo, beneficios, vivienda,
    egresos, documentos, org, geo TO migrator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA
    core, personal, salud, ops, carrera, equipo, beneficios, vivienda,
    egresos, documentos, org, geo TO migrator;
```

Extender `config.py` para que exponga `pg_bypass_rls` y `run_id`. Modificar `Config` para incluir:

```python
# apps/migration/src/bomberos_migration/config.py — EDIT
@dataclass(frozen=True)
class Config:
    legacy_dsn: str
    target_dsn: str
    batch_size: int = 500
    log_level: str = "INFO"
    pg_bypass_rls: bool = True
    run_id: str = "manual"

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
            pg_bypass_rls=os.getenv("PG_BYPASS_RLS", "1") == "1",
            run_id=os.getenv("MIGRATION_RUN_ID", "manual"),
        )
```

**Criterio de aceptación 5.2:** `bomberos-migrate analyze` arranca sin error de conexión.

---

### 5.3 — Correr `analyze` y revisar reporte

```powershell
cd apps\migration
.venv\Scripts\bomberos-migrate analyze | Tee-Object -FilePath "reports\$($env:MIGRATION_RUN_ID)-analyze.txt"
```

Extender `analyze.py` para emitir además un JSON parseable que se usa para construir `mapping.yaml`:

```python
# apps/migration/src/bomberos_migration/analyze.py — EDIT
# Agregar al final de run_analyze, después de imprimir la tabla rich:

import json
from pathlib import Path
from datetime import datetime

def run_analyze(config: Config) -> None:
    # ... código existente ...
    with legacy_conn(config.legacy_dsn) as cn:
        cur = cn.cursor()
        cur.execute(
            """
            SELECT t.name AS tabla, SUM(p.rows) AS filas
            FROM sys.tables t
            INNER JOIN sys.partitions p ON p.object_id = t.object_id
            WHERE p.index_id IN (0, 1)
            GROUP BY t.name
            ORDER BY filas DESC, t.name
            """
        )
        tables = [(r.tabla, int(r.filas or 0)) for r in cur.fetchall()]

        # Capturar columnas de TODAS las tablas no descartadas
        descartar_sufijos = ("_VIEJA", "_OLD", "_ORIGINAL", "_BD_VIEJA",
                             "_BACKUP", "_BKP", "_TMP", "_TEMP")
        inventario = []
        for tname, rows in tables:
            descartar = any(tname.upper().endswith(s) for s in descartar_sufijos) \
                        or "(ORIGINAL)" in tname.upper()
            try:
                cur.execute(f"SELECT TOP 0 * FROM dbo.[{tname}]")
                cols = [
                    {"name": c[0], "type_code": c[1].__name__ if c[1] else None,
                     "precision": c[3], "scale": c[5], "nullable": c[6]}
                    for c in cur.description
                ]
            except Exception as e:
                cols = []
            inventario.append({
                "tabla": tname,
                "filas": rows,
                "descartar": descartar,
                "columnas": cols,
            })

        out = Path("reports") / f"{config.run_id}-inventario.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({
            "generated_at": datetime.now().isoformat(),
            "run_id": config.run_id,
            "total_tablas": len(inventario),
            "tablas": inventario,
        }, indent=2, default=str), encoding="utf-8")
        console.print(f"[green]Inventario completo escrito en {out}[/]")
        cur.close()
```

**Checklist de revisión del reporte:**

- [ ] `FUNCIONARIOS` aparece con conteo > 0 y columnas esperadas (`CEDULA`, `APELLIDOS`, `NOMBRES`, `FECHA_INGRESO`, ...).
- [ ] `DETALLE_EGRESO` existe y tiene `FECHA_EGRESO`, `MOTIVO`, `CEDULA`.
- [ ] `HISTORICO_JERARQUIA` y `HISTORICO_UBICACION_ADMINISTRATIVA` presentes.
- [ ] `REPOSOS` canónica identificada. Tablas `REPOSOS_VIEJA`, `REPOSOS(ORIGINAL)`, `REPOSOS_BD_VIEJA` marcadas como `descartar: true`.
- [ ] Total de tablas marcadas `descartar=true` documentado en `reports/<run_id>-descartadas.md`.

**Criterio de aceptación 5.3:** existe `reports/<run_id>-inventario.json` y la lista de descartadas está aprobada por el equipo.

---

### 5.4 — Generar `mapping.yaml`

Crear `apps/migration/src/bomberos_migration/mapping.yaml` con la plantilla completa de abajo, completando los `# VERIFICAR` con los nombres reales observados en el inventario.

```yaml
# apps/migration/src/bomberos_migration/mapping.yaml
#
# Mapping declarativo legacy -> nuevo.
#   - target: schema.tabla destino en bomberos_caracas
#   - columns: cada clave es nombre legacy, valor es:
#       target:    columna destino
#       transform: nombre de función en transform.py (opcional)
#       default:   valor literal si origen NULL/missing (opcional)
#       skip_if_null: true | false (default false)
#   - skip_if:   expresión SQL extra para WHERE
#   - filter_legacy_suffixes: si true, ignora tablas con sufijo _VIEJA/_OLD/_ORIGINAL/_BD_VIEJA/_BACKUP
#   - depends_on: lista de dominios que deben migrarse antes (orden de FKs)
#   - lookup_funcionario_by_cedula: true si necesita resolver CEDULA -> funcionario_id

meta:
  version: 1
  generated_at: "2026-05-19"
  source_db: PERSONALINTEGRADA
  target_db: bomberos_caracas
  filter_legacy_suffixes: true
  legacy_suffixes_to_skip:
    - _VIEJA
    - _OLD
    - _ORIGINAL
    - _BD_VIEJA
    - _BACKUP
    - _BKP
    - _TMP
    - _TEMP
  legacy_substrings_to_skip:
    - "(ORIGINAL)"
    - "(VIEJA)"

# -------------------------------------------------------------------
# DOMINIO: catalogos (5.5)
# -------------------------------------------------------------------
catalogos:
  order: 1
  tables:
    JERARQUIAS:                                # VERIFICAR nombre exacto
      target: core.jerarquias
      columns:
        CODIGO:        { target: codigo }
        NOMBRE:        { target: nombre }
        ORDEN:         { target: orden, default: 0 }
        ABREVIATURA:   { target: abreviatura }
      conflict_on: [codigo]

    CARGOS:
      target: core.cargos
      columns:
        CODIGO:   { target: codigo }
        NOMBRE:   { target: nombre }
        NIVEL:    { target: nivel }
      conflict_on: [codigo]

    CONDICIONES:
      target: core.condiciones
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    NIVELES_EDUCATIVOS:
      target: core.niveles_educativos
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    ESPECIALIDADES:
      target: core.especialidades
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    ESTADOS_CIVILES:
      target: core.estados_civiles
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    GRUPOS_SANGUINEOS:
      target: core.grupos_sanguineos
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    BANCOS:
      target: core.bancos
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

# -------------------------------------------------------------------
# DOMINIO: org (5.6)
# -------------------------------------------------------------------
org:
  order: 2
  depends_on: [catalogos]
  tables:
    ZONAS:
      target: org.zonas
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    ESTACIONES:
      target: org.estaciones
      columns:
        CODIGO:    { target: codigo }
        NOMBRE:    { target: nombre }
        ZONA_ID:   { target: zona_id, transform: lookup_zona_by_codigo }
        DIRECCION: { target: direccion }
        TELEFONO:  { target: telefono }
      conflict_on: [codigo]

    DIVISIONES:
      target: org.divisiones
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    AREAS:
      target: org.areas
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

    DEPENDENCIAS:
      target: org.dependencias
      columns:
        CODIGO:  { target: codigo }
        NOMBRE:  { target: nombre }
      conflict_on: [codigo]

# -------------------------------------------------------------------
# DOMINIO: funcionarios (5.7)
# -------------------------------------------------------------------
funcionarios:
  order: 3
  depends_on: [catalogos, org]
  tables:
    FUNCIONARIOS:
      target: personal.funcionarios
      transform_row: funcionario_from_legacy
      conflict_on: [nacionalidad, cedula]
      columns:
        CEDULA:              { target: [nacionalidad, cedula], transform: split_cedula }
        APELLIDOS:           { target: apellidos }
        NOMBRES:             { target: nombres }
        FECHA_NACIMIENTO:    { target: fecha_nacimiento, transform: parse_date }
        SEXO:                { target: sexo, transform: normalize_sexo }
        TIPO_PERSONAL:       { target: tipo_personal, transform: normalize_tipo_personal }
        NUMERO_EMPLEADO:     { target: numero_empleado }
        FECHA_INGRESO:       { target: fecha_primer_ingreso, transform: parse_date }
        ESTATUS:             { target: estatus, transform: normalize_estatus }
        TELEFONO_MOVIL:      { target: telefono_movil }
        CORREO:              { target: correo }
        PROFESION:           { target: profesion }
        IUTB:                { target: iutb }
        EGRESADO_UNES:       { target: egresado_unes }
      skip_if: "CEDULA IS NULL"

# -------------------------------------------------------------------
# DOMINIO: periodos (5.8)
# -------------------------------------------------------------------
periodos:
  order: 4
  depends_on: [funcionarios]
  reconstruct: true
  source_tables: [FUNCIONARIOS, DETALLE_EGRESO]
  reconstructor: reconstruir_periodos_servicio
  target: personal.periodos_servicio

# -------------------------------------------------------------------
# DOMINIO: historicos (5.9)
# -------------------------------------------------------------------
historicos:
  order: 5
  depends_on: [funcionarios, catalogos, org]
  lookup_funcionario_by_cedula: true
  tables:
    HISTORICO_JERARQUIA:
      target: personal.historico_jerarquias
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        JERARQUIA_ID:  { target: jerarquia_id, transform: lookup_jerarquia_by_codigo }
        FECHA_INICIO:  { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:     { target: fecha_fin, transform: parse_date }
        MOTIVO:        { target: motivo }
        RESOLUCION:    { target: resolucion }
      conflict_on: [funcionario_id, fecha_inicio]
      skip_if_null: [CEDULA, FECHA_INICIO]

    HISTORICO_UBICACION_ADMINISTRATIVA:
      target: personal.historico_ubicaciones
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        ZONA:           { target: zona_id, transform: lookup_zona_by_codigo }
        ESTACION:       { target: estacion_id, transform: lookup_estacion_by_codigo }
        AREA:           { target: area_id, transform: lookup_area_by_codigo }
        DEPENDENCIA:    { target: dependencia_id, transform: lookup_dependencia_by_codigo }
        DIVISION:       { target: division_id, transform: lookup_division_by_codigo }
        CARGO:          { target: cargo_id, transform: lookup_cargo_by_codigo }
        FECHA_INICIO:   { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:      { target: fecha_fin, transform: parse_date }
        MOTIVO:         { target: motivo }
      conflict_on: [funcionario_id, fecha_inicio]
      skip_if_null: [CEDULA, FECHA_INICIO]

    HISTORICO_CONDICION:                     # VERIFICAR nombre real
      target: personal.historico_condiciones
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        CONDICION:     { target: condicion_id, transform: lookup_condicion_by_codigo }
        FECHA_INICIO:  { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:     { target: fecha_fin, transform: parse_date }
        MOTIVO:        { target: motivo }
      conflict_on: [funcionario_id, fecha_inicio]
      skip_if_null: [CEDULA, FECHA_INICIO]

    HISTORICO_NUMERO_EQUIPO:                  # VERIFICAR nombre real
      target: personal.historico_numeros_equipo
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        NUMERO_EQUIPO:  { target: numero_equipo }
        FECHA_INICIO:   { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:      { target: fecha_fin, transform: parse_date }
      conflict_on: [funcionario_id, fecha_inicio]
      skip_if_null: [CEDULA, FECHA_INICIO, NUMERO_EQUIPO]

# -------------------------------------------------------------------
# DOMINIO: salud (5.10)
# -------------------------------------------------------------------
salud:
  order: 6
  depends_on: [funcionarios]
  lookup_funcionario_by_cedula: true
  tables:
    REPOSOS:
      target: salud.reposos
      transform_row: reposo_from_legacy
      conflict_on: [funcionario_id, fecha_inicio]
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_INICIO:   { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:      { target: fecha_fin, transform: parse_date }
        DIAGNOSTICO:    { target: diagnostico_libre }
        CERTIFICADO:    { target: documento_url }
        OBSERVACIONES:  { target: observaciones }
      skip_if: "FECHA_INICIO IS NULL OR FECHA_FIN IS NULL"

    LESIONES:                                 # VERIFICAR
      target: salud.lesiones
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_EVENTO:   { target: fecha_evento, transform: parse_date }
        LUGAR:          { target: lugar_evento }
        DESCRIPCION:    { target: descripcion }
        EN_SERVICIO:    { target: en_servicio, default: true }

    EVALUACION_FISICA:                        # VERIFICAR
      target: salud.evaluacion_fisica
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA:          { target: fecha, transform: parse_date }
        RESULTADO:      { target: resultado }

    HCM:                                      # VERIFICAR
      target: salud.hcm
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        POLIZA:         { target: numero_poliza }
        ASEGURADORA:    { target: aseguradora }
        VIGENCIA_DESDE: { target: vigencia_desde, transform: parse_date }
        VIGENCIA_HASTA: { target: vigencia_hasta, transform: parse_date }

    CONSULTAS:                                # VERIFICAR
      target: salud.consultas
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA:          { target: fecha, transform: parse_date }
        MOTIVO:         { target: motivo_consulta }
        DIAGNOSTICO:    { target: diagnostico_libre }

# -------------------------------------------------------------------
# DOMINIO: carnets (5.11)
# -------------------------------------------------------------------
carnets:
  order: 7
  depends_on: [funcionarios]
  lookup_funcionario_by_cedula: true
  router:
    function: route_carnet
    rules:
      - when: "TIPO IN ('VEHICULO','LICENCIA_VEHICULO','CARNET_CIRCULACION')"
        target: personal.carnets_vehiculo
      - default: personal.carnets
  tables:
    CARNETS:                                  # VERIFICAR
      target: personal.carnets         # genérico; vehículo se rutea
      conflict_on: [funcionario_id, tipo_carnet_id, numero]
      columns:
        CEDULA:          { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO:            { target: tipo_carnet_id, transform: lookup_tipo_carnet_by_codigo }
        NUMERO:          { target: numero }
        SERIAL:          { target: serial }
        FECHA_EMISION:   { target: fecha_emision, transform: parse_date }
        FECHA_VENCE:     { target: fecha_vence, transform: parse_date }
        ORGANISMO:       { target: organismo_emisor }
        # Si TIPO indica vehículo, los siguientes van a personal.carnets_vehiculo:
        PLACA:           { target: placa,            target_table: personal.carnets_vehiculo }
        MARCA:           { target: marca,            target_table: personal.carnets_vehiculo }
        MODELO_VEH:      { target: modelo,           target_table: personal.carnets_vehiculo }
        ANIO:            { target: anio,             target_table: personal.carnets_vehiculo }
        COLOR:           { target: color,            target_table: personal.carnets_vehiculo }
        SERIAL_CARROC:   { target: serial_carroceria,target_table: personal.carnets_vehiculo }
        SERIAL_MOTOR:    { target: serial_motor,     target_table: personal.carnets_vehiculo }

    HISTORICO_CARNET:                         # VERIFICAR
      target: personal.historico_carnets
      depends_on_local: [CARNETS]             # debe migrarse después de carnets
      columns:
        CARNET_ID:        { target: carnet_id,       transform: lookup_carnet_by_numero }
        NUMERO_ANTERIOR:  { target: numero_anterior }
        NUMERO_NUEVO:     { target: numero_nuevo }
        MOTIVO:           { target: motivo }
        FECHA:            { target: fecha, transform: parse_date }

# -------------------------------------------------------------------
# DOMINIO: ops (5.12)
# -------------------------------------------------------------------
ops:
  order: 8
  depends_on: [funcionarios, org]
  lookup_funcionario_by_cedula: true
  tables:
    GUARDIAS:
      target: ops.guardias
      conflict_on: [fecha, estacion_id, seccion, turno]
      columns:
        FECHA:        { target: fecha, transform: parse_date }
        ESTACION:     { target: estacion_id, transform: lookup_estacion_by_codigo }
        SECCION:      { target: seccion }
        TURNO:        { target: turno, transform: normalize_turno }
        HORA_INICIO:  { target: hora_inicio }
        HORA_FIN:     { target: hora_fin }
        JEFE_CEDULA:  { target: jefe_guardia_id, transform: mapear_cedula_a_funcionario_id }

    GUARDIA_FUNCIONARIO:
      target: ops.guardia_funcionarios
      depends_on_local: [GUARDIAS]
      conflict_on: [guardia_id, funcionario_id]
      columns:
        GUARDIA_FK:   { target: guardia_id, transform: lookup_guardia_by_natural_key }
        CEDULA:       { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        ASISTIO:      { target: asistio }
        ROL:          { target: rol_guardia }

    PERMISOS:
      target: ops.permisos
      conflict_on: [funcionario_id, fecha_inicio, tipo]
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO:          { target: tipo }
        FECHA_INICIO:  { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:     { target: fecha_fin, transform: parse_date }
        HORAS:         { target: horas }
        MOTIVO:        { target: motivo }
        AUTORIZADO:    { target: autorizado, default: false }

    VACACIONES:
      target: ops.vacaciones
      transform_row: vacaciones_from_legacy
      conflict_on: [funcionario_id, fecha_inicio]
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_INICIO:  { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:     { target: fecha_fin, transform: parse_date }
        DIAS_HABILES:  { target: dias_habiles }
        FRACCIONADA:   { target: fraccionada, default: false }
        AUTORIZADO:    { target: autorizado, default: true }
        OBSERVACIONES: { target: observaciones }

    COMISIONES_SERVICIO:
      target: ops.comisiones_servicio
      conflict_on: [funcionario_id, fecha_inicio]
      columns:
        CEDULA:           { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        INSTITUCION:      { target: institucion_libre }
        CARGO:            { target: cargo_comision }
        FECHA_INICIO:     { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:        { target: fecha_fin, transform: parse_date }
        RESOLUCION:       { target: resolucion }

    FALTAS:
      target: ops.faltas
      conflict_on: [funcionario_id, fecha, tipo_falta]
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO_FALTA:    { target: tipo_falta }
        FECHA:         { target: fecha, transform: parse_date }
        DESCRIPCION:   { target: descripcion }
        SANCION:       { target: sancion }

    PROCESOS_ADMINISTRATIVOS:
      target: ops.procesos_administrativos
      conflict_on: [expediente]
      columns:
        CEDULA:           { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        EXPEDIENTE:       { target: expediente }
        FECHA_APERTURA:   { target: fecha_apertura, transform: parse_date }
        FECHA_CIERRE:     { target: fecha_cierre, transform: parse_date }
        MOTIVO:           { target: motivo }
        RESULTADO:        { target: resultado }

# -------------------------------------------------------------------
# DOMINIO: carrera (5.13)
# -------------------------------------------------------------------
carrera:
  order: 9
  depends_on: [funcionarios, catalogos]
  lookup_funcionario_by_cedula: true
  tables:
    CURSOS:                                   # catálogo
      target: carrera.cursos
      conflict_on: [codigo]
      columns:
        CODIGO:    { target: codigo }
        NOMBRE:    { target: nombre }
        HORAS:     { target: horas }

    CURSOS_REALIZADOS:                        # VERIFICAR
      target: carrera.cursos_realizados
      depends_on_local: [CURSOS]
      conflict_on: [funcionario_id, curso_id, fecha_inicio]
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        CURSO_CODIGO:   { target: curso_id, transform: lookup_curso_by_codigo }
        NOMBRE_LIBRE:   { target: nombre_libre }
        FECHA_INICIO:   { target: fecha_inicio, transform: parse_date }
        FECHA_FIN:      { target: fecha_fin, transform: parse_date }
        NOTA:           { target: nota }
        APROBADO:       { target: aprobado }

    EVALUACIONES:
      target: carrera.evaluaciones
      conflict_on: [funcionario_id, periodo_id]
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        PERIODO:        { target: periodo_id, transform: lookup_periodo_eval_by_codigo }
        PUNTAJE_TOTAL:  { target: puntaje_total }

    ASCENSOS:
      target: carrera.ascensos
      conflict_on: [funcionario_id, fecha]
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA:         { target: fecha, transform: parse_date }
        JERARQUIA:     { target: jerarquia_destino_id, transform: lookup_jerarquia_by_codigo }
        RESOLUCION:    { target: resolucion }

    RECONOCIMIENTOS:
      target: carrera.reconocimientos
      conflict_on: [funcionario_id, fecha, motivo]
      columns:
        CEDULA:    { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA:     { target: fecha, transform: parse_date }
        MOTIVO:    { target: motivo }
        TIPO:      { target: tipo }

# -------------------------------------------------------------------
# DOMINIO: equipo (5.14)
# -------------------------------------------------------------------
equipo:
  order: 10
  depends_on: [funcionarios, org]
  lookup_funcionario_by_cedula: true
  tables:
    EQUIPOS_PROTECCION_TIPO:                  # catálogo
      target: equipo.tipos_proteccion
      conflict_on: [codigo]
      columns:
        CODIGO: { target: codigo }
        NOMBRE: { target: nombre }

    EQUIPOS_PROTECCION_INVENTARIO:
      target: equipo.proteccion_inventario
      depends_on_local: [EQUIPOS_PROTECCION_TIPO]
      conflict_on: [numero_serie]
      columns:
        TIPO_CODIGO:        { target: tipo_id, transform: lookup_tipo_proteccion_by_codigo }
        NUMERO_SERIE:       { target: numero_serie }
        MARCA:              { target: marca }
        MODELO:             { target: modelo }
        FECHA_ADQUISICION:  { target: fecha_adquisicion, transform: parse_date }
        ESTATUS:            { target: estatus, default: DISPONIBLE }

    EQUIPOS_PROTECCION_ASIGNACIONES:
      target: equipo.proteccion_asignaciones
      depends_on_local: [EQUIPOS_PROTECCION_INVENTARIO]
      conflict_on: [inventario_id, fecha_entrega]
      columns:
        NUMERO_SERIE:       { target: inventario_id, transform: lookup_inventario_by_serie }
        CEDULA:             { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_ENTREGA:      { target: fecha_entrega, transform: parse_date }
        FECHA_DEVOLUCION:   { target: fecha_devolucion, transform: parse_date }

    UNIFORMES_TIPO:                           # catálogo
      target: equipo.tipos_uniforme
      conflict_on: [codigo]
      columns:
        CODIGO: { target: codigo }
        NOMBRE: { target: nombre }

    UNIFORMES_ASIGNACIONES:
      target: equipo.uniformes_asignaciones
      depends_on_local: [UNIFORMES_TIPO]
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO_CODIGO:    { target: tipo_id, transform: lookup_tipo_uniforme_by_codigo }
        TALLA:          { target: talla_id, transform: lookup_talla_by_codigo }
        FECHA_ENTREGA:  { target: fecha_entrega, transform: parse_date }

    RADIOS:
      target: equipo.radios
      conflict_on: [numero_serie]
      columns:
        MARCA:        { target: marca_id, transform: lookup_radio_marca_by_codigo }
        MODELO:       { target: modelo_id, transform: lookup_radio_modelo_by_codigo }
        SERIAL:       { target: numero_serie }
        ID_TX:        { target: id_tx }

    RADIO_ASIGNACIONES:
      target: equipo.radio_asignaciones
      depends_on_local: [RADIOS]
      columns:
        SERIAL:         { target: radio_id, transform: lookup_radio_by_serie }
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_ENTREGA:  { target: fecha_entrega, transform: parse_date }

# -------------------------------------------------------------------
# DOMINIO: beneficios (5.15)
# -------------------------------------------------------------------
beneficios:
  order: 11
  depends_on: [funcionarios, catalogos]
  lookup_funcionario_by_cedula: true
  tables:
    AYUDAS:
      target: beneficios.ayudas
      conflict_on: [funcionario_id, fecha_solicitud, motivo]
      columns:
        CEDULA:           { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO_SOLICITUD:   { target: tipo_solicitud_id, transform: lookup_tipo_solicitud_by_codigo }
        MONTO_SOLICITADO: { target: monto_solicitado }
        MONTO_APROBADO:   { target: monto_aprobado }
        FECHA_SOLICITUD:  { target: fecha_solicitud, transform: parse_date }
        MOTIVO:           { target: motivo }
        ESTATUS:          { target: estatus, transform: normalize_estatus_solicitud }

    BENEFICIOS_TIPO:                          # catálogo
      target: beneficios.tipos_beneficio
      conflict_on: [codigo]
      columns:
        CODIGO: { target: codigo }
        NOMBRE: { target: nombre }

    BENEFICIOS_ENTREGAS:
      target: beneficios.entregas
      depends_on_local: [BENEFICIOS_TIPO]
      conflict_on: [funcionario_id, tipo_beneficio_id, periodo]
      columns:
        CEDULA:         { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO_CODIGO:    { target: tipo_beneficio_id, transform: lookup_tipo_beneficio_by_codigo }
        PERIODO:        { target: periodo }
        MONTO:          { target: monto }
        FECHA_ENTREGA:  { target: fecha_entrega, transform: parse_date }

# -------------------------------------------------------------------
# DOMINIO: egresos (5.16)
# -------------------------------------------------------------------
egresos:
  order: 12
  depends_on: [funcionarios]
  lookup_funcionario_by_cedula: true
  tables:
    SOLICITUDES_JUBILACION:                   # VERIFICAR
      target: egresos.solicitudes_jubilacion
      conflict_on: [funcionario_id, fecha_solicitud]
      columns:
        CEDULA:           { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_SOLICITUD:  { target: fecha_solicitud, transform: parse_date }
        ANIOS_SERVICIO:   { target: años_servicio }
        MOTIVO:           { target: motivo }
        ESTATUS:          { target: estatus, transform: normalize_estatus_solicitud }

    PRE_JUBILADOS:
      target: egresos.pre_jubilados
      conflict_on: [funcionario_id]
      columns:
        CEDULA:        { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_INICIO:  { target: fecha_inicio, transform: parse_date }
        ANIOS_SERVICIO: { target: años_servicio }

    JUBILADOS:
      target: egresos.jubilados
      conflict_on: [funcionario_id]
      columns:
        CEDULA:           { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_JUBILACION: { target: fecha_jubilacion, transform: parse_date }
        TIPO:             { target: tipo_jubilacion }
        PENSION_MENSUAL:  { target: pension_mensual }
        RESOLUCION:       { target: resolucion }

    FALLECIMIENTOS:
      target: egresos.fallecimientos
      conflict_on: [funcionario_id]
      columns:
        CEDULA:              { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        FECHA_FALLECIMIENTO: { target: fecha_fallecimiento, transform: parse_date }
        EN_SERVICIO:         { target: en_servicio, default: false }
        CAUSA:               { target: causa }
        ACTA_DEFUNCION:      { target: acta_defuncion }

# -------------------------------------------------------------------
# DOMINIO: documentos (5.17)
# -------------------------------------------------------------------
documentos:
  order: 13
  depends_on: [funcionarios]
  lookup_funcionario_by_cedula: true
  tables:
    ACERVO:                                   # VERIFICAR
      target: documentos.acervo
      columns:
        CEDULA:           { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO_DOCUMENTO:   { target: tipo_documento_id, transform: lookup_tipo_documento_by_codigo }
        TITULO:           { target: titulo }
        NUMERO:           { target: numero }
        FECHA:            { target: fecha_documento, transform: parse_date }
        URL:              { target: documento_url }

    OFICIOS:
      target: documentos.oficios
      conflict_on: [numero]
      columns:
        NUMERO:    { target: numero }
        FECHA:     { target: fecha, transform: parse_date }
        TIPO:      { target: tipo }
        ASUNTO:    { target: asunto }
        CUERPO:    { target: cuerpo }

    ACTAS:
      target: documentos.actas
      conflict_on: [numero]
      columns:
        NUMERO:  { target: numero }
        FECHA:   { target: fecha, transform: parse_date }
        ASUNTO:  { target: asunto }

    FIRMAS_AUTORIZADAS:
      target: documentos.firmas_autorizadas
      columns:
        CEDULA:      { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        TIPO_DOC:    { target: tipo_documento }
        ACTIVO:      { target: activo, default: true }

# -------------------------------------------------------------------
# DOMINIO: identidad_pais (5.18)
# -------------------------------------------------------------------
identidad_pais:
  order: 14
  depends_on: [funcionarios]
  lookup_funcionario_by_cedula: true
  tables:
    HOGARES_PATRIA:                           # VERIFICAR
      target: personal.hogares_patria
      conflict_on: [funcionario_id]
      columns:
        CEDULA:              { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        SERIAL_PATRIA:       { target: serial_carnet_patria }
        CODIGO_HOGAR:        { target: codigo_hogar }
        CANTIDAD_PERSONAS:   { target: cantidad_personas }
        ES_JEFE_HOGAR:       { target: es_jefe_hogar, default: false }

    GDC_HABITACIONAL:
      target: personal.gdc_habitacional
      columns:
        CEDULA:              { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        PROGRAMA:            { target: programa }
        ESTADO:              { target: estado }
        FECHA_POSTULACION:   { target: fecha_postulacion, transform: parse_date }
        FECHA_ADJUDICACION:  { target: fecha_adjudicacion, transform: parse_date }

    REGISTRO_VOTACION:
      target: personal.registro_votacion
      conflict_on: [funcionario_id]
      columns:
        CEDULA:            { target: funcionario_id, transform: mapear_cedula_a_funcionario_id }
        CENTRO_ELECTORAL:  { target: centro_electoral }
        MESA:              { target: mesa }
        DIRECCION:         { target: direccion_centro }
```

Tras escribirlo, validar sintaxis YAML y verificar dominios contra el inventario:

```powershell
.venv\Scripts\python -c @"
import yaml, json, sys
m = yaml.safe_load(open('src/bomberos_migration/mapping.yaml', encoding='utf-8'))
inv = json.load(open('reports/2026-05-19-prod-cutover-inventario.json', encoding='utf-8'))
legacy_names = {t['tabla'].upper() for t in inv['tablas']}
declared = set()
for dom, body in m.items():
    if isinstance(body, dict) and 'tables' in body:
        declared.update(body['tables'].keys())
missing = sorted(declared - legacy_names)
print('Tablas declaradas en mapping que NO existen en legacy:', missing)
sys.exit(0 if not missing else 1)
"@
```

**Criterio de aceptación 5.4:** `mapping.yaml` válido, todas las tablas declaradas existen en el inventario (o están explícitamente marcadas `# VERIFICAR`), y el YAML compila con `yaml.safe_load`.

---

## Sección 2 — Migración por dominio en orden de FKs (5.5-5.18)

Convenciones para los 14 dominios:

1. **TDD por dominio.** Antes de tocar `migrate.py`, escribir un test en `tests/test_<dominio>.py` que:
   - Cuenta filas legacy candidatas (descartando sufijos vetados).
   - Ejecuta `migrate_<dominio>` contra una BD efímera (`pytest-postgresql` o fixture compose).
   - Verifica conteo destino, invariantes (FKs, fechas válidas) y descarte registrado.
2. **Ejecución:** `bomberos-migrate migrate --apply --only <dominio>`.
3. **Validación:** `bomberos-migrate validate --only <dominio>` (sección 3).
4. **Reporte:** se actualiza `apps/migration/reports/<run_id>-progreso.md` con conteos.

### Helpers comunes a TODOS los dominios

Antes de tocar nada, agregar a `transform.py` las funciones reutilizables (extender lo existente):

```python
# apps/migration/src/bomberos_migration/transform.py — EDIT (append)

from typing import Callable

# ---------------------------------------------------------------------------
# split_cedula — CEDULA NUMERIC(18) -> (nacionalidad CHAR(1), cedula INT)
# Maneja: "V12345678", "E-1234.567", "12345678", 12345678, "  V012345678 ", None
# ---------------------------------------------------------------------------
def split_cedula(raw) -> tuple[str, int] | None:
    """Alias público de parse_cedula con validación estricta de rangos."""
    parsed = parse_cedula(raw)
    if parsed is None:
        return None
    nac, ced = parsed
    if not (1 <= ced <= 999_999_999):
        return None
    return nac, ced


# ---------------------------------------------------------------------------
# normalize_sexo — heterogéneo en legacy ("M","F","MASCULINO","FEMENINO","1","2")
# ---------------------------------------------------------------------------
def normalize_sexo(raw) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if s in ("M", "MASCULINO", "1", "H", "HOMBRE"):
        return "M"
    if s in ("F", "FEMENINO", "2", "MUJER"):
        return "F"
    return None


# ---------------------------------------------------------------------------
# normalize_turno (ops.guardias acepta DIURNO/NOCTURNO/24H)
# ---------------------------------------------------------------------------
def normalize_turno(raw) -> str:
    s = (raw or "DIURNO").strip().upper()
    if "24" in s or "VEINTICUATRO" in s:
        return "24H"
    if s.startswith("N") or "NOCH" in s:
        return "NOCTURNO"
    return "DIURNO"


def normalize_estatus_solicitud(raw) -> str:
    s = (raw or "PENDIENTE").strip().upper()
    mapping = {
        "PENDIENTE": "PENDIENTE", "APROBADO": "APROBADO", "APROBADA": "APROBADO",
        "RECHAZADO": "RECHAZADO", "RECHAZADA": "RECHAZADO",
        "PAGADO": "PAGADO", "PAGADA": "PAGADO", "ENTREGADO": "PAGADO",
        "ANULADO": "ANULADO", "ANULADA": "ANULADO",
    }
    return mapping.get(s, "PENDIENTE")


# ---------------------------------------------------------------------------
# mapear_cedula_a_funcionario_id — closure que devuelve el lookup como callable
# Se inicializa una vez tras migrar funcionarios, se pasa al runner del dominio.
# ---------------------------------------------------------------------------
def make_funcionario_lookup(rows: list) -> Callable[[object], int | None]:
    """rows = [(nacionalidad, cedula, id), ...] traído de personal.funcionarios."""
    table = {(n, int(c)): int(fid) for (n, c, fid) in rows}

    def _lookup(raw_cedula) -> int | None:
        ced = parse_cedula(raw_cedula)
        if ced is None:
            return None
        return table.get(ced)

    return _lookup


# ---------------------------------------------------------------------------
# Filtro de tablas legacy a descartar
# ---------------------------------------------------------------------------
LEGACY_SUFFIXES_TO_SKIP = ("_VIEJA", "_OLD", "_ORIGINAL", "_BD_VIEJA",
                            "_BACKUP", "_BKP", "_TMP", "_TEMP")
LEGACY_SUBSTRINGS_TO_SKIP = ("(ORIGINAL)", "(VIEJA)", "(OLD)")


def should_skip_legacy_table(tname: str) -> bool:
    u = tname.upper()
    if any(u.endswith(s) for s in LEGACY_SUFFIXES_TO_SKIP):
        return True
    if any(s in u for s in LEGACY_SUBSTRINGS_TO_SKIP):
        return True
    return False


# ---------------------------------------------------------------------------
# Router de carnets — separa genérico vs vehículo según TIPO
# ---------------------------------------------------------------------------
TIPOS_CARNET_VEHICULO = {"VEHICULO", "VEHÍCULO", "LICENCIA_VEHICULO",
                          "CARNET_CIRCULACION", "CIRCULACION"}


def route_carnet(row: dict) -> str:
    """Devuelve 'personal.carnets_vehiculo' o 'personal.carnets' según TIPO."""
    tipo = (row.get("TIPO") or row.get("TIPO_CARNET") or "").strip().upper()
    if tipo in TIPOS_CARNET_VEHICULO or row.get("PLACA"):
        return "personal.carnets_vehiculo"
    return "personal.carnets"
```

### Bootstrap del runner: `bypass_rls` y `run_id`

Modificar `io.py` para que cada conexión del pool del destino entre con `app.bypass_rls = '1'`:

```python
# apps/migration/src/bomberos_migration/io.py — EDIT
async def target_pool(dsn: str, max_size: int = 4, bypass_rls: bool = True) -> asyncpg.Pool:
    async def _setup(cn: asyncpg.Connection) -> None:
        if bypass_rls:
            await cn.execute("SET app.bypass_rls = '1'")
            await cn.execute("SET search_path TO public, core, personal, salud, ops, "
                              "carrera, equipo, beneficios, vivienda, egresos, "
                              "documentos, org, geo, seguridad, aud")
    return await asyncpg.create_pool(
        dsn=dsn, min_size=1, max_size=max_size, setup=_setup
    )
```

Y propagar `config.pg_bypass_rls` desde `migrate.py`:

```python
# apps/migration/src/bomberos_migration/migrate.py — EDIT en run_migration
pool = await target_pool(config.target_dsn, bypass_rls=config.pg_bypass_rls)
```

### Bitácora de cada corrida

Crear `apps/migration/src/bomberos_migration/bitacora.py`:

```python
"""Persistencia de la bitácora de cada dominio migrado, por run_id."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import asyncpg


async def log_dominio(
    pool: asyncpg.Pool,
    run_id: str,
    dominio: str,
    leidos: int,
    insertados: int,
    descartados: int,
    descartes_detalle: list[str],
) -> None:
    async with pool.acquire() as cn:
        await cn.execute(
            """
            INSERT INTO aud.log_migracion
                (run_id, dominio, leidos, insertados, descartados,
                 descartes_detalle, finished_at)
            VALUES ($1, $2, $3, $4, $5, $6, now())
            """,
            run_id, dominio, leidos, insertados, descartados,
            json.dumps(descartes_detalle[:200]),
        )


def write_progreso_md(run_id: str, dominio: str, reporte: dict) -> None:
    out = Path("reports") / f"{run_id}-progreso.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    line = (f"| {datetime.now().isoformat(timespec='seconds')} "
            f"| {dominio} "
            f"| {reporte['leidos']:,} "
            f"| {reporte['insertados']:,} "
            f"| {reporte['descartados']:,} |\n")
    if not out.exists():
        out.write_text(
            "| Fecha | Dominio | Leídos | Insertados | Descartados |\n"
            "|---|---|---:|---:|---:|\n", encoding="utf-8"
        )
    with out.open("a", encoding="utf-8") as f:
        f.write(line)
```

Necesita una tabla nueva. Agregar al destino:

```sql
-- A ejecutar una sola vez en bomberos_caracas (en una migración versionada bajo sql/)
CREATE TABLE IF NOT EXISTS aud.log_migracion (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id          TEXT NOT NULL,
    dominio         TEXT NOT NULL,
    leidos          INT  NOT NULL DEFAULT 0,
    insertados      INT  NOT NULL DEFAULT 0,
    descartados     INT  NOT NULL DEFAULT 0,
    descartes_detalle JSONB,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_log_mig_run ON aud.log_migracion(run_id, dominio);
```

---

### 5.5 — Dominio `catalogos`

Catálogos primero. Sin FK externas; UPSERT por `codigo`.

**Test TDD primero** (`tests/test_catalogos.py`):

```python
import asyncio
import pyodbc
import pytest
from bomberos_migration.config import Config
from bomberos_migration.io import legacy_conn, target_pool
from bomberos_migration.runner_yaml import run_dominio


@pytest.mark.asyncio
async def test_catalogos_conteo_legacy_vs_destino():
    cfg = Config.from_env()
    pool = await target_pool(cfg.target_dsn)
    try:
        with legacy_conn(cfg.legacy_dsn) as cn:
            cur = cn.cursor()
            cur.execute("SELECT COUNT(*) FROM dbo.JERARQUIAS")  # VERIFICAR nombre
            origen = cur.fetchone()[0]
            cur.close()

        await run_dominio("catalogos", cfg, pool, dry_run=False)

        async with pool.acquire() as pg:
            destino = await pg.fetchval("SELECT count(*) FROM core.jerarquias")
        assert destino >= origen * 0.95, f"Origen {origen}, destino {destino}"
    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_catalogos_idempotente():
    """Correr dos veces no duplica."""
    cfg = Config.from_env()
    pool = await target_pool(cfg.target_dsn)
    try:
        await run_dominio("catalogos", cfg, pool, dry_run=False)
        async with pool.acquire() as pg:
            n1 = await pg.fetchval("SELECT count(*) FROM core.jerarquias")
        await run_dominio("catalogos", cfg, pool, dry_run=False)
        async with pool.acquire() as pg:
            n2 = await pg.fetchval("SELECT count(*) FROM core.jerarquias")
        assert n1 == n2
    finally:
        await pool.close()
```

**Runner declarativo** — Crear `runner_yaml.py` que ejecuta cada dominio leyendo `mapping.yaml`:

```python
# apps/migration/src/bomberos_migration/runner_yaml.py
"""Ejecuta dominios definidos en mapping.yaml de manera declarativa."""
from __future__ import annotations

import yaml
from pathlib import Path
from typing import Any

import asyncpg
from rich.console import Console
from rich.progress import Progress

from .config import Config
from .io import legacy_conn, stream_table, upsert_batch
from . import transform as T

console = Console()


def load_mapping() -> dict:
    p = Path(__file__).parent / "mapping.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8"))


_TRANSFORM_REGISTRY: dict[str, callable] = {
    "split_cedula": T.split_cedula,
    "parse_date": T.parse_date,
    "normalize_sexo": T.normalize_sexo,
    "normalize_estatus": T._normalize_estatus,
    "normalize_tipo_personal": T._normalize_tipo_personal,
    "normalize_turno": T.normalize_turno,
    "normalize_estatus_solicitud": T.normalize_estatus_solicitud,
}


def _apply_transform(name: str, value, ctx: dict) -> Any:
    fn = _TRANSFORM_REGISTRY.get(name)
    if fn is None:
        # Lookups que dependen del ctx (lookup_*)
        lookup = ctx.get(name)
        if callable(lookup):
            return lookup(value)
        raise KeyError(f"Transform '{name}' no registrada")
    return fn(value)


async def run_dominio(
    dominio: str, cfg: Config, pool: asyncpg.Pool, dry_run: bool
) -> dict:
    mapping = load_mapping()
    dom_cfg = mapping[dominio]
    ctx: dict = {}

    # Construir lookup global de funcionarios si el dominio lo requiere
    if dom_cfg.get("lookup_funcionario_by_cedula"):
        async with pool.acquire() as pg:
            rows = await pg.fetch(
                "SELECT nacionalidad, cedula, id FROM personal.funcionarios"
            )
        ctx["mapear_cedula_a_funcionario_id"] = T.make_funcionario_lookup(
            [(r["nacionalidad"], r["cedula"], r["id"]) for r in rows]
        )

    # Construir lookups de catálogos comunes
    await _populate_catalog_lookups(pool, ctx)

    reporte = {"dominio": dominio, "leidos": 0, "insertados": 0,
               "descartados": 0, "descartes_detalle": []}

    with legacy_conn(cfg.legacy_dsn) as cn:
        for legacy_table, t_cfg in dom_cfg.get("tables", {}).items():
            if T.should_skip_legacy_table(legacy_table):
                continue
            await _migrate_single_table(
                cn, pool, legacy_table, t_cfg, ctx, dry_run,
                reporte, cfg.batch_size
            )

    return reporte


async def _populate_catalog_lookups(pool: asyncpg.Pool, ctx: dict) -> None:
    """Carga en memoria todos los catálogos por codigo -> id."""
    pares = [
        ("lookup_jerarquia_by_codigo", "core.jerarquias"),
        ("lookup_cargo_by_codigo", "core.cargos"),
        ("lookup_condicion_by_codigo", "core.condiciones"),
        ("lookup_zona_by_codigo", "org.zonas"),
        ("lookup_estacion_by_codigo", "org.estaciones"),
        ("lookup_area_by_codigo", "org.areas"),
        ("lookup_dependencia_by_codigo", "org.dependencias"),
        ("lookup_division_by_codigo", "org.divisiones"),
        ("lookup_tipo_carnet_by_codigo", "core.tipos_carnet"),
        ("lookup_tipo_solicitud_by_codigo", "core.tipos_solicitud"),
        ("lookup_tipo_documento_by_codigo", "core.tipos_documento"),
        ("lookup_tipo_proteccion_by_codigo", "equipo.tipos_proteccion"),
        ("lookup_tipo_uniforme_by_codigo", "equipo.tipos_uniforme"),
        ("lookup_tipo_beneficio_by_codigo", "beneficios.tipos_beneficio"),
        ("lookup_curso_by_codigo", "carrera.cursos"),
        ("lookup_talla_by_codigo", "core.tallas"),
    ]
    async with pool.acquire() as pg:
        for key, tabla in pares:
            try:
                rows = await pg.fetch(f"SELECT codigo, id FROM {tabla}")
                tabla_dict = {str(r["codigo"]).strip().upper(): int(r["id"])
                              for r in rows}
                ctx[key] = lambda raw, _t=tabla_dict: (
                    _t.get(str(raw).strip().upper()) if raw is not None else None
                )
            except Exception:
                ctx[key] = lambda raw: None


async def _migrate_single_table(
    legacy_cn, pool, legacy_table, t_cfg, ctx, dry_run, reporte, batch_size
):
    target = t_cfg["target"]
    conflict = t_cfg.get("conflict_on", [])
    cols_map = t_cfg["columns"]
    target_cols = [c["target"] for c in cols_map.values()
                    if isinstance(c["target"], str)]

    sql = f"SELECT * FROM dbo.[{legacy_table}]"
    if "skip_if" in t_cfg:
        sql += f" WHERE NOT ({t_cfg['skip_if']})"

    batch: list[tuple] = []
    with Progress() as bar:
        task = bar.add_task(f"[cyan]{legacy_table}", total=None)
        for raw in stream_table(legacy_cn, sql):
            reporte["leidos"] += 1
            mapped = {}
            ok = True
            for src_col, spec in cols_map.items():
                value = raw.get(src_col)
                tgt = spec["target"]
                if "transform" in spec:
                    try:
                        value = _apply_transform(spec["transform"], value, ctx)
                    except Exception as e:
                        reporte["descartes_detalle"].append(
                            f"{legacy_table} col={src_col}: {type(e).__name__}: {e}"
                        )
                        ok = False
                        break
                if value is None and "default" in spec:
                    value = spec["default"]
                if isinstance(tgt, list):
                    # split_cedula devuelve (nac, ced); descomponer
                    if value is None or not isinstance(value, tuple):
                        ok = False
                        break
                    for k, v in zip(tgt, value):
                        mapped[k] = v
                else:
                    mapped[tgt] = value

            if not ok or any(mapped.get(c) is None for c in t_cfg.get("required", [])):
                reporte["descartados"] += 1
                continue

            row_tuple = tuple(mapped.get(c) for c in target_cols)
            batch.append(row_tuple)
            if len(batch) >= batch_size:
                if not dry_run:
                    inserted = await upsert_batch(
                        pool, target, target_cols, batch, conflict=conflict
                    )
                    reporte["insertados"] += inserted
                bar.update(task, advance=len(batch))
                batch.clear()

        if batch and not dry_run:
            inserted = await upsert_batch(
                pool, target, target_cols, batch, conflict=conflict
            )
            reporte["insertados"] += inserted
            bar.update(task, advance=len(batch))
```

**Ejecutar:**

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only catalogos
```

**Invariantes 5.5:**
- `SELECT count(*) FROM core.jerarquias` >= conteo legacy de `JERARQUIAS`.
- Para cada catálogo, `codigo` único (constraint del DDL ya lo valida).

---

### 5.6 — Dominio `org`

Depende de `catalogos`. Misma pauta TDD; tabla a validar: `org.estaciones`.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only org
```

**Invariante:** `SELECT count(DISTINCT codigo) FROM org.estaciones` == conteo en legacy.

---

### 5.7 — Dominio `funcionarios`

Es el corazón. Aplica el código que ya existe en `transform.py` (`funcionario_from_legacy`) y `migrate.py` (`migrate_funcionarios`). Detalles críticos:

**a) `split_cedula` exhaustivo.** Ya implementado en `parse_cedula`/`split_cedula`. Test:

```python
# tests/test_split_cedula.py
import pytest
from bomberos_migration.transform import split_cedula

@pytest.mark.parametrize("raw,expected", [
    ("V12345678",      ("V", 12345678)),
    ("v-12.345.678",   ("V", 12345678)),
    ("E1234567",       ("E", 1234567)),
    ("P9999999",       ("P", 9999999)),
    ("  12345678  ",   ("V", 12345678)),     # sin prefijo -> V por default
    (12345678,         ("V", 12345678)),
    ("V000000123",     ("V", 123)),          # quita zeros a la izquierda
    (None,             None),
    ("",               None),
    ("ABC",            None),
    ("V0",             None),                # rango inválido (debe ser >=1)
])
def test_split_cedula(raw, expected):
    assert split_cedula(raw) == expected
```

**b) Filtrar duplicados** `(nacionalidad, cedula)` previo a upsert. El UPSERT del destino tiene `ON CONFLICT (nacionalidad, cedula) DO UPDATE`, así que duplicados legacy se "fusionan" en una sola fila — pero queremos saber cuántos. Modificar `migrate_funcionarios` para detectar y reportar:

```python
# apps/migration/src/bomberos_migration/migrate.py — EDIT en migrate_funcionarios
seen_cedulas: set[tuple[str, int]] = set()
for raw in stream_table(legacy_cn, sql):
    mapped = funcionario_from_legacy(raw)
    if mapped is None:
        report.funcionarios_descartados += 1
        continue
    key = (mapped["nacionalidad"], mapped["cedula"])
    if key in seen_cedulas:
        report.descartes_detalle.append(
            f"FUNC {key}: duplicado en legacy (segunda ocurrencia ignorada)"
        )
        continue
    seen_cedulas.add(key)
    # ... resto igual
```

**c) Marcar filas problemáticas en CSV.** Agregar al final de `migrate_funcionarios`:

```python
import csv
from pathlib import Path

if report.descartes_detalle:
    out = Path("tests") / "sql" / "migration_errors.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        for d in report.descartes_detalle:
            w.writerow(["funcionarios", d])
```

**Ejecutar:**

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only funcionarios
```

**Invariantes 5.7:**
- `SELECT count(*) FROM personal.funcionarios` ≈ `SELECT COUNT(DISTINCT CEDULA) FROM dbo.FUNCIONARIOS WHERE CEDULA IS NOT NULL`.
- `SELECT count(*) FROM personal.funcionarios WHERE nacionalidad NOT IN ('V','E')` == 0.
- Sin filas con `cedula` fuera de rango (constraint del DDL lo garantiza).

---

### 5.8 — Dominio `periodos` (períodos de servicio)

Lógica especial: reconstruir desde `FECHA_INGRESO/EGRESO/REINTEGRO` + tabla `DETALLE_EGRESO`.

**Sustituir** `reconstruir_periodos_servicio` por una versión que también lea `DETALLE_EGRESO`:

```python
# apps/migration/src/bomberos_migration/transform.py — REPLACE reconstruir_periodos_servicio
def reconstruir_periodos_servicio(
    funcionario_legacy: dict,
    detalle_egresos: list[dict] | None = None,
) -> list[dict]:
    """Convierte FECHA_INGRESO/EGRESO/REINTEGRO + DETALLE_EGRESO en lista ordenada.

    Algoritmo:
      1. Punto de partida: FECHA_INGRESO (obligatoria; si NULL -> sin periodos).
      2. Si hay DETALLE_EGRESO con varias filas: emparejar cronológicamente
         (ingreso, egreso) recorriendo en orden ascendente.
      3. Si la cantidad de FECHA_REINTEGRO + FECHA_INGRESO supera los egresos,
         el último período queda abierto (fecha_egreso=NULL).
      4. tipo_egreso = MOTIVO del DETALLE_EGRESO si presente, sino 'RENUNCIA'
         por default. Si no hay egreso, tipo_egreso=NULL.
      5. numero_periodo: 1-indexed en orden cronológico.
    """
    periodos: list[dict] = []
    fi_main = parse_date(funcionario_legacy.get("FECHA_INGRESO"))
    if fi_main is None:
        return periodos

    detalle_egresos = sorted(
        [d for d in (detalle_egresos or [])
         if parse_date(d.get("FECHA_EGRESO")) is not None],
        key=lambda d: parse_date(d["FECHA_EGRESO"])
    )

    # Si NO hay detalle_egreso: usar lógica original con FECHA_EGRESO/REINTEGRO
    if not detalle_egresos:
        fe = parse_date(funcionario_legacy.get("FECHA_EGRESO"))
        fr = parse_date(funcionario_legacy.get("FECHA_REINTEGRO"))
        if fe is None:
            periodos.append({"numero_periodo": 1, "fecha_ingreso": fi_main,
                             "fecha_egreso": None, "tipo_egreso": None,
                             "motivo": None})
        else:
            periodos.append({"numero_periodo": 1, "fecha_ingreso": fi_main,
                             "fecha_egreso": fe, "tipo_egreso": "RENUNCIA",
                             "motivo": None})
            if fr and fr > fe:
                periodos.append({"numero_periodo": 2, "fecha_ingreso": fr,
                                 "fecha_egreso": None, "tipo_egreso": None,
                                 "motivo": None})
        return periodos

    # CON DETALLE_EGRESO: emparejar (ingreso_i, egreso_i)
    ingresos = [fi_main]
    for d in detalle_egresos:
        fr = parse_date(d.get("FECHA_REINTEGRO"))
        if fr is not None:
            ingresos.append(fr)
    # Fallback: si el funcionario tiene FECHA_REINTEGRO escalar y no apareció
    # en ningún detalle, también lo agregamos.
    fr_main = parse_date(funcionario_legacy.get("FECHA_REINTEGRO"))
    if fr_main is not None and fr_main not in ingresos:
        ingresos.append(fr_main)
    ingresos.sort()

    n = 0
    for i, ingreso in enumerate(ingresos):
        n += 1
        egreso_data = detalle_egresos[i] if i < len(detalle_egresos) else None
        fe = parse_date(egreso_data["FECHA_EGRESO"]) if egreso_data else None
        if fe is not None and fe < ingreso:
            # detalle desordenado -> descartar este detalle, marcar abierto
            fe = None
            egreso_data = None
        periodos.append({
            "numero_periodo": n,
            "fecha_ingreso": ingreso,
            "fecha_egreso": fe,
            "tipo_egreso": _normalize_tipo_egreso(
                egreso_data.get("MOTIVO") if egreso_data else None
            ) if fe else None,
            "motivo": (egreso_data.get("MOTIVO") if egreso_data else None),
            "resolucion": (egreso_data.get("RESOLUCION") if egreso_data else None),
        })
    return periodos


def _normalize_tipo_egreso(motivo) -> str:
    s = (motivo or "").strip().upper().replace(" ", "_")
    mapping = {
        "RENUNCIA": "RENUNCIA", "DESPIDO": "DESPIDO",
        "JUBILACION": "JUBILACION", "JUBILACIÓN": "JUBILACION",
        "EXCEDENCIA": "EXCEDENCIA", "MILITAR": "MILITAR",
        "ABANDONO": "ABANDONO", "FALLECIMIENTO": "FALLECIMIENTO",
        "FALLECIDO": "FALLECIMIENTO", "NO_RATIFICADO": "NO_RATIFICADO",
    }
    return mapping.get(s, "RENUNCIA")
```

**Migración de períodos** — Edit `migrate_funcionarios` para cargar `DETALLE_EGRESO` por cédula y pasarlo al reconstructor:

```python
# apps/migration/src/bomberos_migration/migrate.py — EDIT al final de migrate_funcionarios
# Construir indice cedula -> [detalle_egreso...] DESDE LEGACY
async def _build_detalle_egreso_index(legacy_cn) -> dict[tuple[str,int], list[dict]]:
    idx: dict[tuple[str,int], list[dict]] = {}
    for raw in stream_table(legacy_cn, """
        SELECT CEDULA, FECHA_EGRESO, FECHA_REINTEGRO, MOTIVO, RESOLUCION
        FROM dbo.DETALLE_EGRESO
        WHERE CEDULA IS NOT NULL
        ORDER BY CEDULA, FECHA_EGRESO
    """):
        ced = parse_cedula(raw["CEDULA"])
        if ced is None:
            continue
        idx.setdefault(ced, []).append(raw)
    return idx

# En migrate_funcionarios, reemplazar el bloque "Reconstruir periodos_servicio":
detalles_idx = await _build_detalle_egreso_index(legacy_cn)
if not dry_run and legacy_for_periodos:
    lookup = await _build_funcionario_lookup(pool)
    async with pool.acquire() as cn:
        for ced, raw in legacy_for_periodos:
            fid = lookup.get(ced)
            if fid is None:
                continue
            periodos = reconstruir_periodos_servicio(raw, detalles_idx.get(ced))
            for p in periodos:
                try:
                    await cn.execute(
                        """
                        INSERT INTO personal.periodos_servicio
                          (funcionario_id, numero_periodo, fecha_ingreso,
                           fecha_egreso, tipo_egreso, motivo)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (funcionario_id, numero_periodo) DO UPDATE
                          SET fecha_ingreso = EXCLUDED.fecha_ingreso,
                              fecha_egreso  = EXCLUDED.fecha_egreso,
                              tipo_egreso   = EXCLUDED.tipo_egreso,
                              motivo        = EXCLUDED.motivo
                        """,
                        fid, p["numero_periodo"], p["fecha_ingreso"],
                        p["fecha_egreso"], p["tipo_egreso"], p.get("motivo"),
                    )
                    report.periodos_servicio += 1
                except asyncpg.PostgresError as e:
                    report.descartes_detalle.append(
                        f"PERIODO func={fid} #{p['numero_periodo']}: "
                        f"{type(e).__name__}: {e}"
                    )
```

**Test TDD:**

```python
# tests/test_periodos.py
from bomberos_migration.transform import reconstruir_periodos_servicio
from datetime import date

def test_funcionario_sin_egreso():
    p = reconstruir_periodos_servicio({"FECHA_INGRESO": "2020-01-01"})
    assert p == [{"numero_periodo": 1, "fecha_ingreso": date(2020,1,1),
                  "fecha_egreso": None, "tipo_egreso": None, "motivo": None}]

def test_funcionario_con_un_ciclo_cerrado():
    p = reconstruir_periodos_servicio(
        {"FECHA_INGRESO": "2020-01-01", "FECHA_EGRESO": "2022-12-31"}
    )
    assert p[0]["fecha_egreso"] == date(2022,12,31)
    assert p[0]["tipo_egreso"] == "RENUNCIA"

def test_funcionario_con_detalle_multiple():
    raw = {"FECHA_INGRESO": "2018-01-01"}
    detalles = [
        {"FECHA_EGRESO": "2019-06-30", "FECHA_REINTEGRO": "2019-08-01",
         "MOTIVO": "RENUNCIA"},
        {"FECHA_EGRESO": "2022-03-15", "FECHA_REINTEGRO": "2022-05-01",
         "MOTIVO": "EXCEDENCIA"},
    ]
    p = reconstruir_periodos_servicio(raw, detalles)
    assert len(p) == 3
    assert p[0]["fecha_egreso"] == date(2019,6,30)
    assert p[2]["fecha_egreso"] is None  # último abierto
```

**Ejecutar:** `--only funcionarios` ya dispara la reconstrucción de períodos.

**Invariantes 5.8:**
- Cada funcionario tiene exactamente 1 período (al menos 1).
- Funcionarios con `estatus='ACTIVO'` tienen al menos un período con `fecha_egreso IS NULL`.
- No hay solapamientos (el `EXCLUDE USING gist` del DDL lo garantiza; si rompe, el error lo registra `descartes_detalle`).

---

### 5.9 — Dominio `historicos`

Aplica `mapear_cedula_a_funcionario_id` para todos: jerarquías, ubicaciones, condiciones, números de equipo.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only historicos
```

**Test TDD invariante:**

```python
# tests/test_historicos.py
@pytest.mark.asyncio
async def test_no_huerfanos_jerarquia(pool):
    async with pool.acquire() as pg:
        n = await pg.fetchval(
            "SELECT count(*) FROM personal.historico_jerarquias h "
            "LEFT JOIN personal.funcionarios f ON f.id = h.funcionario_id "
            "WHERE f.id IS NULL"
        )
    assert n == 0
```

**Invariantes 5.9:**
- 0 huérfanos en `historico_jerarquias`, `historico_ubicaciones`, `historico_condiciones`, `historico_numeros_equipo`.
- Si el origen tiene `CEDULA` que no matchea ningún funcionario, se descarta y queda en `aud.log_migracion.descartes_detalle`.

---

### 5.10 — Dominio `salud`

Filtrado de duplicados: el runner ignora automáticamente tablas con sufijo `_VIEJA/_OLD/_ORIGINAL/_BD_VIEJA` vía `should_skip_legacy_table`. Aún así, validar manualmente que solo `REPOSOS` (sin sufijo) está en el mapping.

```powershell
# Validación previa
.venv\Scripts\python -c @"
import yaml
m = yaml.safe_load(open('src/bomberos_migration/mapping.yaml', encoding='utf-8'))
salud_tablas = list(m['salud']['tables'].keys())
malos = [t for t in salud_tablas
         if any(s in t.upper() for s in ('VIEJA','OLD','ORIGINAL','BD_VIEJA'))]
assert not malos, f'Mapping incluye duplicados: {malos}'
print('OK')
"@

.venv\Scripts\bomberos-migrate migrate --apply --only salud
```

**Invariantes 5.10:**
- 0 reposos con `fecha_fin < fecha_inicio` (CHECK del DDL).
- 0 solapamientos por funcionario (EXCLUDE GIST).
- Conteo destino == conteo legacy de la **canónica** menos los descartes por `CEDULA` no resuelta.

---

### 5.11 — Dominio `carnets`

Separación genérico vs vehículo según `TIPO`. El runner usa el `router.function` declarado en `mapping.yaml`:

```python
# apps/migration/src/bomberos_migration/runner_yaml.py — EDIT
# En _migrate_single_table, antes de armar la tupla, si el dominio tiene 'router':
if "router" in dom_cfg:
    router_fn = getattr(T, dom_cfg["router"]["function"])
    target_table = router_fn(raw)
else:
    target_table = target

# Y al hacer upsert, usar target_table (no target) si se ruteó.
```

Después: migrar `HISTORICO_CARNET` con `depends_on_local: [CARNETS]` (el runner respeta el orden).

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only carnets
```

**Invariantes 5.11:**
- `SELECT count(*) FROM personal.carnets_vehiculo` > 0 si hay filas con `TIPO IN ('VEHICULO',...)` en legacy.
- `SELECT count(*) FROM personal.carnets WHERE tipo_carnet_id IS NULL` == 0.
- `SELECT count(*) FROM personal.historico_carnets WHERE carnet_id IS NULL` == 0.

---

### 5.12 — Dominio `ops`

Guardias, permisos, vacaciones, comisiones, faltas, procesos administrativos.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only ops
```

**Invariantes 5.12:**
- `ops.vacaciones`: sin solapamientos por funcionario (EXCLUDE GIST).
- `ops.guardia_funcionarios`: PK natural respetada (UNIQUE).
- 0 huérfanos en `ops.permisos.funcionario_id`.

---

### 5.13 — Dominio `carrera`

Cursos (catálogo) → cursos_realizados → evaluaciones → ascensos → reconocimientos.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only carrera
```

**Invariantes 5.13:**
- `carrera.cursos_realizados.funcionario_id` referencial.
- `carrera.ascensos.fecha` no posterior a `now()`.

---

### 5.14 — Dominio `equipo`

Respetar la cadena `inventario → asignaciones → despachos`. El YAML usa `depends_on_local` para forzar orden.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only equipo
```

**Invariantes 5.14:**
- `equipo.proteccion_asignaciones.inventario_id` referencial.
- Cada serial único en `proteccion_inventario`.
- Sin solapamientos de asignación del mismo `inventario_id` (EXCLUDE GIST).

---

### 5.15 — Dominio `beneficios`

`tipos_beneficio` (catálogo) primero, luego `ayudas`, `entregas`, `entrega_pagos`.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only beneficios
```

**Invariantes 5.15:**
- `beneficios.entregas` con UNIQUE `(funcionario_id, tipo_beneficio_id, periodo)`.
- `beneficios.ayudas.monto_aprobado <= monto_solicitado` (warning, no falla).

---

### 5.16 — Dominio `egresos`

`solicitudes_jubilacion`, `pre_jubilados`, `jubilados`, `fallecimientos`.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only egresos
```

**Invariantes 5.16:**
- `egresos.jubilados.funcionario_id` UNIQUE.
- `egresos.fallecimientos.funcionario_id` UNIQUE.
- Coherencia: si `personal.funcionarios.estatus = 'JUBILADO'`, debe existir fila en `egresos.jubilados`.

---

### 5.17 — Dominio `documentos`

Acervo personal, oficios, actas, firmas autorizadas.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only documentos
```

**Invariantes 5.17:**
- `documentos.oficios.numero` UNIQUE.
- `documentos.acervo.funcionario_id` referencial.

---

### 5.18 — Dominio `identidad_pais`

`hogares_patria`, `gdc_habitacional`, `registro_votacion`.

```powershell
.venv\Scripts\bomberos-migrate migrate --apply --only identidad_pais
```

**Invariantes 5.18:**
- `personal.registro_votacion.funcionario_id` UNIQUE (1:1).
- `personal.hogares_patria` no requiere unicidad (un funcionario puede aparecer si fue jefe de varios hogares en el tiempo, pero usual es 1).

---

## Sección 3 — Validación post-migración (5.19-5.21)

### 5.19 — Comando `bomberos-migrate validate`

Agregar al CLI:

```python
# apps/migration/src/bomberos_migration/__main__.py — EDIT
from .validate import run_validate

@cli.command()
@click.option("--only", multiple=True,
              type=click.Choice([
                  "funcionarios", "periodos", "historicos", "salud",
                  "carnets", "ops", "carrera", "equipo", "beneficios",
                  "egresos", "documentos", "identidad_pais", "catalogos",
              ]))
@click.option("--output", default=None, help="Ruta del reporte markdown")
def validate(only: tuple[str, ...], output: str | None) -> None:
    """Compara conteos legacy vs destino y verifica invariantes."""
    config = Config.from_env()
    run_validate(config, only=list(only) if only else None, output=output)
```

Y el módulo `validate.py`:

```python
# apps/migration/src/bomberos_migration/validate.py
"""Validación post-migración: conteos comparativos + invariantes."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import asyncpg
from rich.console import Console
from rich.table import Table

from .config import Config
from .io import legacy_conn, target_pool

console = Console()


@dataclass
class CheckResult:
    name: str
    status: str  # OK | WARN | ERROR
    legacy: int | None
    destino: int | None
    detalle: str = ""


@dataclass
class ValidationReport:
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def errores(self) -> int:
        return sum(1 for c in self.checks if c.status == "ERROR")

    @property
    def warnings(self) -> int:
        return sum(1 for c in self.checks if c.status == "WARN")


# -----------------------------------------------------------------------------
# Queries de validación: cada par (legacy_sql, destino_sql, nombre, comparator)
# -----------------------------------------------------------------------------
CONTEOS_BASICOS = [
    {
        "name": "funcionarios",
        "legacy": "SELECT COUNT(DISTINCT CEDULA) FROM dbo.FUNCIONARIOS "
                  "WHERE CEDULA IS NOT NULL",
        "destino": "SELECT count(*) FROM personal.funcionarios",
        "tolerancia": 0.05,
    },
    {
        "name": "reposos",
        "legacy": "SELECT COUNT(*) FROM dbo.REPOSOS "
                  "WHERE CEDULA IS NOT NULL AND FECHA_INICIO IS NOT NULL "
                  "AND FECHA_FIN IS NOT NULL",
        "destino": "SELECT count(*) FROM salud.reposos",
        "tolerancia": 0.05,
    },
    {
        "name": "vacaciones",
        "legacy": "SELECT COUNT(*) FROM dbo.VACACIONES "
                  "WHERE CEDULA IS NOT NULL AND FECHA_INICIO IS NOT NULL",
        "destino": "SELECT count(*) FROM ops.vacaciones",
        "tolerancia": 0.05,
    },
    {
        "name": "permisos",
        "legacy": "SELECT COUNT(*) FROM dbo.PERMISOS WHERE CEDULA IS NOT NULL",
        "destino": "SELECT count(*) FROM ops.permisos",
        "tolerancia": 0.05,
    },
    {
        "name": "guardias",
        "legacy": "SELECT COUNT(*) FROM dbo.GUARDIAS",
        "destino": "SELECT count(*) FROM ops.guardias",
        "tolerancia": 0.05,
    },
    {
        "name": "historico_jerarquias",
        "legacy": "SELECT COUNT(*) FROM dbo.HISTORICO_JERARQUIA "
                  "WHERE CEDULA IS NOT NULL",
        "destino": "SELECT count(*) FROM personal.historico_jerarquias",
        "tolerancia": 0.05,
    },
    {
        "name": "historico_ubicaciones",
        "legacy": "SELECT COUNT(*) FROM dbo.HISTORICO_UBICACION_ADMINISTRATIVA "
                  "WHERE CEDULA IS NOT NULL",
        "destino": "SELECT count(*) FROM personal.historico_ubicaciones",
        "tolerancia": 0.05,
    },
    {
        "name": "ascensos",
        "legacy": "SELECT COUNT(*) FROM dbo.ASCENSOS WHERE CEDULA IS NOT NULL",
        "destino": "SELECT count(*) FROM carrera.ascensos",
        "tolerancia": 0.05,
    },
    {
        "name": "jubilados",
        "legacy": "SELECT COUNT(*) FROM dbo.JUBILADOS WHERE CEDULA IS NOT NULL",
        "destino": "SELECT count(*) FROM egresos.jubilados",
        "tolerancia": 0.02,
    },
]

# -----------------------------------------------------------------------------
# Invariantes (sólo destino): cada query debe devolver 0
# -----------------------------------------------------------------------------
INVARIANTES_DESTINO = [
    {
        "name": "FK huérfanos historico_jerarquias",
        "sql": """
            SELECT count(*) FROM personal.historico_jerarquias h
            LEFT JOIN personal.funcionarios f ON f.id = h.funcionario_id
            WHERE f.id IS NULL
        """,
    },
    {
        "name": "FK huérfanos historico_ubicaciones",
        "sql": """
            SELECT count(*) FROM personal.historico_ubicaciones h
            LEFT JOIN personal.funcionarios f ON f.id = h.funcionario_id
            WHERE f.id IS NULL
        """,
    },
    {
        "name": "FK huérfanos salud.reposos",
        "sql": """
            SELECT count(*) FROM salud.reposos r
            LEFT JOIN personal.funcionarios f ON f.id = r.funcionario_id
            WHERE f.id IS NULL
        """,
    },
    {
        "name": "FK huérfanos ops.vacaciones",
        "sql": """
            SELECT count(*) FROM ops.vacaciones v
            LEFT JOIN personal.funcionarios f ON f.id = v.funcionario_id
            WHERE f.id IS NULL
        """,
    },
    {
        "name": "Funcionarios ACTIVOS sin periodo activo",
        "sql": """
            SELECT count(*) FROM personal.funcionarios f
            WHERE f.estatus = 'ACTIVO'
              AND NOT EXISTS (
                  SELECT 1 FROM personal.periodos_servicio p
                  WHERE p.funcionario_id = f.id AND p.fecha_egreso IS NULL
              )
        """,
    },
    {
        "name": "Reposos con fechas invertidas",
        "sql": "SELECT count(*) FROM salud.reposos WHERE fecha_fin < fecha_inicio",
    },
    {
        "name": "Vacaciones con fechas invertidas",
        "sql": "SELECT count(*) FROM ops.vacaciones WHERE fecha_fin < fecha_inicio",
    },
    {
        "name": "Períodos servicio con fechas invertidas",
        "sql": """
            SELECT count(*) FROM personal.periodos_servicio
            WHERE fecha_egreso IS NOT NULL AND fecha_egreso < fecha_ingreso
        """,
    },
    {
        "name": "Funcionarios sin nacionalidad válida",
        "sql": "SELECT count(*) FROM personal.funcionarios "
               "WHERE nacionalidad NOT IN ('V','E')",
    },
    {
        "name": "Funcionarios JUBILADOS sin egresos.jubilados",
        "sql": """
            SELECT count(*) FROM personal.funcionarios f
            WHERE f.estatus = 'JUBILADO'
              AND NOT EXISTS (SELECT 1 FROM egresos.jubilados j
                              WHERE j.funcionario_id = f.id)
        """,
    },
    {
        "name": "Carnets sin tipo",
        "sql": "SELECT count(*) FROM personal.carnets WHERE tipo_carnet_id IS NULL",
    },
    {
        "name": "Historico_carnets huérfanos",
        "sql": """
            SELECT count(*) FROM personal.historico_carnets h
            LEFT JOIN personal.carnets c ON c.id = h.carnet_id
            WHERE c.id IS NULL
        """,
    },
]

# -----------------------------------------------------------------------------
# Suma de cédulas únicas (invariante de identidad)
# -----------------------------------------------------------------------------
SUM_CEDULAS_UNICAS = {
    "name": "suma cedulas unicas",
    "legacy": "SELECT COALESCE(SUM(CAST(CEDULA AS BIGINT)),0) "
              "FROM (SELECT DISTINCT CEDULA FROM dbo.FUNCIONARIOS "
              "      WHERE CEDULA IS NOT NULL) q",
    "destino": "SELECT COALESCE(SUM(cedula::bigint),0) FROM personal.funcionarios",
    "tolerancia": 0.02,
}


async def _run_destino_sql(pool: asyncpg.Pool, sql: str) -> int:
    async with pool.acquire() as cn:
        return int(await cn.fetchval(sql) or 0)


def _run_legacy_sql(legacy_cn, sql: str) -> int:
    cur = legacy_cn.cursor()
    cur.execute(sql)
    val = cur.fetchone()[0] or 0
    cur.close()
    return int(val)


async def run_validate_async(
    config: Config, only: list[str] | None, output: str | None
) -> None:
    report = ValidationReport()
    pool = await target_pool(config.target_dsn, bypass_rls=config.pg_bypass_rls)
    try:
        with legacy_conn(config.legacy_dsn) as legacy_cn:
            # 1. Conteos comparativos
            for q in CONTEOS_BASICOS + [SUM_CEDULAS_UNICAS]:
                if only and q["name"] not in only:
                    continue
                try:
                    leg = _run_legacy_sql(legacy_cn, q["legacy"])
                    dst = await _run_destino_sql(pool, q["destino"])
                    tol = q.get("tolerancia", 0.05)
                    if leg == 0:
                        status = "OK" if dst == 0 else "WARN"
                    else:
                        ratio = abs(leg - dst) / leg
                        status = "OK" if ratio <= tol else "WARN"
                    if abs(leg - dst) > max(leg * 0.20, 50):
                        status = "ERROR"
                    report.checks.append(CheckResult(
                        q["name"], status, leg, dst,
                        f"ratio={(dst/leg if leg else 0):.4f}"
                    ))
                except Exception as e:
                    report.checks.append(CheckResult(
                        q["name"], "ERROR", None, None,
                        f"{type(e).__name__}: {e}"
                    ))

            # 2. Invariantes destino (deben dar 0)
            for inv in INVARIANTES_DESTINO:
                try:
                    n = await _run_destino_sql(pool, inv["sql"])
                    status = "OK" if n == 0 else "ERROR"
                    report.checks.append(CheckResult(
                        inv["name"], status, None, n,
                        "violaciones" if n else ""
                    ))
                except Exception as e:
                    report.checks.append(CheckResult(
                        inv["name"], "ERROR", None, None,
                        f"{type(e).__name__}: {e}"
                    ))
    finally:
        await pool.close()

    _print_validation(report)
    _write_validation_md(report, output, config.run_id)


def _print_validation(r: ValidationReport) -> None:
    t = Table(title="Validación post-migración", show_lines=False)
    t.add_column("Check", style="cyan", overflow="fold")
    t.add_column("Estado", justify="center")
    t.add_column("Legacy", justify="right")
    t.add_column("Destino", justify="right")
    t.add_column("Detalle", overflow="fold")
    for c in r.checks:
        color = {"OK":"green","WARN":"yellow","ERROR":"red"}[c.status]
        t.add_row(c.name, f"[{color}]{c.status}[/]",
                  f"{c.legacy:,}" if c.legacy is not None else "-",
                  f"{c.destino:,}" if c.destino is not None else "-",
                  c.detalle)
    console.print(t)
    console.print(f"\n[bold]Errores: {r.errores} · Warnings: {r.warnings}[/]")


def _write_validation_md(r: ValidationReport, output: str | None, run_id: str) -> None:
    out = Path(output) if output else (
        Path("reports") / f"{datetime.now():%Y-%m-%d}-validation.md"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"# Reporte de validación — {datetime.now():%Y-%m-%d %H:%M}",
        f"\n**Run ID:** `{run_id}`\n",
        f"**Total checks:** {len(r.checks)}",
        f"**Errores:** {r.errores} · **Warnings:** {r.warnings} · "
        f"**OK:** {len(r.checks) - r.errores - r.warnings}\n",
        "| Check | Estado | Legacy | Destino | Detalle |",
        "|---|:---:|---:|---:|---|",
    ]
    for c in r.checks:
        leg = f"{c.legacy:,}" if c.legacy is not None else "-"
        dst = f"{c.destino:,}" if c.destino is not None else "-"
        lines.append(f"| {c.name} | **{c.status}** | {leg} | {dst} | {c.detalle} |")
    out.write_text("\n".join(lines), encoding="utf-8")
    console.print(f"[green]Reporte escrito en {out}[/]")


def run_validate(config: Config, only: list[str] | None, output: str | None) -> None:
    asyncio.run(run_validate_async(config, only=only, output=output))
```

**SQL exacto adicional — queries de auditoría manuales para investigar discrepancias.** Guardar como `apps/migration/sql/validate_discrepancias.sql`:

```sql
-- =========================================================================
-- 1. Cédulas presentes en legacy pero faltantes en destino (los descartes)
-- =========================================================================
-- Ejecutar EN LEGACY:
WITH cedulas_destino AS (
    SELECT nacionalidad + RIGHT('000000000' + CAST(cedula AS VARCHAR(9)), 9) AS ced
    FROM OPENQUERY([POSTGRES_LINK], 'SELECT nacionalidad, cedula FROM personal.funcionarios')
)
SELECT CEDULA, APELLIDOS, NOMBRES, ESTATUS
FROM dbo.FUNCIONARIOS
WHERE CEDULA IS NOT NULL
  AND CEDULA NOT IN (SELECT ced FROM cedulas_destino);

-- =========================================================================
-- 2. Suma defensiva (¿se perdió un dígito por casteo?)
-- =========================================================================
-- Ejecutar EN DESTINO:
SELECT SUM(cedula::bigint) AS suma_destino,
       COUNT(*) AS n_destino,
       MIN(cedula) AS min_ced,
       MAX(cedula) AS max_ced
FROM personal.funcionarios;

-- =========================================================================
-- 3. Funcionarios activos sin período activo (debe ser 0)
-- =========================================================================
SELECT f.id, f.nacionalidad, f.cedula, f.apellidos, f.nombres, f.estatus
FROM personal.funcionarios f
WHERE f.estatus = 'ACTIVO'
  AND NOT EXISTS (
      SELECT 1 FROM personal.periodos_servicio p
      WHERE p.funcionario_id = f.id AND p.fecha_egreso IS NULL
  )
LIMIT 100;

-- =========================================================================
-- 4. Solapamientos detectados (deberían ser 0; el EXCLUDE GIST los previene)
-- =========================================================================
SELECT a.funcionario_id, a.id AS reposo_a, b.id AS reposo_b,
       a.fecha_inicio, a.fecha_fin, b.fecha_inicio, b.fecha_fin
FROM salud.reposos a
JOIN salud.reposos b ON a.funcionario_id = b.funcionario_id AND a.id < b.id
WHERE daterange(a.fecha_inicio, a.fecha_fin, '[]') &&
      daterange(b.fecha_inicio, b.fecha_fin, '[]');

-- =========================================================================
-- 5. Cobertura: % de funcionarios con períodos, salud, equipos asignados
-- =========================================================================
SELECT
    (SELECT count(*) FROM personal.funcionarios) AS total_func,
    (SELECT count(DISTINCT funcionario_id) FROM personal.periodos_servicio)
        AS con_periodos,
    (SELECT count(DISTINCT funcionario_id) FROM salud.reposos)
        AS con_reposos,
    (SELECT count(DISTINCT funcionario_id) FROM ops.vacaciones)
        AS con_vacaciones,
    (SELECT count(DISTINCT funcionario_id) FROM personal.historico_jerarquias)
        AS con_jerarquia_historica;

-- =========================================================================
-- 6. Top 10 funcionarios con MAYOR diferencia legacy vs nuevo (manual deep-dive)
-- =========================================================================
-- Útil para 5.21
SELECT f.id, f.nacionalidad, f.cedula,
       f.apellidos || ', ' || f.nombres AS nombre,
       (SELECT count(*) FROM personal.periodos_servicio p
        WHERE p.funcionario_id = f.id) AS periodos,
       (SELECT count(*) FROM salud.reposos r
        WHERE r.funcionario_id = f.id) AS reposos,
       (SELECT count(*) FROM ops.vacaciones v
        WHERE v.funcionario_id = f.id) AS vacaciones,
       (SELECT count(*) FROM personal.historico_jerarquias h
        WHERE h.funcionario_id = f.id) AS jerarquias_hist
FROM personal.funcionarios f
ORDER BY random()
LIMIT 10;
```

**Ejecutar:**

```powershell
.venv\Scripts\bomberos-migrate validate
```

---

### 5.20 — Reporte markdown auto-generado

Ya cubierto por `_write_validation_md`. Convención de ruta:

```
apps/migration/reports/<YYYY-MM-DD>-validation.md
apps/migration/reports/<run_id>-progreso.md
apps/migration/reports/<run_id>-analyze.txt
apps/migration/reports/<run_id>-inventario.json
apps/migration/reports/<run_id>-descartadas.md
```

**Plantilla esperada del MD final** (la genera el código, pero confirmar este aspecto):

```markdown
# Reporte de validación — 2026-05-19 18:22

**Run ID:** `2026-05-19-prod-cutover`

**Total checks:** 22
**Errores:** 0 · **Warnings:** 1 · **OK:** 21

| Check | Estado | Legacy | Destino | Detalle |
|---|:---:|---:|---:|---|
| funcionarios | **OK** | 4,512 | 4,498 | ratio=0.9969 |
| reposos | **OK** | 18,033 | 17,894 | ratio=0.9923 |
| ...
```

**Criterio de aceptación 5.20:** el archivo existe en `reports/`, hay 0 errores antes de cutover, los warnings están justificados en el documento.

---

### 5.21 — Test manual: 5 funcionarios al azar

Ejecutar en destino:

```sql
-- Seleccionar 5 funcionarios aleatorios con datos ricos
SELECT id, nacionalidad, cedula, apellidos || ', ' || nombres AS nombre
FROM personal.funcionarios
WHERE estatus IN ('ACTIVO','JUBILADO')
  AND EXISTS (SELECT 1 FROM personal.historico_jerarquias h
              WHERE h.funcionario_id = personal.funcionarios.id)
ORDER BY random()
LIMIT 5;
```

Para CADA uno, comparar manualmente:

1. Datos personales (`personal.funcionarios` vs form `dbo.FUNCIONARIOS`).
2. Períodos de servicio (sumarizar todos los ciclos y comparar con `FECHA_INGRESO/EGRESO/REINTEGRO` + `DETALLE_EGRESO`).
3. Histórico de jerarquías (todas las filas).
4. Histórico de ubicaciones.
5. Reposos (10 últimos).
6. Vacaciones (5 últimas).
7. Carnets activos.
8. Equipos asignados.

Documentar en `apps/migration/reports/<run_id>-manual-validation.md` con tabla:

```markdown
# Validación manual — 5 funcionarios al azar

## Funcionario 1: V-12345678 — APELLIDO, NOMBRE

| Aspecto | Legacy | Destino | Match |
|---|---|---|:---:|
| Datos personales | (snapshot) | (snapshot) | ✓ |
| Períodos servicio | 2 ciclos | 2 ciclos | ✓ |
| Histórico jerarquías | 5 filas | 5 filas | ✓ |
| Reposos (10 últimos) | ... | ... | ✓ |

**Verificado por:** <nombre> · **Fecha:** 2026-05-19
```

**Criterio de aceptación 5.21:** 5 funcionarios firmados, sin discrepancias inexplicables.

---

## Sección 4 — Cutover (5.22-5.24)

### 5.22 — `docs/CUTOVER_RUNBOOK.md` (escribir completo)

Crear el archivo con este contenido literal:

```markdown
# Runbook de Cutover — Migración Legacy → bomberos_caracas

**Objetivo:** apagar el sistema legacy, ejecutar la migración delta final,
encender el sistema nuevo, con ventana de mantenimiento de 4 horas y plan B
de rollback. **NO** improvisar — seguir paso a paso.

> ⚠️ Pre-condición: este runbook fue ensayado en staging (paso 5.23) sin errores.

## Roles

- **Coordinador de cutover (CC):** decide go/no-go y ejecuta comandos.
- **Custodio de datos legacy (CDL):** apaga la app legacy y pone SQL Server en read-only.
- **DBA destino (DBA):** monitorea Postgres durante la migración.
- **QA:** ejecuta el smoke test post-cutover.

## Ventana

- **Fecha planeada:** _________  · **Hora inicio:** _________
- **Duración estimada:** 4 horas (2h migración delta + 1h validación + 1h smoke)
- **Comunicación previa:** 72h antes a usuarios finales por correo + cartelera.

## Pre-cutover (T-24h)

- [ ] T-24h · CC: ensayar el runbook en staging (paso 5.23) y firmar.
- [ ] T-24h · DBA: dump pre-cutover del destino:
  ```bash
  pg_dump -Fc -d bomberos_caracas -f /backups/precutover_$(date +%F).dump
  ```
- [ ] T-24h · CDL: confirmar dump fresco del legacy disponible (`.bak`).
- [ ] T-12h · CC: corre `bomberos-migrate validate` contra entorno productivo
      destino y archiva el reporte como baseline (debe estar ya cargado con
      el dump del paso 5.5-5.18).
- [ ] T-2h · CC: notificar a usuarios "mantenimiento programado, sistema legacy
      será read-only en 2 horas".

## Ventana de cutover

### Paso 1 — Congelar legacy (T+0:00, 5 min)

- [ ] CDL: apagar la app VB en todas las estaciones.
- [ ] CDL: poner la BD legacy en read-only:
  ```sql
  USE master;
  ALTER DATABASE PERSONALINTEGRADA SET READ_ONLY WITH ROLLBACK IMMEDIATE;
  ```
- [ ] CDL: verificar:
  ```sql
  SELECT name, is_read_only FROM sys.databases WHERE name='PERSONALINTEGRADA';
  -- debe devolver is_read_only = 1
  ```

### Paso 2 — Delta de migración (T+0:05, 60-120 min)

- [ ] CC: confirmar `.env` apunta al SQL Server productivo (no al staging).
- [ ] CC: correr migración delta:
  ```powershell
  cd apps\migration
  $env:MIGRATION_RUN_ID = "cutover-$(Get-Date -Format yyyy-MM-dd-HHmm)"
  .venv\Scripts\bomberos-migrate migrate --apply 2>&1 | `
      Tee-Object "reports\$env:MIGRATION_RUN_ID-cutover.log"
  ```
- [ ] DBA: monitorear con:
  ```sql
  SELECT pid, query_start, now()-query_start AS dur, state, query
  FROM pg_stat_activity
  WHERE usename = 'migrator' AND state != 'idle'
  ORDER BY query_start;
  ```
- [ ] Si tarda >2h: parar, escalar, decidir rollback.

### Paso 3 — Validación final (T+1:30, 30 min)

- [ ] CC: ejecutar:
  ```powershell
  .venv\Scripts\bomberos-migrate validate `
      --output "reports\$env:MIGRATION_RUN_ID-validation.md"
  ```
- [ ] CC: revisar el MD. Criterio go: 0 errores y warnings justificados.
- [ ] QA: ejecutar smoke test del backend (lista de 10 endpoints críticos —
      ver `docs/SMOKE_TESTS.md`).

### Paso 4 — Switch DNS / config (T+2:00, 10 min)

- [ ] DBA: revocar el rol `migrator` (defensa en profundidad):
  ```sql
  REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
      core, personal, salud, ops, carrera, equipo, beneficios, vivienda,
      egresos, documentos FROM migrator;
  ALTER ROLE migrator NOLOGIN;
  ```
- [ ] CC: switch DNS / config de la app nueva al productivo:
  ```bash
  # ejemplo k8s
  kubectl set env deployment/api DATABASE_URL=postgresql://api:...@pg-prod:5432/bomberos_caracas
  kubectl rollout restart deployment/api
  ```
- [ ] CC: validar healthcheck:
  ```bash
  curl -fsS https://api.bomberos.gob.ve/health | jq .
  ```

### Paso 5 — Smoke test productivo (T+2:15, 30 min)

- [ ] QA: login con usuario admin, listar funcionarios, abrir 3 expedientes
      al azar, registrar 1 reposo de prueba (luego eliminar), verificar
      RLS activo (usuario operador NO ve datos fuera de su zona).
- [ ] QA: firmar checklist `docs/SMOKE_TESTS.md`.

### Paso 6 — Cerrar y publicar (T+2:45, 15 min)

- [ ] CC: notificar a usuarios "sistema nuevo operativo, legacy
      permanece read-only para consulta histórica".
- [ ] CC: anotar fin de ventana en bitácora.
- [ ] CC: tag git:
  ```bash
  git tag v0.7.0-migration-done
  git push --tags
  ```

## Plan B — Rollback (decisión de no-go o falla crítica)

Trigger: errores críticos en validación, smoke test falla, datos corruptos.

- [ ] CC: declarar rollback en voz alta y por chat.
- [ ] CDL: volver legacy a read-write:
  ```sql
  ALTER DATABASE PERSONALINTEGRADA SET READ_WRITE WITH ROLLBACK IMMEDIATE;
  ```
- [ ] DBA: restaurar destino al snapshot pre-cutover:
  ```bash
  dropdb bomberos_caracas
  createdb bomberos_caracas
  pg_restore -d bomberos_caracas /backups/precutover_<fecha>.dump
  ```
- [ ] CC: re-encender la app VB en estaciones (CDL).
- [ ] CC: notificar "cutover pospuesto, sistema legacy restaurado".
- [ ] Post-mortem en 48h con el equipo.

## Anexo A — Comandos de emergencia

```sql
-- Cancelar consultas largas del migrator
SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE usename = 'migrator' AND state = 'active'
  AND now() - query_start > interval '30 minutes';

-- Forzar terminación
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'migrator';

-- Tamaño del destino tras migración (sanity check)
SELECT schemaname,
       SUM(pg_total_relation_size(schemaname||'.'||tablename)) / 1024 / 1024 AS mb
FROM pg_tables
WHERE schemaname IN ('personal','salud','ops','carrera','equipo','beneficios',
                     'egresos','documentos')
GROUP BY schemaname
ORDER BY mb DESC;
```

## Firma del runbook ensayado

| Rol | Nombre | Firma | Fecha |
|---|---|---|---|
| CC | | | |
| CDL | | | |
| DBA | | | |
| QA | | | |
```

**Criterio de aceptación 5.22:** el archivo existe, todos los comandos son ejecutables, el plan B está completo.

---

### 5.23 — Ensayo en staging

Procedimiento:

1. Levantar dos BDs locales independientes:
   ```powershell
   # SQL Server staging (puede ser el dump original ya restaurado)
   sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT @@VERSION"

   # Postgres staging (en docker compose dedicado)
   docker compose -f docker-compose.staging.yml up -d
   psql -h localhost -p 5433 -U postgres -d bomberos_caracas_staging `
        -f sql\99_run_all.sql
   ```

2. Apuntar `.env` a ambos staging:
   ```env
   LEGACY_DSN=...SERVER=localhost\SQLEXPRESS;DATABASE=PERSONALINTEGRADA;...
   TARGET_DSN=postgresql://migrator:migrator_pw@localhost:5433/bomberos_caracas_staging
   MIGRATION_RUN_ID=staging-ensayo-2026-05-19
   ```

3. Ejecutar el runbook completo cronometrado. Anotar tiempos reales en
   `apps/migration/reports/<run_id>-ensayo-timings.md`.

4. Validar que el rollback funciona. Crear el dump pre-cutover, correr la
   migración, simular falla, restaurar — debe quedar idéntico al dump.

**Criterio de aceptación 5.23:** ensayo completo sin asistencia externa,
tiempos documentados, rollback probado.

---

### 5.24 — Validar que el RLS no rompe la migración

**Pre-flight test** — agregar a `tests/test_rls.py`:

```python
import pytest
import asyncpg
from bomberos_migration.config import Config
from bomberos_migration.io import target_pool


@pytest.mark.asyncio
async def test_migrator_puede_insertar_con_bypass_rls():
    cfg = Config.from_env()
    pool = await target_pool(cfg.target_dsn, bypass_rls=True)
    try:
        async with pool.acquire() as cn:
            # Confirmar que el GUC está seteado
            v = await cn.fetchval("SELECT current_setting('app.bypass_rls', true)")
            assert v == "1", f"GUC app.bypass_rls = {v!r}, esperaba '1'"

            # Confirmar que el rol tiene BYPASSRLS o que la política lo respeta
            row = await cn.fetchrow(
                "SELECT rolname, rolbypassrls FROM pg_roles "
                "WHERE rolname = current_user"
            )
            assert row["rolbypassrls"] is True, (
                f"Rol {row['rolname']} sin BYPASSRLS; "
                "migración fallará con RLS activo"
            )
    finally:
        await pool.close()


@pytest.mark.asyncio
async def test_insert_real_a_personal_funcionarios():
    """Inserta una fila dummy y la limpia para confirmar que RLS no bloquea."""
    cfg = Config.from_env()
    pool = await target_pool(cfg.target_dsn, bypass_rls=True)
    try:
        async with pool.acquire() as cn:
            await cn.execute("BEGIN")
            try:
                fid = await cn.fetchval(
                    """
                    INSERT INTO personal.funcionarios
                      (nacionalidad, cedula, apellidos, nombres, tipo_personal)
                    VALUES ('V', 999999998, 'TEST_RLS', 'BOTPROBE', 'BOMBERO')
                    RETURNING id
                    """
                )
                assert fid is not None
            finally:
                await cn.execute("ROLLBACK")
    finally:
        await pool.close()
```

Correr ANTES de cada cutover:

```powershell
.venv\Scripts\python -m pytest tests/test_rls.py -v
```

Si el `migrator` no tiene BYPASSRLS, hay dos opciones:

**Opción 1 (preferida):** otorgar BYPASSRLS al rol:
```sql
ALTER ROLE migrator BYPASSRLS;
```

**Opción 2:** ejecutar la migración como `postgres` (superuser) — sólo si la
política interna no permite BYPASSRLS para roles aplicativos.

**Verificar que la política respeta `app.bypass_rls = '1'`.** Las políticas
del esquema destino (sprint 1-2) deben tener esta forma para que el GUC
sirva de escape hatch:

```sql
-- Ejemplo en una política RLS existente (verificar todas con \d+):
CREATE POLICY funcionarios_read_zona ON personal.funcionarios
    FOR SELECT
    USING (
        current_setting('app.bypass_rls', true) = '1'
        OR zona_id = current_setting('app.user_zona_id', true)::smallint
    );
```

Si alguna política NO tiene la rama `current_setting('app.bypass_rls', true) = '1'`,
agregar antes del cutover. Listar todas:

```sql
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname IN ('personal','salud','ops','carrera','equipo',
                     'beneficios','vivienda','egresos','documentos')
ORDER BY schemaname, tablename, policyname;
```

**Criterio de aceptación 5.24:**
- `pytest tests/test_rls.py` pasa.
- Todas las políticas RLS de tablas migradas contienen `current_setting('app.bypass_rls', true) = '1'`.
- Una corrida de `migrate --apply --only catalogos` en staging con RLS activo finaliza sin errores.

---

## Apéndice A — Tabla de cobertura 5.1-5.24

| ID | Entregable | Sección | Estado | Comando de verificación |
|---|---|---|---|---|
| 5.1 | Acceso a BD legacy | §1 5.1 | ☐ | `sqlcmd -S <server> -Q "SELECT TOP 1 * FROM sys.tables"` |
| 5.2 | `.env` migration | §1 5.2 | ☐ | `bomberos-migrate analyze` arranca |
| 5.3 | Reporte `analyze` | §1 5.3 | ☐ | `reports/<run_id>-inventario.json` existe |
| 5.4 | `mapping.yaml` | §1 5.4 | ☐ | `yaml.safe_load` ok, cobertura validada |
| 5.5 | Catálogos | §2 5.5 | ☐ | `pytest tests/test_catalogos.py` |
| 5.6 | Organización | §2 5.6 | ☐ | `pytest tests/test_org.py` |
| 5.7 | Funcionarios + split_cedula | §2 5.7 | ☐ | `pytest tests/test_split_cedula.py tests/test_funcionarios.py` |
| 5.8 | Períodos servicio | §2 5.8 | ☐ | `pytest tests/test_periodos.py` |
| 5.9 | Históricos | §2 5.9 | ☐ | `pytest tests/test_historicos.py` |
| 5.10 | Salud (filtrar duplicados) | §2 5.10 | ☐ | `validate --only reposos` ratio>=0.95 |
| 5.11 | Carnets + carnets_vehiculo | §2 5.11 | ☐ | `validate --only carnets`, router probado |
| 5.12 | Ops | §2 5.12 | ☐ | `validate --only vacaciones,permisos,guardias` |
| 5.13 | Carrera | §2 5.13 | ☐ | `validate --only ascensos` |
| 5.14 | Equipo (inv→asig→desp) | §2 5.14 | ☐ | invariantes FK |
| 5.15 | Beneficios | §2 5.15 | ☐ | invariantes UNIQUE |
| 5.16 | Egresos | §2 5.16 | ☐ | `validate --only jubilados` |
| 5.17 | Documentos | §2 5.17 | ☐ | invariantes UNIQUE numero |
| 5.18 | Identidad país | §2 5.18 | ☐ | conteos |
| 5.19 | `bomberos-migrate validate` | §3 5.19 | ☐ | `bomberos-migrate validate --help` |
| 5.20 | Reporte MD | §3 5.20 | ☐ | `reports/<fecha>-validation.md` |
| 5.21 | Test manual 5 funcionarios | §3 5.21 | ☐ | `reports/<run_id>-manual-validation.md` |
| 5.22 | `CUTOVER_RUNBOOK.md` | §4 5.22 | ☐ | archivo existe, ensayado |
| 5.23 | Ensayo en staging | §4 5.23 | ☐ | `reports/<run_id>-ensayo-timings.md` |
| 5.24 | RLS compatible | §4 5.24 | ☐ | `pytest tests/test_rls.py` |

---

## Notas finales

- **Idempotencia.** Todos los UPSERTs usan `ON CONFLICT DO UPDATE` por la
  clave natural (`codigo` o `(nacionalidad, cedula)` o `(funcionario_id, fecha_inicio)`).
  Re-ejecutar `migrate --apply` no duplica filas.
- **Reproducibilidad.** Cada corrida tiene `run_id` único en `aud.log_migracion`
  y archivos `reports/<run_id>-*` para reconstruir el historial completo.
- **Performance.** Lotes de 500 (configurable en `.env`). Para tablas >1M
  filas considerar `COPY` directo (`asyncpg.copy_records_to_table`) en lugar
  de `upsert_batch` con `VALUES (...)`. Optimizar SOLO si el ensayo en
  staging muestra que el delta no cabe en la ventana.
- **Encoding.** `pyodbc` ya configurado para leer `UTF-16-LE` (en `io.py`).
  Cualquier garbage encoding aparecerá en `descartes_detalle`.
- **Trazabilidad legal.** El archivo `reports/<run_id>-cutover.log` debe
  archivarse en `aud.log_migracion` (queda en BD) Y en un repositorio
  offline (pendrive cifrado) por 7 años.

**Fin del plan.**
