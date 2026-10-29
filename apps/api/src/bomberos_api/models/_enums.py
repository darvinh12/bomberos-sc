"""Tipos ENUM nativos de Postgres, definidos en sql/01_base.sql.

`create_type=False`: el tipo ya existe en la BD; SQLAlchemy solo lo referencia
para emitir el cast correcto (p. ej. `::core.estatus_solicitud`) tanto en los
filtros (`WHERE col = 'X'`) como en los INSERT/UPDATE. Sin esto, el ORM mapea la
columna como VARCHAR y Postgres rechaza con:
  - filtros:  `operator does not exist: <enum> = character varying`
  - inserts:  `column "x" is of type core.<enum> but expression is of type varchar`

Los objetos ENUM se comparten entre columnas/tablas: al ser create_type=False no
emiten DDL de CREATE/DROP, así que reutilizarlos es seguro y evita duplicar la
definición en cada modelo.
"""

from sqlalchemy.dialects.postgresql import ENUM

ESTATUS_FUNCIONARIO = ENUM(
    "ACTIVO", "REPOSO", "COMISION", "PRE_JUBILADO", "JUBILADO", "EGRESADO",
    "FALLECIDO", "SUSPENDIDO", "BAJA_DESHONROSA", "PERMISO_LARGO",
    name="estatus_funcionario", schema="core", create_type=False,
)

ESTATUS_SOLICITUD = ENUM(
    "PENDIENTE", "EN_PROCESO", "APROBADO", "RECHAZADO", "ARCHIVADO", "PAGADO",
    "ENTREGADO", "ANULADO",
    name="estatus_solicitud", schema="core", create_type=False,
)

SEXO = ENUM("M", "F", name="sexo_t", schema="core", create_type=False)

TIPO_PERSONAL = ENUM(
    "BOMBERO", "BOMBERO_VOLUNTARIO", "OBRERO", "EMPLEADO", "CONTRATADO", "PASANTE",
    name="tipo_personal", schema="core", create_type=False,
)

TIPO_ACTIVIDAD = ENUM(
    "CULTURAL", "DEPORTIVA", "MUSICAL", "CIENTIFICA", "LABORAL", "ACADEMICA",
    name="tipo_actividad", schema="core", create_type=False,
)

TIPO_MOVIMIENTO_INVENTARIO = ENUM(
    "INGRESO", "EGRESO", "AJUSTE", "TRANSFERENCIA", "BAJA", "DEVOLUCION",
    name="tipo_movimiento_inventario", schema="core", create_type=False,
)
