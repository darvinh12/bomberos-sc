-- =============================================================================
-- PERSONALINTEGRADA_DEMO — DDL de un subconjunto de la BD legacy del Cuerpo de
-- Bomberos (SQL Server). GENERADO por generar_ddl.py; no editar a mano.
-- Fuente: apps/migration/legacy_inspection_20260504_174805.json (metadatos reales).
-- Tablas: 60 (canónicas + tablas que la migración debe descartar).
-- =============================================================================
SET NOCOUNT ON;
GO

-- ZONAS: 2 columnas, 10 filas en el real — rol: CANONICA — Catálogo de zonas (10 en el real)
IF OBJECT_ID(N'dbo.[ZONAS]', N'U') IS NOT NULL DROP TABLE dbo.[ZONAS];
GO
CREATE TABLE dbo.[ZONAS] (
    [COD_ZONA] numeric(18, 0) NOT NULL,
    [ZONA] nvarchar(20) NULL,
    CONSTRAINT [PK_ZONAS] PRIMARY KEY ([COD_ZONA])
);
GO

-- ESTACIONES: 8 columnas, 29 filas en el real — rol: CANONICA — Catálogo de estaciones (29 en el real)
IF OBJECT_ID(N'dbo.[ESTACIONES]', N'U') IS NOT NULL DROP TABLE dbo.[ESTACIONES];
GO
CREATE TABLE dbo.[ESTACIONES] (
    [COD_ESTACION] numeric(18, 0) NOT NULL,
    [COD_ZONA] numeric(18, 0) NULL,
    [NOMBRE_CORTO] nvarchar(60) NULL,
    [NOMBRE_LARGO] nvarchar(100) NULL,
    [CODIGO_RADIO] nvarchar(8) NULL,
    [DIRECCION] nvarchar(250) NULL,
    [TELEFONOS] nvarchar(50) NULL,
    [FAX] nvarchar(20) NULL,
    CONSTRAINT [PK_ESTACIONES] PRIMARY KEY ([COD_ESTACION])
);
GO

-- AREAS: 2 columnas, 17 filas en el real — rol: CANONICA — Catálogo de áreas
IF OBJECT_ID(N'dbo.[AREAS]', N'U') IS NOT NULL DROP TABLE dbo.[AREAS];
GO
CREATE TABLE dbo.[AREAS] (
    [COD_AREA] numeric(18, 0) NOT NULL,
    [AREA] nvarchar(100) NULL,
    CONSTRAINT [PK_AREAS] PRIMARY KEY ([COD_AREA])
);
GO

-- DIVISIONES: 3 columnas, 191 filas en el real — rol: CANONICA — Catálogo de divisiones (cuelgan de un área)
IF OBJECT_ID(N'dbo.[DIVISIONES]', N'U') IS NOT NULL DROP TABLE dbo.[DIVISIONES];
GO
CREATE TABLE dbo.[DIVISIONES] (
    [COD_DIVISION] numeric(18, 0) NOT NULL,
    [DIVISION] nvarchar(200) NULL,
    [COD_AREA] numeric(18, 0) NULL,
    CONSTRAINT [PK_DIVISIONES] PRIMARY KEY ([COD_DIVISION])
);
GO

-- DEPENDENCIAS: 2 columnas, 76 filas en el real — rol: CANONICA — Catálogo de dependencias
IF OBJECT_ID(N'dbo.[DEPENDENCIAS]', N'U') IS NOT NULL DROP TABLE dbo.[DEPENDENCIAS];
GO
CREATE TABLE dbo.[DEPENDENCIAS] (
    [COD_DEPENDENCIA] numeric(18, 0) NOT NULL,
    [DEPENDENCIA] nvarchar(100) NULL,
    CONSTRAINT [PK_DEPENDENCIAS] PRIMARY KEY ([COD_DEPENDENCIA])
);
GO

-- AREA_DEPENDENCIA_OPERATIVA: 2 columnas, 10 filas en el real — rol: CANONICA — Catálogo área/dependencia operativa (guardias)
IF OBJECT_ID(N'dbo.[AREA_DEPENDENCIA_OPERATIVA]', N'U') IS NOT NULL DROP TABLE dbo.[AREA_DEPENDENCIA_OPERATIVA];
GO
CREATE TABLE dbo.[AREA_DEPENDENCIA_OPERATIVA] (
    [COD_AREA_DEPENDENCIA] numeric(18, 0) NOT NULL,
    [AREA_DEPENDENCIA] nvarchar(50) NULL
);
GO

-- JERARQUIAS: 2 columnas, 27 filas en el real — rol: CANONICA — Catálogo de jerarquías (27 en el real)
IF OBJECT_ID(N'dbo.[JERARQUIAS]', N'U') IS NOT NULL DROP TABLE dbo.[JERARQUIAS];
GO
CREATE TABLE dbo.[JERARQUIAS] (
    [COD_JERARQUIA] numeric(18, 0) NOT NULL,
    [JERARQUIA] nvarchar(25) NULL,
    CONSTRAINT [PK_JERARQUIAS] PRIMARY KEY ([COD_JERARQUIA])
);
GO

-- CARGOS: 2 columnas, 110 filas en el real — rol: CANONICA — Catálogo de cargos
IF OBJECT_ID(N'dbo.[CARGOS]', N'U') IS NOT NULL DROP TABLE dbo.[CARGOS];
GO
CREATE TABLE dbo.[CARGOS] (
    [COD_CARGO] numeric(18, 0) NOT NULL,
    [CARGO] nvarchar(50) NULL,
    CONSTRAINT [PK_CARGOS] PRIMARY KEY ([COD_CARGO])
);
GO

-- CONDICIONES: 2 columnas, 11 filas en el real — rol: CANONICA — Catálogo de condiciones (11 en el real)
IF OBJECT_ID(N'dbo.[CONDICIONES]', N'U') IS NOT NULL DROP TABLE dbo.[CONDICIONES];
GO
CREATE TABLE dbo.[CONDICIONES] (
    [COD_CONDICION] numeric(18, 0) NOT NULL,
    [DESCRIPCION] nvarchar(50) NULL
);
GO

-- ESTATUS: 2 columnas, 8 filas en el real — rol: CANONICA — Catálogo de estatus (8 en el real)
IF OBJECT_ID(N'dbo.[ESTATUS]', N'U') IS NOT NULL DROP TABLE dbo.[ESTATUS];
GO
CREATE TABLE dbo.[ESTATUS] (
    [COD_ESTATUS] numeric(18, 0) NOT NULL,
    [DESCRIPCION] nvarchar(50) NOT NULL
);
GO

-- BANCOS: 2 columnas, 0 filas en el real — rol: CANONICA — Catálogo de bancos (vacío en el real)
IF OBJECT_ID(N'dbo.[BANCOS]', N'U') IS NOT NULL DROP TABLE dbo.[BANCOS];
GO
CREATE TABLE dbo.[BANCOS] (
    [COD_BANCO] numeric(18, 0) NOT NULL,
    [NOMBRE] nvarchar(100) NULL,
    CONSTRAINT [PK_BANCOS] PRIMARY KEY ([COD_BANCO])
);
GO

-- TIPO_NIVEL_EDUCATIVO: 4 columnas, 6 filas en el real — rol: CANONICA — Catálogo de niveles educativos (6 en el real)
IF OBJECT_ID(N'dbo.[TIPO_NIVEL_EDUCATIVO]', N'U') IS NOT NULL DROP TABLE dbo.[TIPO_NIVEL_EDUCATIVO];
GO
CREATE TABLE dbo.[TIPO_NIVEL_EDUCATIVO] (
    [COD_NIVEL] numeric(18, 0) NOT NULL,
    [TIPO_NIVEL] nvarchar(50) NOT NULL,
    [ID_NIVEL] numeric(18, 0) NOT NULL,
    [msrepl_tran_version] uniqueidentifier NOT NULL DEFAULT (newid()),
    CONSTRAINT [PK_TIPO_NIVEL_EDUCATIVO_1] PRIMARY KEY ([COD_NIVEL])
);
GO

