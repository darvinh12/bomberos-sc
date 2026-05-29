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
    """Detalle completo. El router puede filtrar campos según rol."""

    # Identidad
    rif: str | None = None
    fecha_nacimiento: date | None
    sexo: str | None
    estado_civil_id: int | None
    grupo_sanguineo_id: int | None
    lugar_nacimiento: str | None = None
    pais_nacimiento: str | None = None

    # Nacionalización
    tipo_nacionalizacion: str | None = None
    fecha_nacionalizacion: date | None = None
    numero_gaceta_nacionalizacion: str | None = None
    pais_origen: str | None = None
    idiomas: str | None = None

    # Empleo
    tipo_personal: str
    numero_empleado: str | None
    numero_equipo: str | None
    promocion: str | None
    condicion_id: int | None
    institucion_formadora_id: int | None = None
    fecha_egreso: date | None = None
    fecha_reintegro: date | None = None
    fecha_este: date | None = None
    fecha_ingreso_gdf: date | None = None

    # Ubicación administrativa
    area_id: int | None
    dependencia_id: int | None
    division_id: int | None
    seccion: str | None
    horario: str | None

    # Domicilio: NO se expone aquí. Se consulta vía
    # GET /funcionarios/{id}/direcciones (lista 1:N) o
    # GET /funcionarios/{id}/direccion-actual (atajo).

    # Contacto
    telefono_habitacion: str | None = None
    telefono_movil: str | None = None
    telefono_otros: str | None = None
    correo: EmailStr | None = None
    persona_contacto: str | None = None
    telefono_contacto: str | None = None
    parentesco_contacto: str | None = None

    # Educación
    nivel_educativo_id: int | None
    profesion: str | None
    especialidad_id: int | None
    iutb: bool
    egresado_unes: bool
    licencia_conducir: str | None = None
    factor_sanguineo: str | None = None

    # Misceláneos
    foto_url: str | None
    huella_url: str | None = None
    firma_url: str | None = None
    merito: float | None
    es_voluntario: bool
    observaciones: str | None = None

    # Nombres resueltos desde catálogos (rellenados por el router).
    jerarquia_nombre: str | None = None
    jerarquia_nombre_corto: str | None = None
    cargo_nombre: str | None = None
    condicion_nombre: str | None = None
    zona_nombre: str | None = None
    estacion_nombre: str | None = None
    institucion_formadora_nombre: str | None = None


class _FuncionarioBase(BaseModel):
    """Campos compartidos entre Create y Update. Todos opcionales aquí —
    los requeridos se marcan en FuncionarioCreate."""

    # Identidad
    rif: str | None = Field(default=None, max_length=20)
    fecha_nacimiento: date | None = None
    sexo: str | None = Field(default=None, pattern=r"^[MF]$")
    estado_civil_id: int | None = None
    grupo_sanguineo_id: int | None = None
    lugar_nacimiento: str | None = Field(default=None, max_length=120)
    pais_nacimiento: str | None = Field(default=None, max_length=80)

    # Nacionalización
    tipo_nacionalizacion: str | None = Field(default=None, max_length=40)
    fecha_nacionalizacion: date | None = None
    numero_gaceta_nacionalizacion: str | None = Field(default=None, max_length=50)
    pais_origen: str | None = Field(default=None, max_length=80)
    idiomas: str | None = Field(default=None, max_length=200)

    # Empleo
    tipo_personal: str | None = Field(default=None, max_length=40)
    numero_empleado: str | None = Field(default=None, max_length=20)
    numero_equipo: str | None = Field(default=None, max_length=20)
    promocion: str | None = Field(default=None, max_length=60)
    estatus: str | None = None
    condicion_id: int | None = None
    jerarquia_id: int | None = None
    cargo_id: int | None = None
    institucion_formadora_id: int | None = None
    fecha_egreso: date | None = None
    fecha_reintegro: date | None = None
    fecha_este: date | None = None
    fecha_ingreso_gdf: date | None = None
    pre_jubilado: bool | None = None
    es_voluntario: bool | None = None

    # Ubicación administrativa
    zona_id: int | None = None
    estacion_id: int | None = None
    area_id: int | None = None
    dependencia_id: int | None = None
    division_id: int | None = None
    seccion: str | None = Field(default=None, max_length=1)
    horario: str | None = Field(default=None, max_length=80)

    # Domicilio: NO va en este schema. Se gestiona vía
    # POST/PATCH /funcionarios/{id}/direcciones (ver schemas/direccion.py).

    # Contacto
    telefono_habitacion: str | None = Field(default=None, max_length=30)
    telefono_movil: str | None = Field(default=None, max_length=30)
    telefono_otros: str | None = Field(default=None, max_length=30)
    correo: EmailStr | None = None
    persona_contacto: str | None = Field(default=None, max_length=120)
    telefono_contacto: str | None = Field(default=None, max_length=30)
    parentesco_contacto: str | None = Field(default=None, max_length=40)

    # Educación
    nivel_educativo_id: int | None = None
    profesion: str | None = Field(default=None, max_length=120)
    especialidad_id: int | None = None
    iutb: bool | None = None
    egresado_unes: bool | None = None
    merito: float | None = Field(default=None, ge=0, le=100)
    licencia_conducir: str | None = Field(default=None, max_length=20)
    factor_sanguineo: str | None = Field(default=None, max_length=15)

    # Observaciones
    observaciones: str | None = None


class FuncionarioCreate(_FuncionarioBase):
    """Alta de funcionario. La 1ra entrada genera automáticamente periodo_servicio #1."""

    nacionalidad: str = Field(pattern=r"^[VE]$")
    cedula: int = Field(ge=1, le=999_999_999)
    apellidos: str = Field(min_length=2, max_length=100)
    nombres: str = Field(min_length=2, max_length=100)
    fecha_primer_ingreso: date

    @field_validator("apellidos", "nombres")
    @classmethod
    def trim_and_validate(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("No puede estar vacío")
        return v


class FuncionarioUpdate(_FuncionarioBase):
    """Actualización parcial — todos los campos opcionales (incluye los de base)."""

    apellidos: str | None = Field(default=None, min_length=2, max_length=100)
    nombres: str | None = Field(default=None, min_length=2, max_length=100)
    fecha_primer_ingreso: date | None = None

    @field_validator("apellidos", "nombres")
    @classmethod
    def trim_optional(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("No puede estar vacío")
        return v
