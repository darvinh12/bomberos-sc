from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class FuncionarioListItem(BaseModel):
    """Representación liviana para listados — no expone PII sensible."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nacionalidad: str
    cedula: int
    apellidos: str
    nombres: str
    nombre_completo: str | None = None
    estatus: str
    jerarquia_id: int | None
    cargo_id: int | None
    zona_id: int | None
    estacion_id: int | None
    fecha_primer_ingreso: date | None
    pre_jubilado: bool


class FuncionarioDetail(FuncionarioListItem):
    """Detalle. Aún restringe campos sensibles según rol (ver router)."""

    fecha_nacimiento: date | None
    sexo: str | None
    estado_civil_id: int | None
    grupo_sanguineo_id: int | None
    tipo_personal: str
    numero_empleado: str | None
    numero_equipo: str | None
    promocion: str | None
    condicion_id: int | None
    area_id: int | None
    dependencia_id: int | None
    division_id: int | None
    seccion: str | None
    horario: str | None
    telefono_movil: str | None = None
    telefono_habitacion: str | None = None
    correo: EmailStr | None = None
    persona_contacto: str | None = None
    telefono_contacto: str | None = None
    nivel_educativo_id: int | None
    profesion: str | None
    especialidad_id: int | None
    iutb: bool
    egresado_unes: bool
    foto_url: str | None
    merito: float | None
    es_voluntario: bool

    # Nombres resueltos desde catálogos (rellenados por el router).
    jerarquia_nombre: str | None = None
    jerarquia_nombre_corto: str | None = None
    cargo_nombre: str | None = None
    condicion_nombre: str | None = None
    zona_nombre: str | None = None
    estacion_nombre: str | None = None


class FuncionarioCreate(BaseModel):
    """Alta de funcionario. La 1ra entrada genera automáticamente periodo_servicio #1."""

    nacionalidad: str = Field(pattern=r"^[VE]$")
    cedula: int = Field(ge=1, le=999_999_999)
    apellidos: str = Field(min_length=2, max_length=100)
    nombres: str = Field(min_length=2, max_length=100)
    fecha_nacimiento: date | None = None
    sexo: str | None = Field(default=None, pattern=r"^[MF]$")
    fecha_primer_ingreso: date
    jerarquia_id: int | None = None
    cargo_id: int | None = None
    zona_id: int | None = None
    estacion_id: int | None = None
    correo: EmailStr | None = None
    telefono_movil: str | None = None

    @field_validator("apellidos", "nombres")
    @classmethod
    def trim_and_validate(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("No puede estar vacío")
        return v


class FuncionarioUpdate(BaseModel):
    """Actualización parcial — todos los campos opcionales."""

    apellidos: str | None = Field(default=None, min_length=2, max_length=100)
    nombres: str | None = Field(default=None, min_length=2, max_length=100)
    fecha_nacimiento: date | None = None
    sexo: str | None = Field(default=None, pattern=r"^[MF]$")
    estado_civil_id: int | None = None
    grupo_sanguineo_id: int | None = None
    jerarquia_id: int | None = None
    cargo_id: int | None = None
    condicion_id: int | None = None
    zona_id: int | None = None
    estacion_id: int | None = None
    area_id: int | None = None
    dependencia_id: int | None = None
    division_id: int | None = None
    seccion: str | None = Field(default=None, max_length=1)
    horario: str | None = None
    telefono_movil: str | None = None
    telefono_habitacion: str | None = None
    correo: EmailStr | None = None
    nivel_educativo_id: int | None = None
    profesion: str | None = None
    especialidad_id: int | None = None
    foto_url: str | None = None
    observaciones: str | None = None