-- GRUPOSDIAGNOSTICOS: 2 columnas, 35 filas en el real — rol: CANONICA — Catálogo de grupos de diagnóstico
IF OBJECT_ID(N'dbo.[GRUPOSDIAGNOSTICOS]', N'U') IS NOT NULL DROP TABLE dbo.[GRUPOSDIAGNOSTICOS];
GO
CREATE TABLE dbo.[GRUPOSDIAGNOSTICOS] (
    [CodGrupoDiagnostico] numeric(18, 0) NOT NULL,
    [GrupoDiagnostico] nvarchar(30) NULL,
    CONSTRAINT [PK_GRUPOSDIAGNOSTICOS] PRIMARY KEY ([CodGrupoDiagnostico])
);
GO

-- DIAGNOSTICOS: 3 columnas, 5271 filas en el real — rol: CANONICA — Catálogo de diagnósticos
IF OBJECT_ID(N'dbo.[DIAGNOSTICOS]', N'U') IS NOT NULL DROP TABLE dbo.[DIAGNOSTICOS];
GO
CREATE TABLE dbo.[DIAGNOSTICOS] (
    [CODDIAGNOSTICO] numeric(18, 0) NOT NULL,
    [DIAGNOSTICO] nvarchar(255) NULL,
    [CodGrupoDiagnostico] float NULL,
    CONSTRAINT [PK_DIAGNOSTICOS] PRIMARY KEY ([CODDIAGNOSTICO])
);
GO

-- ESPECIALIDADES: 2 columnas, 99 filas en el real — rol: CANONICA — Catálogo de especialidades médicas
IF OBJECT_ID(N'dbo.[ESPECIALIDADES]', N'U') IS NOT NULL DROP TABLE dbo.[ESPECIALIDADES];
GO
CREATE TABLE dbo.[ESPECIALIDADES] (
    [ID_ESPE] numeric(18, 0) NOT NULL,
    [ESPECIALIDAD] nvarchar(30) NULL,
    CONSTRAINT [PK_ESPECIALIDADES] PRIMARY KEY ([ID_ESPE])
);
GO

-- MEDICO_TRATANTE: 7 columnas, 2892 filas en el real — rol: CANONICA — Catálogo de médicos tratantes
IF OBJECT_ID(N'dbo.[MEDICO_TRATANTE]', N'U') IS NOT NULL DROP TABLE dbo.[MEDICO_TRATANTE];
GO
CREATE TABLE dbo.[MEDICO_TRATANTE] (
    [ID_MEDICO] numeric(18, 0) NOT NULL,
    [CEDULA_MEDICO] numeric(18, 0) NULL,
    [TIPO_MEDICO] nvarchar(50) NULL,
    [NOMBRES] nvarchar(50) NULL,
    [APELLIDOS] nvarchar(50) NULL,
    [MSAS] nvarchar(10) NULL,
    [ID_ESPE] nchar(50) NULL,
    CONSTRAINT [PK_MEDICO_TRATANTE] PRIMARY KEY ([ID_MEDICO])
);
GO

-- CENTROS_MEDICOS: 4 columnas, 1232 filas en el real — rol: CANONICA — Catálogo de centros médicos
IF OBJECT_ID(N'dbo.[CENTROS_MEDICOS]', N'U') IS NOT NULL DROP TABLE dbo.[CENTROS_MEDICOS];
GO
CREATE TABLE dbo.[CENTROS_MEDICOS] (
    [COD_INSTITUCION] numeric(18, 0) NOT NULL,
    [INSTITUCION] nvarchar(75) NULL,
    [TIPO_CENTRO] nvarchar(7) NULL,
    [COD_IVSS] nvarchar(10) NULL,
    CONSTRAINT [PK_CENTROS_MEDICOS] PRIMARY KEY ([COD_INSTITUCION])
);
GO

-- FALTAS: 2 columnas, 1 filas en el real — rol: CANONICA — Catálogo de faltas (1 sola fila en el real; no es la fuente de faltas)
IF OBJECT_ID(N'dbo.[FALTAS]', N'U') IS NOT NULL DROP TABLE dbo.[FALTAS];
GO
CREATE TABLE dbo.[FALTAS] (
    [COD_FALTAS] numeric(18, 0) NOT NULL,
    [FALTAS] nvarchar(50) NULL
);
GO

-- CURSOS: 5 columnas, 722 filas en el real — rol: CANONICA — Catálogo de cursos
IF OBJECT_ID(N'dbo.[CURSOS]', N'U') IS NOT NULL DROP TABLE dbo.[CURSOS];
GO
CREATE TABLE dbo.[CURSOS] (
    [COD_CURSO] numeric(18, 0) NOT NULL,
    [DESCRIPCION] nvarchar(200) NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [ASCENSO] nchar(2) NULL,
    [CURSOS_VALOR] nchar(2) NULL
);
GO

-- MARCA_TALLER_RADIO: 2 columnas, 4 filas en el real — rol: CANONICA — Catálogo de marcas de radio
IF OBJECT_ID(N'dbo.[MARCA_TALLER_RADIO]', N'U') IS NOT NULL DROP TABLE dbo.[MARCA_TALLER_RADIO];
GO
CREATE TABLE dbo.[MARCA_TALLER_RADIO] (
    [COD_MARCA] numeric(18, 0) NOT NULL,
    [MARCA] nvarchar(70) NULL
);
GO

-- MODELO_TALLER_RADIO: 2 columnas, 9 filas en el real — rol: CANONICA — Catálogo de modelos de radio
IF OBJECT_ID(N'dbo.[MODELO_TALLER_RADIO]', N'U') IS NOT NULL DROP TABLE dbo.[MODELO_TALLER_RADIO];
GO
CREATE TABLE dbo.[MODELO_TALLER_RADIO] (
    [COD_MODELO] numeric(18, 0) NOT NULL,
    [MODELO] nvarchar(70) NULL
);
GO

-- EQUIPOS_TALLER_RADIO: 2 columnas, 12 filas en el real — rol: CANONICA — Catálogo de tipos de equipo de radio
IF OBJECT_ID(N'dbo.[EQUIPOS_TALLER_RADIO]', N'U') IS NOT NULL DROP TABLE dbo.[EQUIPOS_TALLER_RADIO];
GO
CREATE TABLE dbo.[EQUIPOS_TALLER_RADIO] (
    [COD_EQUIPO] numeric(18, 0) NOT NULL,
    [EQUIPO] nvarchar(50) NULL
);
GO

-- EQUIPOS_PROTECCION: 5 columnas, 6 filas en el real — rol: CANONICA — Inventario de equipos de protección
IF OBJECT_ID(N'dbo.[EQUIPOS_PROTECCION]', N'U') IS NOT NULL DROP TABLE dbo.[EQUIPOS_PROTECCION];
GO
CREATE TABLE dbo.[EQUIPOS_PROTECCION] (
    [ID] numeric(18, 0) NOT NULL,
    [EQUIPO_PROTECCION] nvarchar(100) NULL,
    [TALLA] nvarchar(5) NULL,
    [EXISTENCIA_ACTUAL] numeric(18, 0) NULL,
    [EXISTENCIA_MINIMA] numeric(18, 0) NULL,
    CONSTRAINT [PK_EQUIPOS_PROTECCION] PRIMARY KEY ([ID])
);
GO

