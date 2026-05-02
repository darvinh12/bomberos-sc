# Modelo Entidad-Relación

GitHub renderiza Mermaid directamente, por lo que esta página es navegable sin instalar nada.
Para una vista interactiva (zoom, pan, exportar PNG/PDF) usa el archivo
[`schema.dbml`](./schema.dbml) en https://dbdiagram.io/d (File → Import → DBML).

---

## 0. Vista general — schemas y dependencias principales

```mermaid
flowchart LR
    classDef cat fill:#FFF3CD,stroke:#856404,color:#000
    classDef pers fill:#D1ECF1,stroke:#0C5460,color:#000
    classDef ops fill:#D4EDDA,stroke:#155724,color:#000
    classDef sec fill:#F8D7DA,stroke:#721C24,color:#000

    core[core - catalogos]:::cat
    geo[geo - estados/municipios/parroquias]:::cat
    org[org - zonas/estaciones/areas]:::cat
    sys[sys - parametros]:::cat

    personal[personal - funcionarios + identidad + historicos]:::pers
    salud[salud]:::pers
    ops[ops - guardias/permisos/vacaciones]:::ops
    carrera[carrera - ascensos/cursos/evaluaciones]:::ops
    equipo[equipo - proteccion/uniformes/radios]:::ops
    beneficios[beneficios]:::ops
    vivienda[vivienda]:::ops
    egresos[egresos]:::ops
    documentos[documentos - acervo/oficios/actas]:::ops

    seguridad[seguridad - usuarios/roles]:::sec
    aud[aud - log_cambios JSONB]:::sec

    geo --> org
    core --> personal
    core --> org
    core --> salud
    org --> personal
    personal --> salud
    personal --> ops
    personal --> carrera
    personal --> equipo
    personal --> beneficios
    personal --> vivienda
    personal --> egresos
    personal --> documentos
    seguridad -.audit.-> aud
    personal -.audit.-> aud
    salud -.audit.-> aud
    ops -.audit.-> aud
```

---

