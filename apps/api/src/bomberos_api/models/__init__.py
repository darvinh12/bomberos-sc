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
    EstatusFuncionario,
    GrupoSanguineo,
    Idioma,
    InstitucionFormadora,
    Jerarquia,
    NivelEducativo,
    Pais,
    Parentesco,
    SeccionFuncionario,
    TenenciaVivienda,
    TipoLicencia,
    TipoNacionalizacion,
    TipoPersonal,
    TipoVivienda,
)
from bomberos_api.models.direccion import Direccion
from bomberos_api.models.egresos import Fallecimiento, Jubilado, SolicitudJubilacion
from bomberos_api.models.equipo import (
    ProteccionAsignacion,
    ProteccionInventario,
    Radio,
    RadioAsignacion,
    TipoProteccion,
)
from bomberos_api.models.expediente import (
    Actividad,
    CargaFamiliar,
    Carnet,
    Habilidad,
    HistoricoCarnet,
    HistoricoJerarquia,
    HistoricoUbicacion,
    TiempoAdmPublica,
)
from bomberos_api.models.funcionario import Funcionario, FuncionarioIdioma, PeriodoServicio
from bomberos_api.models.geografia import Estado, Municipio, Parroquia
from bomberos_api.models.ops import (
    ComisionServicio,
    Falta,
    Guardia,
    GuardiaFuncionario,
    Permiso,
    Vacaciones,
)
from bomberos_api.models.org import Area, Dependencia, Division, Estacion, Zona
from bomberos_api.models.permiso_recurso import PermisoRecurso
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
    "HCM",
    "Actividad",
    # org
    "Area",
    "Ascenso",
    # beneficios
    "Ayuda",
    # catalogos
    "Banco",
    "Base",
    # expediente
    "CargaFamiliar",
    "Cargo",
    "Carnet",
    "CentroMedico",
    "ComisionServicio",
    "Condicion",
    # carrera
    "Curso",
    "CursoRealizado",
    "Dependencia",
    # salud
    "Diagnostico",
    # personal
    "Direccion",
    "Division",
    "Entrega",
    "Especialidad",
    "Estacion",
    # geografia
    "Estado",
    "EstadoCivil",
    "EstatusFuncionario",
    "Evaluacion",
    "EvaluacionFisica",
    "Fallecimiento",
    "Falta",
    "Funcionario",
    "FuncionarioIdioma",
    "GrupoDiagnostico",
    "GrupoSanguineo",
    # ops
    "Guardia",
    "GuardiaFuncionario",
    "Habilidad",
    "HistoricoCarnet",
    "HistoricoJerarquia",
    "HistoricoUbicacion",
    "Idioma",
    "InstitucionFormadora",
    "Jerarquia",
    "Jubilado",
    "Lesion",
    "Medico",
    "Merito",
    "Municipio",
    "NivelEducativo",
    "Pais",
    "Parentesco",
    "Parroquia",
    "PeriodoEvaluacion",
    "PeriodoServicio",
    "Permiso",
    # seguridad
    "PermisoRecurso",
    "ProteccionAsignacion",
    "ProteccionInventario",
    "Radio",
    "RadioAsignacion",
    "Reconocimiento",
    "Reposo",
    "Rol",
    "SeccionFuncionario",
    # egresos
    "SolicitudJubilacion",
    "TenenciaVivienda",
    "TiempoAdmPublica",
    "TipoBeneficio",
    "TipoLicencia",
    "TipoNacionalizacion",
    "TipoPersonal",
    # equipo
    "TipoProteccion",
    "TipoVivienda",
    "Usuario",
    "UsuarioRol",
    "Vacaciones",
    "Zona",
]