-- UNIFORMES: 5 columnas, 76 filas en el real — rol: CANONICA — Inventario de uniformes
IF OBJECT_ID(N'dbo.[UNIFORMES]', N'U') IS NOT NULL DROP TABLE dbo.[UNIFORMES];
GO
CREATE TABLE dbo.[UNIFORMES] (
    [ID] numeric(18, 0) NOT NULL,
    [UNIFORME] nvarchar(100) NULL,
    [TALLA] nvarchar(5) NULL,
    [EXISTENCIA_ACTUAL] numeric(18, 0) NULL,
    [EXISTENCIA_MINIMA] numeric(18, 0) NULL
);
GO

-- FUNCIONARIOS: 34 columnas, 5726 filas en el real — rol: CANONICA — Expedientes activos
IF OBJECT_ID(N'dbo.[FUNCIONARIOS]', N'U') IS NOT NULL DROP TABLE dbo.[FUNCIONARIOS];
GO
CREATE TABLE dbo.[FUNCIONARIOS] (
    [CEDULA] numeric(18, 0) NOT NULL,
    [NACIONALIDAD] nvarchar(1) NULL,
    [RIF] nvarchar(50) NULL,
    [APELLIDOS] nvarchar(50) NULL,
    [NOMBRES] nvarchar(50) NULL,
    [FECHA_INGRESO] datetime NULL,
    [FECHA_ESTE] datetime NULL,
    [FECHA_INGRESOGDF] datetime NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [SECCION] nvarchar(1) NULL,
    [COD_CARGO] numeric(18, 0) NULL,
    [N_EQUIPO] nvarchar(30) NULL,
    [N_EMPLEADO] nvarchar(9) NULL,
    [CONDICION] nvarchar(50) NULL,
    [ESTATUS] nvarchar(30) NULL,
    [HORARIO] nvarchar(30) NULL,
    [SEXO] nvarchar(20) NULL,
    [FECHA_NACIMIENTO] datetime NULL,
    [ESTADO_CIVIL] nvarchar(25) NULL,
    [GRUPO_SANGUINEO] nvarchar(2) NULL,
    [FACTOR_SANGUINEO] nvarchar(15) NULL,
    [CORREO_ELECTRONICO] nvarchar(50) NULL,
    [NIVEL_EDUCATIVO] int NULL,
    [PROMOCION] nvarchar(5) NULL,
    [FECHA_EGRESO] datetime NULL,
    [FECHA_REINTEGRO] datetime NULL,
    [TELEFONO_HABITACION] nvarchar(100) NULL,
    [TELEFONO_MOBIL] nvarchar(100) NULL,
    [TELEFONO_OTROS] nvarchar(100) NULL,
    [PERSONA_CONTACTO] nvarchar(100) NULL,
    [LICENCIA] nvarchar(10) NULL,
    [COD_UBICACION] numeric(18, 0) NULL,
    [FECHA_ACTUALIZACION] datetime NULL,
    [PRE_JUBILADOS] nchar(2) NULL,
    CONSTRAINT [PK_FUNCIONARIOS] PRIMARY KEY ([CEDULA])
);
GO

-- FUNCIONARIOS_EGRESADOS: 36 columnas, 3285 filas en el real — rol: CANONICA — Expedientes egresados (UNION con FUNCIONARIOS)
IF OBJECT_ID(N'dbo.[FUNCIONARIOS_EGRESADOS]', N'U') IS NOT NULL DROP TABLE dbo.[FUNCIONARIOS_EGRESADOS];
GO
CREATE TABLE dbo.[FUNCIONARIOS_EGRESADOS] (
    [CEDULA] numeric(18, 0) NOT NULL,
    [NACIONALIDAD] nvarchar(1) NULL,
    [RIF] nvarchar(50) NULL,
    [APELLIDOS] nvarchar(50) NULL,
    [NOMBRES] nvarchar(50) NULL,
    [FECHA_INGRESO] datetime NULL,
    [FECHA_ESTE] datetime NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [SECCION] nvarchar(1) NULL,
    [COD_CARGO] numeric(18, 0) NULL,
    [N_EQUIPO] nvarchar(30) NULL,
    [N_EMPLEADO] nvarchar(9) NULL,
    [CONDICION] nvarchar(50) NULL,
    [ESTATUS] nvarchar(30) NULL,
    [HORARIO] nvarchar(30) NULL,
    [SEXO] nvarchar(20) NULL,
    [FECHA_NACIMIENTO] datetime NULL,
    [ESTADO_CIVIL] nvarchar(25) NULL,
    [GRUPO_SANGUINEO] nvarchar(2) NULL,
    [FACTOR_SANGUINEO] nvarchar(15) NULL,
    [CORREO_ELECTRONICO] nvarchar(50) NULL,
    [NIVEL_EDUCATIVO] int NULL,
    [PROMOCION] nvarchar(5) NULL,
    [FECHA_EGRESO] datetime NULL,
    [FECHA_REINTEGRO] datetime NULL,
    [TELEFONO_HABITACION] nvarchar(100) NULL,
    [TELEFONO_MOBIL] nvarchar(100) NULL,
    [TELEFONO_OTROS] nvarchar(100) NULL,
    [PERSONA_CONTACTO] nvarchar(100) NULL,
    [LICENCIA] nvarchar(10) NULL,
    [COD_UBICACION] numeric(18, 0) NULL,
    [FECHA_ACTUALIZACION] datetime NULL,
    [FECHA_TRANSACCION] datetime NULL,
    [USUARIO] nvarchar(30) NULL,
    [TRANSACCION] nvarchar(30) NULL,
    [ESTATUS_ANTERIOR] nvarchar(30) NULL,
    CONSTRAINT [PK_FUNCIONARIOS_EGRESADOS] PRIMARY KEY ([CEDULA])
);
GO

-- DETALLE_EGRESO: 6 columnas, 605 filas en el real — rol: CANONICA — Detalle de cada egreso
IF OBJECT_ID(N'dbo.[DETALLE_EGRESO]', N'U') IS NOT NULL DROP TABLE dbo.[DETALLE_EGRESO];
GO
CREATE TABLE dbo.[DETALLE_EGRESO] (
    [ID_EGRESO] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NOT NULL,
    [FECHA_EGRESO_NOTIF] datetime NULL,
    [FECHA_EGRESO_NOMI] datetime NULL,
    [BASAMENTO_LEGAL] nvarchar(450) NULL,
    [OBSERVACIONES] nvarchar(450) NULL,
    CONSTRAINT [PK_DETALLE_EGRESO] PRIMARY KEY ([ID_EGRESO])
);
GO

-- UBICACION_ADMINISTRATIVA: 14 columnas, 5522 filas en el real — rol: CANONICA — Ubicación vigente por expediente
IF OBJECT_ID(N'dbo.[UBICACION_ADMINISTRATIVA]', N'U') IS NOT NULL DROP TABLE dbo.[UBICACION_ADMINISTRATIVA];
GO
CREATE TABLE dbo.[UBICACION_ADMINISTRATIVA] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [COD_ZONA] numeric(18, 0) NULL,
    [COD_AREA] numeric(18, 0) NULL,
    [COD_ESTACION] numeric(18, 0) NULL,
    [COD_DIVISION] numeric(18, 0) NULL,
    [AGRUPACION] nvarchar(100) NULL,
    [DEPENDENCIA] nvarchar(max) NULL,
    [HORARIO] nvarchar(30) NULL,
    [SECCION] nvarchar(5) NULL,
    [TELEFONO_OFICINA] nvarchar(50) NULL,
    [EXTENSION] nvarchar(4) NULL,
    [JEFE_INMEDIATO] nvarchar(80) NULL,
    [FECHA_DESDE] datetime NULL,
    CONSTRAINT [PK_UBICACION_ADMINISTRATIVA] PRIMARY KEY ([ID])
);
GO

