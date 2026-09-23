"""Tipos ENUM de PostgreSQL ya existentes en la BD (core.*).

create_type=False: los tipos los crea sql/01_base.sql, aquí solo se
referencian. Mapear estas columnas como String rompía los filtros WHERE:
Postgres no tiene operador enum = varchar y el listado de funcionarios
devolvía 500 con el filtro por estatus.
"""
from sqlalchemy.dialects.postgresql import ENUM

ESTATUS_FUNCIONARIO = ENUM(
    "ACTIVO",
    "REPOSO",
    "COMISION",
    "PRE_JUBILADO",
    "JUBILADO",
    "EGRESADO",
    "FALLECIDO",
    "SUSPENDIDO",
    "BAJA_DESHONROSA",
    "PERMISO_LARGO",
    name="estatus_funcionario",
    schema="core",
    create_type=False,
)

ESTATUS_SOLICITUD = ENUM(
    "PENDIENTE",
    "EN_PROCESO",
    "APROBADO",
    "RECHAZADO",
    "ARCHIVADO",
    "PAGADO",
    "ENTREGADO",
    "ANULADO",
    name="estatus_solicitud",
    schema="core",
    create_type=False,
)

TIPO_PERSONAL = ENUM(
    "BOMBERO",
    "BOMBERO_VOLUNTARIO",
    "OBRERO",
    "EMPLEADO",
    "CONTRATADO",
    "PASANTE",
    name="tipo_personal",
    schema="core",
    create_type=False,
)

SEXO_T = ENUM("M", "F", name="sexo_t", schema="core", create_type=False)

TIPO_ACTIVIDAD = ENUM(
    "CULTURAL",
    "DEPORTIVA",
    "MUSICAL",
    "CIENTIFICA",
    "LABORAL",
    "ACADEMICA",
    name="tipo_actividad",
    schema="core",
    create_type=False,
)

TIPO_RECURSO_PERMISO = ENUM(
    "seccion_ficha",
    "sidebar",
    "accion_panel",
    name="tipo_recurso_permiso",
    schema="seguridad",
    create_type=False,
)

NIVEL_ACCESO_RECURSO = ENUM(
    "edit",
    "view",
    "none",
    name="nivel_acceso_recurso",
    schema="seguridad",
    create_type=False,
)
