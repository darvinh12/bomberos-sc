# Migración legacy — Hoja de visita (1 página)

**Llevar:** laptop con `apps\migration\.venv` instalada · pendrive vacío NTFS · ODBC Driver 17 SQL Server · este papel.

## Argumento para el custodio
> “No copio la base. Solo me conecto en lectura para correr un script que cuenta filas y lista nombres de columnas. Genera un `.txt` sin datos personales. Si no se puede, pido las definiciones (`CREATE TABLE`), que no son datos.”

## Decisión en cascada (parar al primer SÍ)

```
¿Backup .bak? ──── SÍ ──→ copialo al pendrive  (Escenario A.1)
       │ NO
¿Conexión SQL Server lectura? ──── SÍ ──→ anotá DSN  (A.2)
       │ NO
¿Puedo correr `analyze` desde su red? ──── SÍ ──→ correlo  (B.1)
       │ NO
¿Me dan el DDL `CREATE TABLE`? ──── SÍ ──→ pedilo en SSMS  (B.3)
       │ NO
Anotar tablas + capturas + agendar 2da visita  (C)
```

## Comandos en sitio (Escenario B.1)

```powershell
cd C:\Users\ADMIN\bomberos-caracas-bd\apps\migration
notepad .env                        # editar LEGACY_DSN con su servidor
.venv\Scripts\bomberos-migrate analyze | Tee-Object reporte_legacy.txt
```

`analyze` **NO escribe**. Solo `SELECT` contra `sys.tables` + `SELECT TOP 0`.

## Tablas que SÍ o SÍ tenés que listar (con conteo y columnas)

🔴 `FUNCIONARIOS` · `DETALLE_EGRESO` · `HISTORICO_JERARQUIA` · `HISTORICO_UBICACION_ADMINISTRATIVA`
🟠 `REPOSOS` (la canónica, no `_VIEJA`/`_OLD`/`(ORIGINAL)`) · `VACACIONES` · `PERMISOS` · `GUARDIAS` · `ASISTENCIA_GUARDIA`
🟡 `CARNET*` · `HISTORICO_CARNET` · `EQUIPOS_PROTECCION` · `UNIFORMES` · `RADIOS` · `ASCENSOS` · `EVALUACIONES` · `CURSOS`

Las que tienen `_VIEJA / _OLD / _BACKUP / (ORIGINAL)` → solo anotá que existen, las descartamos.

## NO hacer
- ✗ Migrar nada en sitio. La migración real se hace después en tu laptop.
- ✗ Copiar BD sin permiso por escrito.
- ✗ Anotar credenciales en este papel ni en chat.

## Al volver, mandame uno de estos:
1. Ruta al `.bak`
2. DSN de conexión
3. `reporte_legacy.txt`
4. DDL `.sql`
5. Notas a mano

→ desde cualquiera de los 5 dejo `mapping.yaml` y `tables/*.py` listos para `migrate --apply`.

**Doc completo:** `docs/MIGRACION_LEGACY_INSTRUCCIONES.md`