-- HISTORICO_UBICACION_ADMINISTRATIVA: 10 columnas, 26341 filas en el real — rol: CANONICA — Histórico de ubicaciones
IF OBJECT_ID(N'dbo.[HISTORICO_UBICACION_ADMINISTRATIVA]', N'U') IS NOT NULL DROP TABLE dbo.[HISTORICO_UBICACION_ADMINISTRATIVA];
GO
CREATE TABLE dbo.[HISTORICO_UBICACION_ADMINISTRATIVA] (
    [ID_UBIADM] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [COD_ESTACION] numeric(18, 0) NULL,
    [COD_ZONA] numeric(18, 0) NULL,
    [COD_AREA] numeric(18, 0) NULL,
    [COD_DIVISION] numeric(18, 0) NULL,
    [AGRUPACION] nvarchar(100) NULL,
    [FECHA_DESDE] datetime NULL,
    [SECCION] nvarchar(1) NULL,
    [HORARIO] nvarchar(30) NULL,
    CONSTRAINT [PK_HISTORICO_UBICACION_ADMINISTRATIVA] PRIMARY KEY ([ID_UBIADM])
);
GO

-- HISTORICO_JERARQUIA: 11 columnas, 30792 filas en el real — rol: CANONICA — Histórico de jerarquías
IF OBJECT_ID(N'dbo.[HISTORICO_JERARQUIA]', N'U') IS NOT NULL DROP TABLE dbo.[HISTORICO_JERARQUIA];
GO
CREATE TABLE dbo.[HISTORICO_JERARQUIA] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [TIPO_DOCUMENTO] nvarchar(255) NULL,
    [NUMERO_DOCUMENTO] nvarchar(255) NULL,
    [REFERENCIA] nvarchar(255) NULL,
    [FECHA] datetime NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [COD_CARGO] numeric(18, 0) NULL,
    [Jerarquia] nvarchar(255) NULL,
    [Fecha Ultimo Ascenso] datetime NULL,
    [Nivelacion] bit NULL,
    CONSTRAINT [PK_HISTORICO_JERARQUIA_REVISION] PRIMARY KEY ([ID])
);
GO

-- ASCENSOS: 5 columnas, 16234 filas en el real — rol: CANONICA — Ascensos
IF OBJECT_ID(N'dbo.[ASCENSOS]', N'U') IS NOT NULL DROP TABLE dbo.[ASCENSOS];
GO
CREATE TABLE dbo.[ASCENSOS] (
    [CEDULA] numeric(18, 0) NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [JERARQUIA] nvarchar(20) NULL,
    [FECHA_ASCENSO] datetime NULL,
    [ORDEN_GENERAL] nvarchar(25) NULL
);
GO

-- CARGA_FAMILIAR: 23 columnas, 51192 filas en el real — rol: CANONICA — Carga familiar
IF OBJECT_ID(N'dbo.[CARGA_FAMILIAR]', N'U') IS NOT NULL DROP TABLE dbo.[CARGA_FAMILIAR];
GO
CREATE TABLE dbo.[CARGA_FAMILIAR] (
    [ID] numeric(18, 0) NOT NULL,
    [COMPANIA] numeric(18, 0) NULL,
    [RAMOPOLIZA] nvarchar(50) NULL,
    [NROPOLIZA] nvarchar(50) NULL,
    [CERTIFICADO] numeric(18, 0) NULL,
    [CEDULA] numeric(18, 0) NULL,
    [NOMBRES] nvarchar(50) NULL,
    [APELLIDOS] nvarchar(50) NULL,
    [PARENTESCO] nvarchar(15) NULL,
    [EDAD] numeric(18, 0) NULL,
    [FECHA_NACIMIENTO] datetime NULL,
    [SEXO] nvarchar(20) NULL,
    [TIPO_MOVIMIENTO] nvarchar(5) NULL,
    [CONDICION] nvarchar(50) NULL,
    [TELEFONO_FUN] nvarchar(100) NULL,
    [FECHA_INGRESO] datetime NULL,
    [OBSERVACION] nvarchar(400) NULL,
    [P_M] nvarchar(255) NULL,
    [VIGENCIA] datetime NULL,
    [VIVE] nvarchar(5) NULL,
    [FECHA_ACTUALIZACION] datetime NULL,
    [ESTUDIA] nvarchar(5) NULL,
    [GRADO_INSTRUCCION] nvarchar(25) NULL,
    CONSTRAINT [PK_CARGA_FAMILIAR] PRIMARY KEY ([ID])
);
GO

-- NIVEL_EDUCATIVO: 11 columnas, 5617 filas en el real — rol: CANONICA — Estudios por expediente (no es catálogo)
IF OBJECT_ID(N'dbo.[NIVEL_EDUCATIVO]', N'U') IS NOT NULL DROP TABLE dbo.[NIVEL_EDUCATIVO];
GO
CREATE TABLE dbo.[NIVEL_EDUCATIVO] (
    [ID_NIVEL] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [NIVEL_EDUCATIVO] int NULL,
    [LICEO_UNIVERSIDAD] nvarchar(255) NULL,
    [ESPECIALIDAD] nvarchar(100) NULL,
    [FECHA] datetime NULL,
    [FECHA_RECEPCION] datetime NULL,
    [NUMERO_TITULO] nvarchar(50) NULL,
    [IUTB] bit NULL,
    [UNES] bit NULL,
    [OBSERVACIONES] nvarchar(400) NULL,
    CONSTRAINT [PK_TITULOS_ACADEMICOS] PRIMARY KEY ([ID_NIVEL])
);
GO

-- REPOSOS: 21 columnas, 19229 filas en el real — rol: CANONICA — Reposos médicos (la canónica)
IF OBJECT_ID(N'dbo.[REPOSOS]', N'U') IS NOT NULL DROP TABLE dbo.[REPOSOS];
GO
CREATE TABLE dbo.[REPOSOS] (
    [ID] numeric(18, 0) NOT NULL,
    [NROORDEN] numeric(18, 0) NOT NULL,
    [FECHA_RECEPCION] datetime NULL,
    [FECHA_INICIO] datetime NULL,
    [FECHA_FIN] datetime NULL,
    [CEDULA] numeric(18, 0) NULL,
    [CODDIAGNOSTICO] numeric(18, 0) NULL,
    [TIPOREPOSO] nvarchar(50) NULL,
    [ORIGEN] nvarchar(20) NULL,
    [IDMEDICO] numeric(18, 0) NULL,
    [COD_INSTITUCION] nvarchar(100) NULL,
    [ESTATUS_CONVALIDADO_IVSS] nvarchar(25) NULL,
    [CODCENTRO_IVSS] nvarchar(50) NULL,
    [FECHA_CITA] datetime NULL,
    [NROREPOSO] numeric(18, 0) NULL,
    [LUGAREXPEDICION] nvarchar(50) NULL,
    [FECHA_CONVALIDACION_IVSS] datetime NULL,
    [IDDRCONVA_IVSS] nvarchar(50) NULL,
    [VERIFICADO_INSPECTORIA] nvarchar(2) NULL,
    [RE_LABORAL] nchar(2) NULL,
    [ARCHIVADO] nvarchar(2) NULL,
    CONSTRAINT [PK_REPOSOS] PRIMARY KEY ([ID])
);
GO

