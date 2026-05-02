# Migración legacy `PERSONALINTEGRADA` → `bomberos_caracas`

**Estado:** scaffolding. Pendiente la BD legacy (disponible Lunes).

## Estrategia

1. **Origen:** SQL Server `PERSONALINTEGRADA` (~230 tablas, encoding UTF-16).
2. **Destino:** PostgreSQL `bomberos_caracas` (15 schemas, ~85 tablas).
3. **Mapeo:** uno-a-muchos por dominio. Ver `mapping.yaml` (a generar).
4. **Estilo:** Python con `pyodbc` (lectura) y `asyncpg`/`SQLAlchemy` (escritura).
   - Lecturas en streaming (no cargar todo en memoria)
   - Inserciones en lotes de 500 con `COPY` cuando sea posible
   - Reportes detallados de filas migradas vs descartadas con razón
   - Idempotencia: re-ejecutable sin duplicar (UPSERT por cédula)

## Tablas que requieren transformación especial

- **`FUNCIONARIOS` → `personal.funcionarios`**:
  - `CEDULA NUMERIC(18)` → `cedula INT` + `nacionalidad CHAR(1)`
  - Tablas legacy `_VIEJA`, `_OLD` ignoradas

- **`FUNCIONARIOS.FECHA_INGRESO/EGRESO/REINTEGRO` + `DETALLE_EGRESO` →
  `personal.periodos_servicio`**:
  - Reconstruir todos los ciclos cronológicamente
  - Cada par (ingreso, egreso) = un período cerrado
  - Último ingreso sin egreso = período activo

- **`HISTORICO_JERARQUIA` → `personal.historico_jerarquias`**:
  - Mapear `CEDULA → funcionario_id` (lookup post-migración funcionarios)

- **`HISTORICO_UBICACION_ADMINISTRATIVA` → `personal.historico_ubicaciones`**:
  - Idem

- **Carnets**: separar en `carnets` (genérico) y `carnets_vehiculo`
  según `TIPO`. Conservar `HISTORICO_CARNET`.

- **Reposos**: filtrar tablas duplicadas (`REPOSOS`, `REPOSOS(ORIGINAL)`,
  `REPOSOS_BD_VIEJA`); usar la canónica.

- **Equipos de protección y uniformes**: respetar la cadena
  `inventario → asignaciones → despachos`.

## Pasos a ejecutar el lunes

1. Restaurar dump legacy en SQL Server local (o conectar al server original).
2. Validar conteos por tabla (script `analyze.py`).
3. Generar `mapping.yaml` con base en columnas reales encontradas.
4. Ejecutar `migrate.py --dry-run` y revisar reporte.
5. Ejecutar `migrate.py --apply` con el target en limpio.
6. Validar invariantes (counts, FKs, no-orfanos).
7. Cutover: apagar app legacy, último delta de migración, encender app nueva.

## Estructura propuesta

```
apps/migration/
  pyproject.toml
  src/
    bomberos_migration/
      __main__.py        # CLI
      config.py          # cadenas conexión
      analyze.py         # conteos + validación
      mapping.yaml       # transformaciones declarativas
      tables/            # un archivo por dominio
        funcionarios.py
        salud.py
        ops.py
        ...
      validators.py
      reports.py
  tests/
```

(Los archivos Python concretos se generan cuando esté la BD para auto-detectar
los tipos y nombres reales de columnas.)