## 1. Personal — núcleo de funcionarios

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ PERIODOS_SERVICIO : "1..N ciclos"
    FUNCIONARIOS ||--o{ HISTORICO_JERARQUIAS : "ascensos"
    FUNCIONARIOS ||--o{ HISTORICO_UBICACIONES : "movimientos"
    FUNCIONARIOS ||--o{ HISTORICO_CONDICIONES : "transiciones"
    FUNCIONARIOS ||--o{ HISTORICO_NUMEROS_EQUIPO : "asignaciones"
    FUNCIONARIOS ||--o{ DIRECCIONES : "una actual"
    FUNCIONARIOS ||--o{ CARGA_FAMILIAR : "dependientes"
    FUNCIONARIOS ||--o{ EDUCACION : "titulos"
    FUNCIONARIOS ||--o{ HABILIDADES : "idiomas/skills"
    FUNCIONARIOS ||--o{ ACTIVIDADES : "extracurriculares"
    FUNCIONARIOS ||--o{ TIEMPO_ADMPUBLICA : "trabajo previo"
    FUNCIONARIOS ||--o{ CUENTAS_BANCARIAS : "una actual"
    FUNCIONARIOS ||--o{ LICENCIAS_CONDUCIR : "renovaciones"
    FUNCIONARIOS ||--o{ CARNETS : "cedula/patria/votacion"
    FUNCIONARIOS ||--|| REGISTRO_VOTACION : ""
    FUNCIONARIOS ||--o{ HOGARES_PATRIA : ""
    FUNCIONARIOS ||--o{ GDC_HABITACIONAL : ""

    JERARQUIAS ||--o{ FUNCIONARIOS : ""
    CARGOS ||--o{ FUNCIONARIOS : ""
    CONDICIONES ||--o{ FUNCIONARIOS : ""
    ZONAS ||--o{ FUNCIONARIOS : ""
    ESTACIONES ||--o{ FUNCIONARIOS : ""

    FUNCIONARIOS {
        bigint id PK
        char nacionalidad
        int cedula UK
        text apellidos
        text nombres
        text nombre_completo "generated"
        date fecha_nacimiento
        date fecha_primer_ingreso "inmutable"
        smallint jerarquia_id FK
        smallint cargo_id FK
        smallint zona_id FK
        smallint estacion_id FK
        text estatus "ACTIVO/REPOSO/JUBILADO..."
        text numero_empleado UK
        text numero_equipo
    }
    PERIODOS_SERVICIO {
        bigint id PK
        bigint funcionario_id FK
        smallint numero_periodo
        date fecha_ingreso
        date fecha_egreso "NULL=activo"
        text tipo_ingreso
        text tipo_egreso
        text numero_resolucion
        numeric monto_prestaciones
    }
    HISTORICO_JERARQUIAS {
        bigint id PK
        bigint funcionario_id FK
        smallint jerarquia_id FK
        date fecha_inicio
        date fecha_fin
        text motivo
        text resolucion
    }
    HISTORICO_UBICACIONES {
        bigint id PK
        bigint funcionario_id FK
        smallint zona_id FK
        smallint estacion_id FK
        smallint area_id FK
        smallint cargo_id FK
        date fecha_inicio
        date fecha_fin
    }
    HISTORICO_CONDICIONES {
        bigint id PK
        bigint funcionario_id FK
        smallint condicion_id FK
        date fecha_inicio
        date fecha_fin
    }
    HISTORICO_NUMEROS_EQUIPO {
        bigint id PK
        bigint funcionario_id FK
        text numero_equipo
        date fecha_inicio
        date fecha_fin
    }
    CARNETS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_carnet_id FK "PATRIA/VOTACION/CIVICO/MILITAR..."
        text numero
        date fecha_emision
        date fecha_vence
    }
    CARGA_FAMILIAR {
        bigint id PK
        bigint funcionario_id FK
        text parentesco
        int cedula
        text apellidos
        text nombres
        date fecha_nacimiento
        boolean es_beneficiario_hcm
    }
    DIRECCIONES {
        bigint id PK
        bigint funcionario_id FK
        boolean es_actual "unique partial"
        int parroquia_id FK
        text direccion_completa
    }
    CUENTAS_BANCARIAS {
        bigint id PK
        bigint funcionario_id FK
        smallint banco_id FK
        text numero_cuenta
        boolean es_actual
    }
    LICENCIAS_CONDUCIR {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_licencia_id FK
        text numero
        date fecha_vence
        boolean es_actual
    }
    HOGARES_PATRIA {
        bigint id PK
        bigint funcionario_id FK
        text serial_carnet_patria
        smallint cantidad_personas
        boolean es_jefe_hogar
        boolean recibe_clap
    }
```

---

## 2. Salud

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ REPOSOS : tiene
    FUNCIONARIOS ||--o{ LESIONES : ""
    FUNCIONARIOS ||--o{ HOSPITALIZACIONES : ""
    FUNCIONARIOS ||--o{ CONSULTAS : ""
    FUNCIONARIOS ||--o{ HCM : poliza
    FUNCIONARIOS ||--o{ EVALUACION_FISICA : anual
    FUNCIONARIOS ||--o{ RECURRENCIAS : analisis

    DIAGNOSTICOS ||--o{ REPOSOS : ""
    DIAGNOSTICOS ||--o{ LESIONES : ""
    DIAGNOSTICOS ||--o{ HOSPITALIZACIONES : ""
    GRUPOS_DIAGNOSTICOS ||--o{ DIAGNOSTICOS : ""
    MEDICOS ||--o{ REPOSOS : firma
    MEDICOS ||--o{ CONSULTAS : ""
    CENTROS_MEDICOS ||--o{ REPOSOS : ""
    CENTROS_MEDICOS ||--o{ HOSPITALIZACIONES : ""
    TIPOS_REPOSO ||--o{ REPOSOS : ""
    CARGA_FAMILIAR ||--o{ HOSPITALIZACIONES : "familiar"

    REPOSOS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_reposo_id FK
        int diagnostico_id FK
        bigint medico_id FK
        date fecha_inicio
        date fecha_fin
        smallint dias "generated"
        text folio
        boolean anulado
    }
    DIAGNOSTICOS {
        int id PK
        text codigo_cie UK
        smallint grupo_id FK
        text nombre
    }
    MEDICOS {
        bigint id PK
        char nacionalidad
        int cedula
        text apellidos
        text nombres
        text mpps UK
    }
    CENTROS_MEDICOS {
        bigint id PK
        text rif UK
        text nombre
        text tipo
        boolean convenio_hcm
    }
    LESIONES {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_accidente_id FK
        date fecha_evento
        boolean en_servicio
        smallint dias_incapacidad
    }
    HOSPITALIZACIONES {
        bigint id PK
        bigint funcionario_id FK
        boolean es_funcionario
        bigint carga_familiar_id FK
        bigint centro_medico_id FK
        date fecha_ingreso
        date fecha_egreso
        boolean cubierto_hcm
    }
    EVALUACION_FISICA {
        bigint id PK
        bigint funcionario_id FK
        date fecha
        numeric peso_kg
        numeric estatura_cm
        numeric imc "generated"
        boolean apto
    }
```

---

## 3. Operaciones (guardias, permisos, vacaciones, comisiones)

```mermaid
erDiagram
    ESTACIONES ||--o{ GUARDIAS : ""
    GUARDIAS ||--o{ GUARDIA_FUNCIONARIOS : detalle
    FUNCIONARIOS ||--o{ GUARDIA_FUNCIONARIOS : asignados
    FUNCIONARIOS ||--o{ PERMISOS : ""
    FUNCIONARIOS ||--o{ VACACIONES : ""
    FUNCIONARIOS ||--o{ COMISIONES_SERVICIO : ""
    FUNCIONARIOS ||--o{ FALTAS : ""
    FUNCIONARIOS ||--o{ PROCESOS_ADMINISTRATIVOS : ""
    FUNCIONARIOS ||--o{ SOLICITUDES_PERMISO : ""
    INSTITUCIONES ||--o{ COMISIONES_SERVICIO : ""

    GUARDIAS {
        bigint id PK
        date fecha
        smallint estacion_id FK
        char seccion
        text turno
        bigint jefe_guardia_id FK
        boolean cerrada
    }
    GUARDIA_FUNCIONARIOS {
        bigint id PK
        bigint guardia_id FK
        bigint funcionario_id FK
        text rol_guardia
        boolean asistio
    }
    PERMISOS {
        bigint id PK
        bigint funcionario_id FK
        text tipo
        date fecha_inicio
        date fecha_fin
        boolean autorizado
    }
    VACACIONES {
        bigint id PK
        bigint funcionario_id FK
        smallint periodo_anio
        date fecha_inicio
        date fecha_fin
        smallint dias_calendario "generated"
        boolean bono_pagado
        numeric monto_bono
    }
    COMISIONES_SERVICIO {
        bigint id PK
        bigint funcionario_id FK
        bigint institucion_id FK
        date fecha_inicio
        date fecha_fin
        text resolucion
    }
    FALTAS {
        bigint id PK
        bigint funcionario_id FK
        text tipo_falta
        date fecha
        smallint dias_suspension
    }
    ORDENES_GENERALES {
        bigint id PK
        text numero UK
        date fecha
        text asunto
    }
    ACTIVIDADES_OPERATIVAS {
        bigint id PK
        smallint estacion_id FK
        timestamptz fecha
        text tipo "INCENDIO/RESCATE/EMG_MED"
        int parroquia_id FK
    }
```

---

## 4. Carrera (ascensos, evaluaciones, cursos, méritos)

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ ASCENSOS : ""
    FUNCIONARIOS ||--o{ EVALUACIONES : ""
    FUNCIONARIOS ||--o{ CURSOS_REALIZADOS : ""
    FUNCIONARIOS ||--o{ RECONOCIMIENTOS : ""
    FUNCIONARIOS ||--o{ MERITOS : ""

    PROCESOS_ASCENSO ||--o{ ASCENSOS : ""
    JERARQUIAS ||--o{ ASCENSOS : "anterior/nueva"
    PERIODOS_EVALUACION ||--o{ EVALUACIONES : ""
    PERIODOS_EVALUACION ||--o{ MERITOS : ""
    EVALUACIONES ||--o{ EVALUACIONES_DETALLE : ""
    CATEGORIAS_EVALUAR ||--o{ EVALUACIONES_DETALLE : ""
    CATEGORIAS_EVALUAR ||--o{ FACTORES_PORCENTAJES : ""
    CURSOS ||--o{ CURSOS_REALIZADOS : ""
    CONDECORACIONES ||--o{ RECONOCIMIENTOS : ""
    INSTITUCIONES ||--o{ RECONOCIMIENTOS : ""

    ASCENSOS {
        bigint id PK
        bigint funcionario_id FK
        bigint proceso_id FK
        smallint jerarquia_anterior_id FK
        smallint jerarquia_nueva_id FK
        date fecha_efectiva
        text resolucion
    }
    EVALUACIONES {
        bigint id PK
        bigint funcionario_id FK
        smallint periodo_id FK
        text tipo "DESEMPENO/FISICA/INTEGRAL"
        numeric nota_total
    }
    CURSOS_REALIZADOS {
        bigint id PK
        bigint funcionario_id FK
        smallint curso_id FK
        date fecha_fin
        boolean aprobado
    }
    MERITOS {
        bigint id PK
        bigint funcionario_id FK
        smallint periodo_id FK
        numeric puntaje_total
        int posicion
    }
    RECONOCIMIENTOS {
        bigint id PK
        bigint funcionario_id FK
        smallint condecoracion_id FK
        date fecha_otorgamiento
    }
```

---

## 5. Equipamiento (protección, uniformes, radios)

```mermaid
erDiagram
    TIPOS_PROTECCION ||--o{ PROTECCION_INVENTARIO : ""
    PROTECCION_INVENTARIO ||--o{ PROTECCION_ASIGNACIONES : ""
    FUNCIONARIOS ||--o{ PROTECCION_ASIGNACIONES : ""
    PROTECCION_DESPACHOS ||--o{ PROTECCION_DESPACHO_DETALLE : ""

    TIPOS_UNIFORME ||--o{ UNIFORMES_INVENTARIO : ""
    FUNCIONARIOS ||--o{ UNIFORMES_ASIGNACIONES : ""
    UNIFORMES_DESPACHOS ||--o{ UNIFORMES_DESPACHO_DETALLE : ""

    RADIO_MARCAS ||--o{ RADIO_MODELOS : ""
    RADIO_MODELOS ||--o{ RADIOS : ""
    RADIOS ||--o{ RADIO_ASIGNACIONES : ""
    RADIOS ||--o{ RADIO_MANTENIMIENTOS : ""
    FUNCIONARIOS ||--o{ RADIO_ASIGNACIONES : ""
    ESTACIONES ||--o{ RADIO_ASIGNACIONES : ""

    PROTECCION_INVENTARIO {
        bigint id PK
        smallint tipo_id FK
        smallint talla_id FK
        text numero_serie UK
        text estatus "DISPONIBLE/ASIGNADO/BAJA/REPARACION"
    }
    PROTECCION_ASIGNACIONES {
        bigint id PK
        bigint inventario_id FK
        bigint funcionario_id FK
        date fecha_entrega
        date fecha_devolucion
    }
    RADIOS {
        bigint id PK
        smallint modelo_id FK
        text serial UK
        smallint estacion_id FK
        text estatus
    }
    RADIO_ASIGNACIONES {
        bigint id PK
        bigint radio_id FK
        bigint funcionario_id FK
        smallint estacion_id FK
        date fecha_asignacion
        date fecha_devolucion
    }
```

---

## 6. Beneficios, vivienda, egresos

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ AYUDAS : ""
    FUNCIONARIOS ||--o{ ENTREGAS : ""
    FUNCIONARIOS ||--o{ POSTULACIONES_VIVIENDA : ""
    FUNCIONARIOS ||--o{ CASOS_SOCIALES : ""
    FUNCIONARIOS ||--o{ SOLICITUDES_JUBILACION : ""
    FUNCIONARIOS ||--|| PRE_JUBILADOS : ""
    FUNCIONARIOS ||--|| JUBILADOS : ""
    FUNCIONARIOS ||--|| FALLECIMIENTOS : ""

    TIPOS_SOLICITUD ||--o{ AYUDAS : ""
    TIPOS_BENEFICIO ||--o{ ENTREGAS : ""
    AYUDAS ||--o{ AYUDA_DETALLE : ""
    ENTREGAS ||--o{ ENTREGA_PAGOS : ""
    PROGRAMAS_VIVIENDA ||--o{ POSTULACIONES_VIVIENDA : ""
    POSTULACIONES_VIVIENDA ||--|| ADJUDICACIONES : ""
    CASOS_SOCIALES ||--o{ VISITAS_SOCIALES : ""

    AYUDAS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_solicitud_id FK
        numeric monto_solicitado
        numeric monto_aprobado
        text estatus
        date fecha_solicitud
    }
    ENTREGAS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_beneficio_id FK
        text periodo
        numeric monto
    }
    POSTULACIONES_VIVIENDA {
        bigint id PK
        smallint programa_id FK
        bigint funcionario_id FK
        text estatus
    }
    JUBILADOS {
        bigint id PK
        bigint funcionario_id FK,UK
        date fecha_jubilacion
        numeric anios_servicio
        numeric pension_mensual
    }
    FALLECIMIENTOS {
        bigint id PK
        bigint funcionario_id FK,UK
        date fecha_fallecimiento
        boolean en_servicio
    }
```

---

## 7. Documentos y seguridad

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ ACERVO : ""
    TIPOS_DOCUMENTO ||--o{ ACERVO : ""
    FUNCIONARIOS ||--o{ OFICIOS : remitente
    OFICIOS ||--o{ OFICIOS_DESTINATARIOS : ""
    ACTAS ||--o{ ACTAS_ASISTENTES : ""
    FUNCIONARIOS ||--o{ FIRMAS_AUTORIZADAS : ""

    USUARIOS ||--|| FUNCIONARIOS : "puede vincular"
    ROLES ||--o{ ROL_PERMISOS : ""
    MODULOS ||--o{ ROL_PERMISOS : ""
    USUARIOS ||--o{ USUARIO_ROLES : ""
    ROLES ||--o{ USUARIO_ROLES : ""
    USUARIOS ||--o{ USUARIO_PERMISOS : "override"
    USUARIOS ||--o{ USUARIO_SCOPES : "zona/estacion"
    USUARIOS ||--o{ SESIONES : ""
    USUARIOS ||--o{ LOG_ACCESOS : ""

    USUARIOS {
        bigint id PK
        bigint funcionario_id FK
        citext usuario UK
        text password_hash
        boolean activo
        boolean bloqueado
        boolean mfa_activo
    }
    ACERVO {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_documento_id FK
        text titulo
        text documento_url
    }
    LOG_CAMBIOS {
        bigint id PK
        text schema_name
        text table_name
        text registro_id
        char operacion
        jsonb valor_anterior
        jsonb valor_nuevo
        jsonb campos_cambiados
        bigint usuario_id
        timestamptz fecha
    }
```

---

## Convenciones

- `||--o{` = uno a muchos · `||--||` = uno a uno · `--|{` = obligatorio
- `PK` = primary key · `FK` = foreign key · `UK` = unique
- `generated` = columna calculada (`GENERATED ALWAYS AS ... STORED`)
- Las cajas no muestran TODAS las columnas — solo las clave. El esquema completo está en `sql/02_dominio.sql` y en `docs/schema.dbml`.