-- Diagnostico_Consulta: 15 columnas, 39420 filas en el real — rol: CANONICA — Consultas médicas
IF OBJECT_ID(N'dbo.[Diagnostico_Consulta]', N'U') IS NOT NULL DROP TABLE dbo.[Diagnostico_Consulta];
GO
CREATE TABLE dbo.[Diagnostico_Consulta] (
    [QuienRecibeCI] float NULL,
    [cedula] float NULL,
    [Apellidos] nvarchar(255) NULL,
    [Nombres] nvarchar(255) NULL,
    [FechaRececion] datetime NULL,
    [FechaIncio] datetime NULL,
    [FechaFin] datetime NULL,
    [FechReintegro] datetime NULL,
    [Diagnostico] nvarchar(3000) NULL,
    [MedicoNombre] nvarchar(255) NULL,
    [Relativo] bit NULL,
    [Institucion] nvarchar(255) NULL,
    [Centro Asistencial Quien confirma] nvarchar(255) NULL,
    [Código] nvarchar(255) NULL,
    [Observacion] nvarchar(255) NULL
);
GO

-- VACACIONES: 18 columnas, 40654 filas en el real — rol: CANONICA — Vacaciones
IF OBJECT_ID(N'dbo.[VACACIONES]', N'U') IS NOT NULL DROP TABLE dbo.[VACACIONES];
GO
CREATE TABLE dbo.[VACACIONES] (
    [Id] numeric(18, 0) NOT NULL,
    [Cedula] numeric(18, 0) NULL,
    [Quinquenio] nvarchar(50) NULL,
    [Periodos] nvarchar(50) NULL,
    [FechaDesde] datetime NULL,
    [FechaHasta] datetime NULL,
    [FechaReingreso] datetime NULL,
    [DiasDisfrute] numeric(18, 0) NULL,
    [PeriodosPendientes] nvarchar(100) NULL,
    [NroMemo] nvarchar(10) NULL,
    [FechaProceso] datetime NULL,
    [FechaCalculoQuinquenio] datetime NULL,
    [Firma] nvarchar(2) NULL,
    [FechaFirma] datetime NULL,
    [Observaciones] nvarchar(1000) NULL,
    [COD_AREA] numeric(18, 0) NULL,
    [QuinquenioSegunBonoVacacional] nvarchar(50) NULL,
    [ESTATUS] nvarchar(10) NULL,
    CONSTRAINT [PK_VACACIONES] PRIMARY KEY ([Id])
);
GO

-- RECURRENCIA: 10 columnas, 7436 filas en el real — rol: CANONICA — Faltas disciplinarias -> ops.faltas
IF OBJECT_ID(N'dbo.[RECURRENCIA]', N'U') IS NOT NULL DROP TABLE dbo.[RECURRENCIA];
GO
CREATE TABLE dbo.[RECURRENCIA] (
    [COD_RECURRENCIA] numeric(18, 0) NOT NULL,
    [CEDULA_CUESTIONADO] numeric(18, 0) NULL,
    [FECHA] datetime NULL,
    [OBSERVACIONES] nvarchar(3000) NULL,
    [COD_FALTA] numeric(18, 0) NULL,
    [DESCRIPCION_FALTA] nvarchar(100) NULL,
    [HORA] datetime NULL,
    [NRO_PARTE] nvarchar(20) NULL,
    [TOMO_LIBRO] nvarchar(20) NULL,
    [BENEFICIOS] bit NULL
);
GO

-- ENC_GUARDIAS: 11 columnas, 9 filas en el real — rol: CANONICA — Encabezado de guardias
IF OBJECT_ID(N'dbo.[ENC_GUARDIAS]', N'U') IS NOT NULL DROP TABLE dbo.[ENC_GUARDIAS];
GO
CREATE TABLE dbo.[ENC_GUARDIAS] (
    [ID_ENCABEZADO] numeric(18, 0) NOT NULL,
    [COD_ZONA] numeric(18, 0) NULL,
    [COD_ESTACION] numeric(18, 0) NULL,
    [SECCION] nvarchar(1) NULL,
    [HORARIO] nvarchar(15) NULL,
    [COD_AREA_DEPENDENCIA] numeric(18, 0) NULL,
    [MES] nvarchar(10) NULL,
    [DIA] int NULL,
    [FECHA] datetime NULL,
    [OFICIAL_COMANDO] nvarchar(60) NULL,
    [RESPONSABLE_CARGA] nvarchar(60) NULL,
    CONSTRAINT [PK_ENC_GUARDIAS] PRIMARY KEY ([ID_ENCABEZADO])
);
GO

-- DET_GUARDIAS: 8 columnas, 1461 filas en el real — rol: CANONICA — Detalle de guardias
IF OBJECT_ID(N'dbo.[DET_GUARDIAS]', N'U') IS NOT NULL DROP TABLE dbo.[DET_GUARDIAS];
GO
CREATE TABLE dbo.[DET_GUARDIAS] (
    [ID_ENCABEZADO] numeric(18, 0) NULL,
    [ID_DETALLE] numeric(18, 0) NOT NULL,
    [COD_DEPENDENCIA_OPERATIVA] numeric(18, 0) NULL,
    [CEDULA] numeric(18, 0) NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [ESTATUS_INICIAL] nvarchar(1) NULL,
    [ESTATUS_FINAL] nvarchar(1) NULL,
    [OBSERVACIONES] nvarchar(100) NULL
);
GO

-- EVALUACIONES: 10 columnas, 52556 filas en el real — rol: CANONICA — Evaluaciones de desempeño
IF OBJECT_ID(N'dbo.[EVALUACIONES]', N'U') IS NOT NULL DROP TABLE dbo.[EVALUACIONES];
GO
CREATE TABLE dbo.[EVALUACIONES] (
    [IDEVALUACION] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [CAPACITACION] int NULL,
    [FISICA] float NULL,
    [NOMBRE_EVALUADOR] nvarchar(61) NULL,
    [NUMERO_EVALUADOR] int NULL,
    [DESEMPEÑO] float NULL,
    [GERENTE] nvarchar(61) NULL,
    [RECOMENDACIONES] nvarchar(500) NULL,
    [FECHA] datetime NULL,
    CONSTRAINT [PK_EVALUACIONES] PRIMARY KEY ([IDEVALUACION])
);
GO

-- EVALUACIONES_CURSOS: 10 columnas, 11930 filas en el real — rol: CANONICA — Cursos realizados / notas
IF OBJECT_ID(N'dbo.[EVALUACIONES_CURSOS]', N'U') IS NOT NULL DROP TABLE dbo.[EVALUACIONES_CURSOS];
GO
CREATE TABLE dbo.[EVALUACIONES_CURSOS] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [COD_CURSO] numeric(18, 0) NULL,
    [NOTA] numeric(18, 0) NULL,
    [FECHA] datetime NULL,
    [CEDULA_INSTRUCTOR] numeric(18, 0) NULL,
    [ACUDIO] bit NULL,
    [OBSERVACION] nchar(100) NULL,
    [EXTRA] bit NULL
);
GO

-- CONDECORACIONES: 8 columnas, 58023 filas en el real — rol: CANONICA — Condecoraciones
IF OBJECT_ID(N'dbo.[CONDECORACIONES]', N'U') IS NOT NULL DROP TABLE dbo.[CONDECORACIONES];
GO
CREATE TABLE dbo.[CONDECORACIONES] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [PROMOCION] nvarchar(10) NULL,
    [NOMBRE_DOCUMENTO] nvarchar(50) NULL,
    [REFERENCIA] nvarchar(200) NULL,
    [FECHA] datetime NULL,
    [NOMBRE] nvarchar(100) NULL,
    [APELLIDO] nvarchar(100) NULL,
    CONSTRAINT [PK_CONDECORACIONES] PRIMARY KEY ([ID])
);
GO

