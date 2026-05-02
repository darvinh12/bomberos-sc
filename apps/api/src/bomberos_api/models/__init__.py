from bomberos_api.models.base import Base
from bomberos_api.models.beneficios import Ayuda, Entrega, TipoBeneficio
from bomberos_api.models.carrera import (
    Ascenso,
    Curso,
    CursoRealizado,
    Evaluacion,
    Merito,
    PeriodoEvaluacion,
    Reconocimiento,
)
from bomberos_api.models.catalogos import (
    Banco,
    Cargo,
    Condicion,
    Especialidad,
    EstadoCivil,
    GrupoSanguineo,
    Jerarquia,
    NivelEducativo,
)
from bomberos_api.models.egresos import Fallecimiento, Jubilado, SolicitudJubilacion
from bomberos_api.models.equipo import (
    ProteccionAsignacion,
    ProteccionInventario,
    Radio,
    RadioAsignacion,
    TipoProteccion,
)
from bomberos_api.models.funcionario import Funcionario, PeriodoServicio
from bomberos_api.models.ops import (
    ComisionServicio,
    Falta,
    Guardia,
    GuardiaFuncionario,
    Permiso,
    Vacaciones,
)
from bomberos_api.models.org import Area, Dependencia, Division, Estacion, Zona
from bomberos_api.models.salud import (
    HCM,
    CentroMedico,
    Diagnostico,
    EvaluacionFisica,
    GrupoDiagnostico,
    Lesion,
    Medico,
    Reposo,
)
from bomberos_api.models.usuario import Rol, Usuario, UsuarioRol

__all__ = [
    "Base",
    # personal
    "Funcionario",
    "PeriodoServicio",
    # catalogos
    "Banco",
    "Cargo",
    "Condicion",
    "Especialidad",
    "EstadoCivil",
    "GrupoSanguineo",
    "Jerarquia",
    "NivelEducativo",
    # org
    "Area",
    "Dependencia",
    "Division",
    "Estacion",
    "Zona",
    # seguridad
    "Rol",
    "Usuario",
    "UsuarioRol",
    # salud
    "Diagnostico",
    "GrupoDiagnostico",
    "Medico",
    "CentroMedico",
    "Reposo",
    "Lesion",
    "EvaluacionFisica",
    "HCM",
    # ops
    "Guardia",
    "GuardiaFuncionario",
    "Permiso",
    "Vacaciones",
    "ComisionServicio",
    "Falta",
    # carrera
    "Curso",
    "CursoRealizado",
    "PeriodoEvaluacion",
    "Evaluacion",
    "Ascenso",
    "Reconocimiento",
    "Merito",
    # equipo
    "TipoProteccion",
    "ProteccionInventario",
    "ProteccionAsignacion",
    "Radio",
    "RadioAsignacion",
    # beneficios
    "Ayuda",
    "TipoBeneficio",
    "Entrega",
    # egresos
    "SolicitudJubilacion",
    "Jubilado",
    "Fallecimiento",
]
