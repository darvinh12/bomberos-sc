# Modelo Entidad-Relación

GitHub renderiza Mermaid directamente. Para vista interactiva con zoom, pan y export
a PNG/PDF usa [`schema.dbml`](./schema.dbml) en https://dbdiagram.io/d
(File → Import → DBML).

> Nota: Mermaid en GitHub solo acepta `PK` y `FK` como key annotations. Las cajas
> muestran solo columnas clave; el detalle completo está en `sql/02_dominio.sql`
> y en `schema.dbml`.

---

## 0. Vista general — schemas y dependencias

```mermaid
graph TD
    core[core<br/>catalogos]
    geo[geo<br/>estados/municipios/parroquias]
    org[org<br/>zonas/estaciones/areas]
    sys[sys<br/>parametros]
    personal[personal<br/>funcionarios + identidad + historicos]
    salud[salud]
    ops[ops<br/>guardias/permisos/vacaciones]
    carrera[carrera<br/>ascensos/cursos/evaluaciones]
    equipo[equipo<br/>proteccion/uniformes/radios]
    beneficios[beneficios]
    vivienda[vivienda]
    egresos[egresos]
    documentos[documentos]
    seguridad[seguridad<br/>usuarios/roles]
    aud[aud<br/>log_cambios JSONB]

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
    seguridad --> aud
    personal --> aud
    salud --> aud
    ops --> aud
```

---