-- JUBILADOS: 7 columnas, 850 filas en el real — rol: CANONICA — Jubilados
IF OBJECT_ID(N'dbo.[JUBILADOS]', N'U') IS NOT NULL DROP TABLE dbo.[JUBILADOS];
GO
CREATE TABLE dbo.[JUBILADOS] (
    [CEDULA] float NULL,
    [NOMINA] nvarchar(255) NULL,
    [UNIDAD_EJECUTORA] nvarchar(255) NULL,
    [NRO_NOMINA] nvarchar(255) NULL,
    [APELLIDOS_NOMBRES] nvarchar(255) NULL,
    [JERARQUIA] nvarchar(255) NULL,
    [FECHA_INGRESO] datetime NULL
);
GO

-- EQUIPOS_PROTECCION_FUNCIONARIOS: 5 columnas, 2 filas en el real — rol: CANONICA — Equipos de protección por funcionario
IF OBJECT_ID(N'dbo.[EQUIPOS_PROTECCION_FUNCIONARIOS]', N'U') IS NOT NULL DROP TABLE dbo.[EQUIPOS_PROTECCION_FUNCIONARIOS];
GO
CREATE TABLE dbo.[EQUIPOS_PROTECCION_FUNCIONARIOS] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [ID_EQUIPO_PROTECCION] numeric(18, 0) NULL,
    [TALLA] nvarchar(5) NULL,
    [FECHA_ACTUALIZACION] datetime NULL,
    CONSTRAINT [PK_EQUIPOS_PROTECCION_FUNCIONARIOS] PRIMARY KEY ([ID])
);
GO

-- UNIFORMES_FUNCIONARIOS: 5 columnas, 1 filas en el real — rol: CANONICA — Uniformes por funcionario
IF OBJECT_ID(N'dbo.[UNIFORMES_FUNCIONARIOS]', N'U') IS NOT NULL DROP TABLE dbo.[UNIFORMES_FUNCIONARIOS];
GO
CREATE TABLE dbo.[UNIFORMES_FUNCIONARIOS] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [ID_UNIFORME] numeric(18, 0) NULL,
    [TALLA] nvarchar(5) NULL,
    [FECHA_ACTUALIZACION] datetime NULL
);
GO

-- INVENTARIORADIOS: 9 columnas, 15 filas en el real — rol: CANONICA — Inventario de radios
IF OBJECT_ID(N'dbo.[INVENTARIORADIOS]', N'U') IS NOT NULL DROP TABLE dbo.[INVENTARIORADIOS];
GO
CREATE TABLE dbo.[INVENTARIORADIOS] (
    [RADIOID] nvarchar(25) NULL,
    [SERIAL] nvarchar(25) NULL,
    [COD_MARCA] numeric(18, 0) NULL,
    [COD_MODELO] numeric(18, 0) NULL,
    [ESTATUS] nvarchar(50) NULL,
    [CONDICION] nvarchar(25) NULL,
    [OBSERVACION] nvarchar(700) NULL,
    [COD_TIPO_EQUIPO] numeric(18, 0) NULL,
    [ALIAS] nvarchar(50) NULL
);
GO

-- ASIGNACION_RADIO_INDIVIDUAL: 14 columnas, 0 filas en el real — rol: CANONICA — Asignación de radios (vacía en el real)
IF OBJECT_ID(N'dbo.[ASIGNACION_RADIO_INDIVIDUAL]', N'U') IS NOT NULL DROP TABLE dbo.[ASIGNACION_RADIO_INDIVIDUAL];
GO
CREATE TABLE dbo.[ASIGNACION_RADIO_INDIVIDUAL] (
    [ID] numeric(18, 0) NOT NULL,
    [COD_ZONA] numeric(18, 0) NULL,
    [CEDULA_JEFE] numeric(18, 0) NULL,
    [CEDULA_FUNCIONARIO] numeric(18, 0) NULL,
    [COD_ESTACION] numeric(18, 0) NULL,
    [COD_AREA] numeric(18, 0) NULL,
    [PUESTO_DE_TRABAJO] nvarchar(90) NULL,
    [FECHA_ASIGNACION] datetime NULL,
    [SERIAL] nvarchar(50) NULL,
    [ID_EQUIPO] nvarchar(50) NULL,
    [COD_EQUIPO] numeric(18, 0) NULL,
    [COD_MARCA] numeric(18, 0) NULL,
    [COD_MODELO] numeric(18, 0) NULL,
    [ASIGNADO] nvarchar(5) NULL
);
GO

-- BENEFICIO: 5 columnas, 2069 filas en el real — rol: CANONICA — Beneficio (la canónica)
IF OBJECT_ID(N'dbo.[BENEFICIO]', N'U') IS NOT NULL DROP TABLE dbo.[BENEFICIO];
GO
CREATE TABLE dbo.[BENEFICIO] (
    [ApellidosYNombres] nvarchar(255) NULL,
    [Cedula] float NULL,
    [des_carg] nvarchar(255) NULL,
    [RECURRENCIA] nvarchar(20) NULL,
    [DATOS] nvarchar(20) NULL
);
GO

-- REGISTRO_BENEFICIO: 10 columnas, 11521 filas en el real — rol: CANONICA — Registro de beneficios
IF OBJECT_ID(N'dbo.[REGISTRO_BENEFICIO]', N'U') IS NOT NULL DROP TABLE dbo.[REGISTRO_BENEFICIO];
GO
CREATE TABLE dbo.[REGISTRO_BENEFICIO] (
    [CEDULA] numeric(18, 0) NOT NULL,
    [FECHA_REGISTRO] datetime NULL,
    [TIPO_BENEFICIO] nvarchar(100) NULL,
    [RECIBE_BENEFICIO] nvarchar(5) NULL,
    [FUNCIONARIO_TITULAR] nvarchar(5) NULL,
    [OTRO] nvarchar(5) NULL,
    [ESPECIFIQUE] nvarchar(400) NULL,
    [FECHA_DEPOSITO] datetime NULL,
    [NUMERO_REFERENCIA] nvarchar(50) NULL,
    [BANCO_EMISOR] nvarchar(150) NULL
);
GO

-- ACERVO_HISTORICO_GENERAL: 8 columnas, 70015 filas en el real — rol: CANONICA — Acervo documental
IF OBJECT_ID(N'dbo.[ACERVO_HISTORICO_GENERAL]', N'U') IS NOT NULL DROP TABLE dbo.[ACERVO_HISTORICO_GENERAL];
GO
CREATE TABLE dbo.[ACERVO_HISTORICO_GENERAL] (
    [ID] numeric(18, 0) NOT NULL,
    [CEDULA] numeric(18, 0) NULL,
    [PROMOCION] nvarchar(10) NULL,
    [NOMBRE_DOCUMENTO] nvarchar(50) NULL,
    [REFERENCIA] nvarchar(200) NULL,
    [FECHA] datetime NULL,
    [NOMBRE] nvarchar(100) NULL,
    [APELLIDO] nvarchar(100) NULL,
    CONSTRAINT [PK_ACERVO_HISTORICO_GENERAL] PRIMARY KEY ([ID])
);
GO

-- ACCESO: 15 columnas, 200 filas en el real — rol: DESCARTAR — Usuarios viejos con clave en texto plano
IF OBJECT_ID(N'dbo.[ACCESO]', N'U') IS NOT NULL DROP TABLE dbo.[ACCESO];
GO
CREATE TABLE dbo.[ACCESO] (
    [ID_ACCESO] numeric(18, 0) NOT NULL,
    [USUARIO] nvarchar(15) NULL,
    [CEDULA] numeric(18, 0) NULL,
    [CLAVE] nvarchar(20) NULL,
    [FECHA_PASS] datetime NULL,
    [HORA_PASS] datetime NULL,
    [NIVEL] nvarchar(50) NULL,
    [PREGUNTA_SEGURIDAD] nvarchar(80) NULL,
    [RESPUESTA_PREGUNTA] nvarchar(80) NULL,
    [CONSULTAR] nvarchar(2) NULL,
    [ELIMINAR] nvarchar(2) NULL,
    [MODIFICAR] nvarchar(2) NULL,
    [INCLUIR] nvarchar(2) NULL,
    [SECCION] nvarchar(2) NULL,
    [MODULO] nvarchar(50) NULL,
    CONSTRAINT [PK_ACCESO] PRIMARY KEY ([ID_ACCESO])
);
GO

-- AUDIT_FUNCIONARIOS: 71 columnas, 51575 filas en el real — rol: DESCARTAR — Auditoría legacy
IF OBJECT_ID(N'dbo.[AUDIT_FUNCIONARIOS]', N'U') IS NOT NULL DROP TABLE dbo.[AUDIT_FUNCIONARIOS];
GO
CREATE TABLE dbo.[AUDIT_FUNCIONARIOS] (
    [ID_AUDIT] numeric(18, 0) NOT NULL,
    [USUARIO] nvarchar(50) NULL,
    [USUARIO_APLICACION] nvarchar(50) NULL,
    [DIR_MAC] nvarchar(50) NULL,
    [TRANSACCION] nvarchar(30) NULL,
    [FECHA_TRANSACCION] datetime NULL,
    [CEDULA] numeric(18, 0) NULL,
    [CEDULA_MOD] numeric(18, 0) NULL,
    [NACIONALIDAD] nvarchar(1) NULL,
    [NACIONALIDAD_MOD] nvarchar(1) NULL,
    [RIF] nvarchar(50) NULL,
    [RIF_MOD] nvarchar(50) NULL,
    [APELLIDOS] nvarchar(50) NULL,
    [APELLIDOS_MOD] nvarchar(50) NULL,
    [NOMBRES] nvarchar(50) NULL,
    [NOMBRES_MOD] nvarchar(50) NULL,
    [FECHA_INGRESO] datetime NULL,
    [FECHA_INGRESO_MOD] datetime NULL,
    [FECHA_ESTE] datetime NULL,
    [FECHA_ESTE_MOD] datetime NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [COD_JERARQUIA_MOD] numeric(18, 0) NULL,
    [SECCION] nvarchar(1) NULL,
    [SECCION_MOD] nvarchar(1) NULL,
    [COD_CARGO] numeric(18, 0) NULL,
    [COD_CARGO_MOD] numeric(18, 0) NULL,
    [N_EQUIPO] nvarchar(30) NULL,
    [N_EQUIPO_MOD] nvarchar(30) NULL,
    [N_EMPLEADO] nvarchar(9) NULL,
    [N_EMPLEADO_MOD] nvarchar(9) NULL,
    [CONDICION] nvarchar(50) NULL,
    [CONDICION_MOD] nvarchar(50) NULL,
    [ESTATUS] nvarchar(30) NULL,
    [ESTATUS_MOD] nvarchar(30) NULL,
    [HORARIO] nvarchar(30) NULL,
    [HORARIO_MOD] nvarchar(30) NULL,
    [SEXO] nvarchar(20) NULL,
    [SEXO_MOD] nvarchar(20) NULL,
    [FECHA_NACIMIENTO] datetime NULL,
    [FECHA_NACIMIENTO_MOD] datetime NULL,
    [ESTADO_CIVIL] nvarchar(25) NULL,
    [ESTADO_CIVIL_MOD] nvarchar(25) NULL,
    [GRUPO_SANGUINEO] nvarchar(2) NULL,
    [GRUPO_SANGUINEO_MOD] nvarchar(2) NULL,
    [FACTOR_SANGUINEO] nvarchar(15) NULL,
    [FACTOR_SANGUINEO_MOD] nvarchar(15) NULL,
    [CORREO_ELECTRONICO] nvarchar(50) NULL,
    [CORREO_ELECTRONICO_MOD] nvarchar(50) NULL,
    [NIVEL_EDUCATIVO] int NULL,
    [NIVEL_EDUCATIVO_MOD] int NULL,
    [PROMOCION] nvarchar(5) NULL,
    [PROMOCION_MOD] nvarchar(5) NULL,
    [FECHA_EGRESO] datetime NULL,
    [FECHA_EGRESO_MOD] datetime NULL,
    [FECHA_REINTEGRO] datetime NULL,
    [FECHA_REINTEGRO_MOD] datetime NULL,
    [TELEFONO_HABITACION] nvarchar(100) NULL,
    [TELEFONO_HABITACION_MOD] nvarchar(100) NULL,
    [TELEFONO_MOBIL] nvarchar(100) NULL,
    [TELEFONO_MOBIL_MOD] nvarchar(100) NULL,
    [TELEFONO_OTROS] nvarchar(100) NULL,
    [TELEFONO_OTROS_MOD] nvarchar(100) NULL,
    [PERSONA_CONTACTO] nvarchar(100) NULL,
    [PERSONA_CONTACTO_MOD] nvarchar(100) NULL,
    [LICENCIA] nvarchar(10) NULL,
    [LICENCIA_MOD] nvarchar(10) NULL,
    [COD_UBICACION] numeric(18, 0) NULL,
    [COD_UBICACION_MOD] numeric(18, 0) NULL,
    [FECHA_ACTUALIZACION] datetime NULL,
    [PRE_JUBILADOS] nchar(2) NULL,
    [PRE_JUBILADOS_MOD] nchar(2) NULL,
    CONSTRAINT [PK_AUDIT_FUNCIONARIOS] PRIMARY KEY ([ID_AUDIT])
);
GO

-- AUDIT_HISTORICO_JERARQUIA: 23 columnas, 4394 filas en el real — rol: DESCARTAR — Auditoría legacy
IF OBJECT_ID(N'dbo.[AUDIT_HISTORICO_JERARQUIA]', N'U') IS NOT NULL DROP TABLE dbo.[AUDIT_HISTORICO_JERARQUIA];
GO
CREATE TABLE dbo.[AUDIT_HISTORICO_JERARQUIA] (
    [ID_HISTO_JERARQUIA] numeric(18, 0) NOT NULL,
    [USUARIO] nvarchar(50) NULL,
    [USUARIO_APLICACION] nvarchar(50) NULL,
    [TRANSACCION] nvarchar(50) NULL,
    [FECHA_TRANSACCION] datetime NULL,
    [CEDULA] numeric(18, 0) NULL,
    [CEDULA_MOD] numeric(18, 0) NULL,
    [TIPO_DOCUMENTO] nvarchar(255) NULL,
    [TIPO_DOCUMENTO_MOD] nvarchar(255) NULL,
    [NUMERO_DOCUMENTO] nvarchar(255) NULL,
    [NUMERO_DOCUMENTO_MOD] nvarchar(255) NULL,
    [REFERENCIA] nvarchar(255) NULL,
    [REFERENCIA_MOD] nvarchar(255) NULL,
    [FECHA] datetime NULL,
    [FECHA_MOD] datetime NULL,
    [COD_JERARQUIA] numeric(18, 0) NULL,
    [COD_JERARQUIA_MOD] numeric(18, 0) NULL,
    [COD_CARGO] numeric(18, 0) NULL,
    [COD_CARGO_MOD] numeric(18, 0) NULL,
    [FECHA ULTIMO ASCENSO] datetime NULL,
    [FECHA_ULTIMO_ASCENSO_MOD] datetime NULL,
    [NIVELACION] bit NULL,
    [NIVELACION_MOD] bit NULL,
    CONSTRAINT [PK_AUDIT_HISTORICO_JERARQUIA] PRIMARY KEY ([ID_HISTO_JERARQUIA])
);
GO