## 1. Personal — núcleo de funcionarios

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ PERIODOS_SERVICIO : "ciclos"
    FUNCIONARIOS ||--o{ HISTORICO_JERARQUIAS : "ascensos"
    FUNCIONARIOS ||--o{ HISTORICO_UBICACIONES : "movimientos"
    FUNCIONARIOS ||--o{ HISTORICO_CONDICIONES : "transiciones"
    FUNCIONARIOS ||--o{ HISTORICO_NUMEROS_EQUIPO : "asignaciones"
    FUNCIONARIOS ||--o{ DIRECCIONES : "tiene"
    FUNCIONARIOS ||--o{ CARGA_FAMILIAR : "dependientes"
    FUNCIONARIOS ||--o{ EDUCACION : "titulos"
    FUNCIONARIOS ||--o{ HABILIDADES : "skills"
    FUNCIONARIOS ||--o{ ACTIVIDADES : "extras"
    FUNCIONARIOS ||--o{ TIEMPO_ADMPUBLICA : "previo"
    FUNCIONARIOS ||--o{ CUENTAS_BANCARIAS : "cuentas"
    FUNCIONARIOS ||--o{ LICENCIAS_CONDUCIR : "renovaciones"
    FUNCIONARIOS ||--o{ CARNETS : "tiene"
    FUNCIONARIOS ||--|| REGISTRO_VOTACION : "tiene"
    FUNCIONARIOS ||--o{ HOGARES_PATRIA : "tiene"
    FUNCIONARIOS ||--o{ GDC_HABITACIONAL : "postula"
    JERARQUIAS ||--o{ FUNCIONARIOS : "actual"
    CARGOS ||--o{ FUNCIONARIOS : "actual"
    CONDICIONES ||--o{ FUNCIONARIOS : "actual"
    ZONAS ||--o{ FUNCIONARIOS : "asignados"
    ESTACIONES ||--o{ FUNCIONARIOS : "asignados"

    FUNCIONARIOS {
        bigint id PK
        char nacionalidad
        int cedula
        text apellidos
        text nombres
        text nombre_completo
        date fecha_nacimiento
        date fecha_primer_ingreso
        smallint jerarquia_id FK
        smallint cargo_id FK
        smallint zona_id FK
        smallint estacion_id FK
        text estatus
        text numero_empleado
        text numero_equipo
    }
    PERIODOS_SERVICIO {
        bigint id PK
        bigint funcionario_id FK
        smallint numero_periodo
        date fecha_ingreso
        date fecha_egreso
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
        smallint tipo_carnet_id FK
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
        boolean es_actual
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
    REGISTRO_VOTACION {
        bigint id PK
        bigint funcionario_id FK
        text centro_electoral
        text mesa
    }
    GDC_HABITACIONAL {
        bigint id PK
        bigint funcionario_id FK
        text codigo_postulacion
        text programa
        text estado
    }
    EDUCACION {
        bigint id PK
        bigint funcionario_id FK
        smallint nivel_id FK
        text titulo
        text institucion
    }
    HABILIDADES {
        bigint id PK
        bigint funcionario_id FK
        text grupo
        text nombre
        text nivel
    }
    ACTIVIDADES {
        bigint id PK
        bigint funcionario_id FK
        text tipo
        text nombre
    }
    TIEMPO_ADMPUBLICA {
        bigint id PK
        bigint funcionario_id FK
        text institucion
        date fecha_inicio
        date fecha_fin
    }
```

---

## 2. Salud

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ REPOSOS : "tiene"
    FUNCIONARIOS ||--o{ LESIONES : "registra"
    FUNCIONARIOS ||--o{ HOSPITALIZACIONES : "ingresa"
    FUNCIONARIOS ||--o{ CONSULTAS : "asiste"
    FUNCIONARIOS ||--o{ HCM : "poliza"
    FUNCIONARIOS ||--o{ EVALUACION_FISICA : "anual"
    FUNCIONARIOS ||--o{ RECURRENCIAS : "analisis"
    DIAGNOSTICOS ||--o{ REPOSOS : "diagnostica"
    DIAGNOSTICOS ||--o{ LESIONES : "diagnostica"
    DIAGNOSTICOS ||--o{ HOSPITALIZACIONES : "diagnostica"
    GRUPOS_DIAGNOSTICOS ||--o{ DIAGNOSTICOS : "agrupa"
    MEDICOS ||--o{ REPOSOS : "firma"
    MEDICOS ||--o{ CONSULTAS : "atiende"
    CENTROS_MEDICOS ||--o{ REPOSOS : "expide"
    CENTROS_MEDICOS ||--o{ HOSPITALIZACIONES : "atiende"
    TIPOS_REPOSO ||--o{ REPOSOS : "clasifica"
    CARGA_FAMILIAR ||--o{ HOSPITALIZACIONES : "familiar"

    REPOSOS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_reposo_id FK
        int diagnostico_id FK
        bigint medico_id FK
        date fecha_inicio
        date fecha_fin
        smallint dias
        text folio
        boolean anulado
    }
    DIAGNOSTICOS {
        int id PK
        text codigo_cie
        smallint grupo_id FK
        text nombre
    }
    MEDICOS {
        bigint id PK
        char nacionalidad
        int cedula
        text apellidos
        text nombres
        text mpps
    }
    CENTROS_MEDICOS {
        bigint id PK
        text rif
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
        numeric imc
        boolean apto
    }
    HCM {
        bigint id PK
        bigint funcionario_id FK
        text poliza
        text aseguradora
        date fecha_inicio
        date fecha_fin
    }
    CONSULTAS {
        bigint id PK
        bigint funcionario_id FK
        bigint medico_id FK
        timestamp fecha
        int diagnostico_id FK
    }
    RECURRENCIAS {
        bigint id PK
        bigint funcionario_id FK
        int diagnostico_id FK
        smallint cantidad_episodios
        int total_dias
    }
```

---

## 3. Operaciones

```mermaid
erDiagram
    ESTACIONES ||--o{ GUARDIAS : "tiene"
    GUARDIAS ||--o{ GUARDIA_FUNCIONARIOS : "asigna"
    FUNCIONARIOS ||--o{ GUARDIA_FUNCIONARIOS : "participa"
    FUNCIONARIOS ||--o{ PERMISOS : "solicita"
    FUNCIONARIOS ||--o{ VACACIONES : "disfruta"
    FUNCIONARIOS ||--o{ COMISIONES_SERVICIO : "asignado"
    FUNCIONARIOS ||--o{ FALTAS : "cometio"
    FUNCIONARIOS ||--o{ PROCESOS_ADMINISTRATIVOS : "expediente"
    FUNCIONARIOS ||--o{ SOLICITUDES_PERMISO : "envia"
    INSTITUCIONES ||--o{ COMISIONES_SERVICIO : "recibe"

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
        smallint dias_calendario
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
    PROCESOS_ADMINISTRATIVOS {
        bigint id PK
        bigint funcionario_id FK
        text expediente
        date fecha_apertura
        text estatus
    }
    SOLICITUDES_PERMISO {
        bigint id PK
        bigint funcionario_id FK
        date fecha_inicio
        date fecha_fin
        text estatus
    }
    ORDENES_GENERALES {
        bigint id PK
        text numero
        date fecha
        text asunto
    }
    ACTIVIDADES_OPERATIVAS {
        bigint id PK
        smallint estacion_id FK
        timestamp fecha
        text tipo
        int parroquia_id FK
    }
```

---

## 4. Carrera

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ ASCENSOS : "asciende"
    FUNCIONARIOS ||--o{ EVALUACIONES : "evaluado"
    FUNCIONARIOS ||--o{ CURSOS_REALIZADOS : "cursa"
    FUNCIONARIOS ||--o{ RECONOCIMIENTOS : "recibe"
    FUNCIONARIOS ||--o{ MERITOS : "acumula"
    PROCESOS_ASCENSO ||--o{ ASCENSOS : "rige"
    JERARQUIAS ||--o{ ASCENSOS : "destino"
    PERIODOS_EVALUACION ||--o{ EVALUACIONES : "periodo"
    PERIODOS_EVALUACION ||--o{ MERITOS : "calcula"
    EVALUACIONES ||--o{ EVALUACIONES_DETALLE : "tiene"
    CATEGORIAS_EVALUAR ||--o{ EVALUACIONES_DETALLE : "categoriza"
    CATEGORIAS_EVALUAR ||--o{ FACTORES_PORCENTAJES : "compone"
    CURSOS ||--o{ CURSOS_REALIZADOS : "instancia"
    CONDECORACIONES ||--o{ RECONOCIMIENTOS : "tipo"
    INSTITUCIONES ||--o{ RECONOCIMIENTOS : "otorga"

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
        text tipo
        numeric nota_total
    }
    EVALUACIONES_DETALLE {
        bigint id PK
        bigint evaluacion_id FK
        smallint categoria_id FK
        smallint factor_id FK
        numeric puntaje
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
    PROCESOS_ASCENSO {
        bigint id PK
        text nombre
        date fecha_inicio
        smallint jerarquia_origen_id FK
        smallint jerarquia_destino_id FK
        text estatus
    }
```

---

## 5. Equipamiento

```mermaid
erDiagram
    TIPOS_PROTECCION ||--o{ PROTECCION_INVENTARIO : "tipo"
    PROTECCION_INVENTARIO ||--o{ PROTECCION_ASIGNACIONES : "se_asigna"
    FUNCIONARIOS ||--o{ PROTECCION_ASIGNACIONES : "porta"
    PROTECCION_DESPACHOS ||--o{ PROTECCION_DESPACHO_DETALLE : "detalle"
    TIPOS_UNIFORME ||--o{ UNIFORMES_INVENTARIO : "tipo"
    FUNCIONARIOS ||--o{ UNIFORMES_ASIGNACIONES : "recibe"
    UNIFORMES_DESPACHOS ||--o{ UNIFORMES_DESPACHO_DETALLE : "detalle"
    RADIO_MARCAS ||--o{ RADIO_MODELOS : "marca"
    RADIO_MODELOS ||--o{ RADIOS : "modelo"
    RADIOS ||--o{ RADIO_ASIGNACIONES : "se_asigna"
    RADIOS ||--o{ RADIO_MANTENIMIENTOS : "se_repara"
    FUNCIONARIOS ||--o{ RADIO_ASIGNACIONES : "porta"
    ESTACIONES ||--o{ RADIO_ASIGNACIONES : "ubica"

    TIPOS_PROTECCION {
        smallint id PK
        text codigo
        text nombre
        boolean requiere_talla
        smallint vida_util_meses
    }
    PROTECCION_INVENTARIO {
        bigint id PK
        smallint tipo_id FK
        smallint talla_id FK
        text numero_serie
        text estatus
    }
    PROTECCION_ASIGNACIONES {
        bigint id PK
        bigint inventario_id FK
        bigint funcionario_id FK
        date fecha_entrega
        date fecha_devolucion
    }
    PROTECCION_DESPACHOS {
        bigint id PK
        text numero
        date fecha
        smallint estacion_id FK
        text tipo_movimiento
    }
    PROTECCION_DESPACHO_DETALLE {
        bigint id PK
        bigint despacho_id FK
        bigint inventario_id FK
        int cantidad
    }
    TIPOS_UNIFORME {
        smallint id PK
        text codigo
        text nombre
    }
    UNIFORMES_INVENTARIO {
        bigint id PK
        smallint tipo_id FK
        smallint talla_id FK
        int cantidad_disponible
    }
    UNIFORMES_ASIGNACIONES {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_id FK
        date fecha_entrega
    }
    UNIFORMES_DESPACHOS {
        bigint id PK
        text numero
        date fecha
    }
    UNIFORMES_DESPACHO_DETALLE {
        bigint id PK
        bigint despacho_id FK
        smallint tipo_id FK
        int cantidad
    }
    RADIOS {
        bigint id PK
        smallint modelo_id FK
        text serial
        smallint estacion_id FK
        text estatus
    }
    RADIO_MARCAS {
        smallint id PK
        text codigo
        text nombre
    }
    RADIO_MODELOS {
        smallint id PK
        smallint marca_id FK
        text codigo
        text nombre
    }
    RADIO_ASIGNACIONES {
        bigint id PK
        bigint radio_id FK
        bigint funcionario_id FK
        smallint estacion_id FK
        date fecha_asignacion
        date fecha_devolucion
    }
    RADIO_MANTENIMIENTOS {
        bigint id PK
        bigint radio_id FK
        date fecha_ingreso
        date fecha_salida
        numeric costo
    }
```

---

## 6. Beneficios, vivienda, egresos

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ AYUDAS : "solicita"
    FUNCIONARIOS ||--o{ ENTREGAS : "recibe"
    FUNCIONARIOS ||--o{ POSTULACIONES_VIVIENDA : "postula"
    FUNCIONARIOS ||--o{ CASOS_SOCIALES : "atendido"
    FUNCIONARIOS ||--o{ SOLICITUDES_JUBILACION : "solicita"
    FUNCIONARIOS ||--|| PRE_JUBILADOS : "es"
    FUNCIONARIOS ||--|| JUBILADOS : "es"
    FUNCIONARIOS ||--|| FALLECIMIENTOS : "registra"
    TIPOS_SOLICITUD ||--o{ AYUDAS : "tipo"
    TIPOS_BENEFICIO ||--o{ ENTREGAS : "tipo"
    AYUDAS ||--o{ AYUDA_DETALLE : "tiene"
    ENTREGAS ||--o{ ENTREGA_PAGOS : "tiene"
    PROGRAMAS_VIVIENDA ||--o{ POSTULACIONES_VIVIENDA : "incluye"
    POSTULACIONES_VIVIENDA ||--|| ADJUDICACIONES : "resulta"
    CASOS_SOCIALES ||--o{ VISITAS_SOCIALES : "visitas"

    AYUDAS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_solicitud_id FK
        numeric monto_solicitado
        numeric monto_aprobado
        text estatus
        date fecha_solicitud
    }
    AYUDA_DETALLE {
        bigint id PK
        bigint ayuda_id FK
        text concepto
        numeric monto_total
    }
    ENTREGAS {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_beneficio_id FK
        text periodo
        numeric monto
    }
    ENTREGA_PAGOS {
        bigint id PK
        bigint entrega_id FK
        numeric monto
        date fecha
    }
    POSTULACIONES_VIVIENDA {
        bigint id PK
        smallint programa_id FK
        bigint funcionario_id FK
        text estatus
    }
    ADJUDICACIONES {
        bigint id PK
        bigint postulacion_id FK
        date fecha_adjudicacion
        text direccion
    }
    CASOS_SOCIALES {
        bigint id PK
        bigint funcionario_id FK
        text tipo_caso
        date fecha_apertura
        text estatus
    }
    VISITAS_SOCIALES {
        bigint id PK
        bigint caso_id FK
        date fecha
        bigint visitador_id FK
    }
    PRE_JUBILADOS {
        bigint id PK
        bigint funcionario_id FK
        date fecha_inicio
        numeric pension_estimada
    }
    JUBILADOS {
        bigint id PK
        bigint funcionario_id FK
        date fecha_jubilacion
        numeric anios_servicio
        numeric pension_mensual
    }
    FALLECIMIENTOS {
        bigint id PK
        bigint funcionario_id FK
        date fecha_fallecimiento
        boolean en_servicio
    }
    SOLICITUDES_JUBILACION {
        bigint id PK
        bigint funcionario_id FK
        date fecha_solicitud
        text estatus
    }
    PROGRAMAS_VIVIENDA {
        smallint id PK
        text codigo
        text nombre
        int cupos_total
    }
    TIPOS_SOLICITUD {
        smallint id PK
        text codigo
        text nombre
    }
    TIPOS_BENEFICIO {
        smallint id PK
        text codigo
        text nombre
        text periodicidad
    }
```

---

## 7. Documentos y seguridad

```mermaid
erDiagram
    FUNCIONARIOS ||--o{ ACERVO : "documentos"
    TIPOS_DOCUMENTO ||--o{ ACERVO : "tipo"
    FUNCIONARIOS ||--o{ OFICIOS : "remite"
    OFICIOS ||--o{ OFICIOS_DESTINATARIOS : "envia_a"
    ACTAS ||--o{ ACTAS_ASISTENTES : "asiste"
    FUNCIONARIOS ||--o{ FIRMAS_AUTORIZADAS : "firma"
    USUARIOS ||--|| FUNCIONARIOS : "vincula"
    ROLES ||--o{ ROL_PERMISOS : "tiene"
    MODULOS ||--o{ ROL_PERMISOS : "asigna"
    USUARIOS ||--o{ USUARIO_ROLES : "tiene"
    ROLES ||--o{ USUARIO_ROLES : "asigna"
    USUARIOS ||--o{ USUARIO_PERMISOS : "override"
    USUARIOS ||--o{ USUARIO_SCOPES : "alcance"
    USUARIOS ||--o{ SESIONES : "inicia"
    USUARIOS ||--o{ LOG_ACCESOS : "registra"

    USUARIOS {
        bigint id PK
        bigint funcionario_id FK
        citext usuario
        text password_hash
        boolean activo
        boolean bloqueado
        boolean mfa_activo
    }
    ROLES {
        smallint id PK
        text codigo
        text nombre
    }
    MODULOS {
        smallint id PK
        text codigo
        text nombre
    }
    ROL_PERMISOS {
        smallint rol_id FK
        smallint modulo_id FK
        boolean puede_ver
        boolean puede_crear
        boolean puede_editar
    }
    USUARIO_ROLES {
        bigint usuario_id FK
        smallint rol_id FK
    }
    USUARIO_PERMISOS {
        bigint usuario_id FK
        smallint modulo_id FK
        boolean puede_ver
    }
    USUARIO_SCOPES {
        bigint id PK
        bigint usuario_id FK
        smallint zona_id FK
        smallint estacion_id FK
    }
    SESIONES {
        uuid id PK
        bigint usuario_id FK
        text token_hash
        timestamp expira_at
    }
    ACERVO {
        bigint id PK
        bigint funcionario_id FK
        smallint tipo_documento_id FK
        text titulo
        text documento_url
    }
    OFICIOS {
        bigint id PK
        text numero
        date fecha
        text asunto
        bigint remitente_id FK
    }
    OFICIOS_DESTINATARIOS {
        bigint id PK
        bigint oficio_id FK
        bigint funcionario_id FK
        boolean es_copia
    }
    ACTAS {
        bigint id PK
        text numero
        date fecha
        text tipo
    }
    ACTAS_ASISTENTES {
        bigint id PK
        bigint acta_id FK
        bigint funcionario_id FK
        boolean firmo
    }
    FIRMAS_AUTORIZADAS {
        bigint id PK
        bigint funcionario_id FK
        text cargo_firma
        date fecha_inicio
        boolean activa
    }
    LOG_CAMBIOS {
        bigint id PK
        text schema_name
        text table_name
        char operacion
        text valor_anterior
        text valor_nuevo
        bigint usuario_id
        timestamp fecha
    }
    LOG_ACCESOS {
        bigint id PK
        bigint usuario_id FK
        text tipo_evento
        timestamp fecha
    }
    TIPOS_DOCUMENTO {
        smallint id PK
        text codigo
        text nombre
    }
```

---

## Convenciones

- `||--o{` = uno a muchos
- `||--||` = uno a uno
- `PK` = primary key · `FK` = foreign key
- Las cajas muestran solo columnas clave. El esquema completo está en
  [`../sql/02_dominio.sql`](../sql/02_dominio.sql) y en [`schema.dbml`](./schema.dbml).