-- FUNCIONARIOS_VIEJA: 42 columnas, 3353 filas en el real — rol: DESCARTAR — Copia vieja (_VIEJA)
IF OBJECT_ID(N'dbo.[FUNCIONARIOS_VIEJA]', N'U') IS NOT NULL DROP TABLE dbo.[FUNCIONARIOS_VIEJA];
GO
CREATE TABLE dbo.[FUNCIONARIOS_VIEJA] (
    [CEDULA] numeric(18, 0) NULL,
    [APELLIDOS] nvarchar(30) NULL,
    [NOMBRES] nvarchar(70) NULL,
    [FECHA_INGRESO] datetime NULL,
    [FECHA_INGRESO_ESTE] datetime NULL,
    [COD_JERARQUIA] numeric(10, 0) NULL,
    [COD_CARGO] numeric(10, 0) NULL,
    [CONDICION] nvarchar(25) NULL,
    [ESTATUS] nvarchar(25) NULL,
    [COD_AREA] numeric(10, 0) NULL,
    [HORARIO] nvarchar(15) NULL,
    [SECCION] nvarchar(1) NULL,
    [COD_ESTACION] numeric(10, 0) NULL,
    [COD_ZONA] numeric(10, 0) NULL,
    [SEXO] nvarchar(1) NULL,
    [COD_DEPENDENCIA] numeric(10, 0) NULL,
    [NIVEL_EDUCATIVO] int NULL,
    [TITULO] int NULL,
    [FECHA_NACIMIENTO] datetime NULL,
    [PROMOCION] nvarchar(5) NULL,
    [LICENCIA] nvarchar(4) NULL,
    [FECHA_ACTUALIZACION] datetime NULL,
    [N_EMPLEADO] nvarchar(9) NULL,
    [TELEFONO_OFICINA] nvarchar(20) NULL,
    [EXTENSION] nvarchar(3) NULL,
    [JEFE] nvarchar(50) NULL,
    [GRUPO_SANGUINEO] nvarchar(3) NULL,
    [FACTOR_RH] nvarchar(8) NULL,
    [ESTADO_CIVIL] nvarchar(15) NULL,
    [ESTADO] nvarchar(50) NULL,
    [CIUDAD] nvarchar(50) NULL,
    [MUNICIPIO] nvarchar(50) NULL,
    [PARROQUIA] nvarchar(50) NULL,
    [DETALLE_DIRECCION] nvarchar(200) NULL,
    [TELEFONO_HABITACION] nvarchar(20) NULL,
    [TELEFONO_MOVIL] nvarchar(20) NULL,
    [TELEFONO_OTROS] nvarchar(20) NULL,
    [FECHA_EGRESO] datetime NULL,
    [FECHA_REINGRESO] datetime NULL,
    [COD_AREA_DEPENDENCIA] numeric(18, 0) NULL,
    [CORREO_ELECTRONICO] nvarchar(100) NULL,
    [N_EQUIPO] numeric(18, 0) NULL
);
GO

-- HISTORICO_JERARQUIA_OLD: 11 columnas, 46213 filas en el real — rol: DESCARTAR — Copia vieja (_OLD)
IF OBJECT_ID(N'dbo.[HISTORICO_JERARQUIA_OLD]', N'U') IS NOT NULL DROP TABLE dbo.[HISTORICO_JERARQUIA_OLD];
GO
CREATE TABLE dbo.[HISTORICO_JERARQUIA_OLD] (
    [ID] float NULL,
    [CEDULA] numeric(38, 0) NULL,
    [TIPO_DOCUMENTO] nvarchar(255) NULL,
    [NUMERO_DOCUMENTO] nvarchar(255) NULL,
    [REFERENCIA] nvarchar(255) NULL,
    [FECHA] datetime NULL,
    [COD_JERARQUIA] float NULL,
    [COD_CARGO] float NULL,
    [Jerarquia] nvarchar(255) NULL,
    [Fecha Ultimo Ascenso] datetime NULL,
    [Nivelacion] bit NOT NULL
);
GO

-- REPOSOS_BD_VIEJA: 5 columnas, 27271 filas en el real — rol: DESCARTAR — Copia vieja de reposos (_VIEJA)
IF OBJECT_ID(N'dbo.[REPOSOS_BD_VIEJA]', N'U') IS NOT NULL DROP TABLE dbo.[REPOSOS_BD_VIEJA];
GO
CREATE TABLE dbo.[REPOSOS_BD_VIEJA] (
    [CEDULA] numeric(18, 0) NULL,
    [FECHA_RECEPCION] datetime NULL,
    [FECHA_INICIO] datetime NULL,
    [FECHA_FIN] datetime NULL,
    [ID] numeric(18, 0) NULL
);
GO

-- REPOSOS(ORIGINAL): 10 columnas, 0 filas en el real — rol: DESCARTAR — Copia vieja de reposos ((ORIGINAL))
IF OBJECT_ID(N'dbo.[REPOSOS(ORIGINAL)]', N'U') IS NOT NULL DROP TABLE dbo.[REPOSOS(ORIGINAL)];
GO
CREATE TABLE dbo.[REPOSOS(ORIGINAL)] (
    [Id] numeric(18, 0) NOT NULL,
    [NROORDEN] numeric(18, 0) NULL,
    [FECHA_RECEPCION] datetime NULL,
    [FECHA_INICIO] datetime NULL,
    [FECHA_FIN] datetime NULL,
    [FECHA_REINTEGRO] datetime NULL,
    [DIAGNOSTICO] nvarchar(700) NULL,
    [MEDICO_TRATANTE] nvarchar(50) NULL,
    [RELATIVO] bit NULL,
    [INSTITUCION] nvarchar(50) NULL
);
GO

-- BENEFICIO_ENE22: 5 columnas, 2328 filas en el real — rol: DESCARTAR — Instantánea mensual de BENEFICIO
IF OBJECT_ID(N'dbo.[BENEFICIO_ENE22]', N'U') IS NOT NULL DROP TABLE dbo.[BENEFICIO_ENE22];
GO
CREATE TABLE dbo.[BENEFICIO_ENE22] (
    [ApellidosYNombres] nvarchar(255) NULL,
    [Cedula] float NULL,
    [des_carg] nvarchar(255) NULL,
    [RECURRENCIA] nvarchar(20) NULL,
    [DATOS] nvarchar(20) NULL
);
GO

-- Hoja1$: 5 columnas, 2199 filas en el real — rol: DESCARTAR — Importación puntual desde Excel
IF OBJECT_ID(N'dbo.[Hoja1$]', N'U') IS NOT NULL DROP TABLE dbo.[Hoja1$];
GO
CREATE TABLE dbo.[Hoja1$] (
    [FICTICIO DEMO NOMBRE APELLIDO ] nvarchar(255) NULL,
    [90999999] float NULL,
    [EMPLEADOS FIJOS] nvarchar(255) NULL,
    [F4] float NULL,
    [NO EXISTE] nvarchar(255) NULL
);
GO

-- dtproperties: 7 columnas, 0 filas en el real — rol: DESCARTAR — Tabla de sistema (diagramas de SQL Server 2000)
IF OBJECT_ID(N'dbo.[dtproperties]', N'U') IS NOT NULL DROP TABLE dbo.[dtproperties];
GO
CREATE TABLE dbo.[dtproperties] (
    [id] int NOT NULL,
    [objectid] int NULL,
    [property] varchar(64) NOT NULL,
    [value] varchar(255) NULL,
    [uvalue] nvarchar(255) NULL,
    [lvalue] image NULL,
    [version] int NOT NULL DEFAULT (0),
    CONSTRAINT [pk_dtproperties] PRIMARY KEY ([id], [property])
);
GO
