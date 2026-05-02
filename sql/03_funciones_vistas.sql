-- =============================================================================
-- CUERPO DE BOMBEROS DE CARACAS — Archivo 03/04: Funciones, triggers, vistas
-- =============================================================================

-- =============================================================================
-- 22. FUNCIONES UTILITARIAS
-- =============================================================================

-- Edad en años a partir de fecha de nacimiento
CREATE OR REPLACE FUNCTION sys.fn_edad(p_nacimiento DATE)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE WHEN p_nacimiento IS NULL THEN NULL
                ELSE EXTRACT(YEAR FROM age(p_nacimiento))::INT END;
$$;

-- Antigüedad expresada como años,meses,días (a partir de un solo ingreso)
CREATE OR REPLACE FUNCTION sys.fn_antiguedad(p_ingreso DATE)
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
    SELECT CASE WHEN p_ingreso IS NULL THEN NULL
                ELSE EXTRACT(YEAR  FROM age(p_ingreso))::INT || ' años, ' ||
                     EXTRACT(MONTH FROM age(p_ingreso))::INT || ' meses, ' ||
                     EXTRACT(DAY   FROM age(p_ingreso))::INT || ' días'
           END;
$$;

-- Antigüedad acumulada del funcionario (suma de TODOS sus períodos de servicio)
-- Útil para LOTTT: si reingresó debe sumarse el tiempo de cada ciclo.
CREATE OR REPLACE FUNCTION personal.fn_antiguedad_dias(p_funcionario_id BIGINT)
RETURNS INT
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE(SUM(
              COALESCE(fecha_egreso, CURRENT_DATE) - fecha_ingreso + 1
           ), 0)::INT
      FROM personal.periodos_servicio
     WHERE funcionario_id = p_funcionario_id;
$$;

CREATE OR REPLACE FUNCTION personal.fn_antiguedad_texto(p_funcionario_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_dias INT := personal.fn_antiguedad_dias(p_funcionario_id);
    v_anios INT := v_dias / 365;
    v_resto INT := v_dias % 365;
    v_meses INT := v_resto / 30;
    v_d     INT := v_resto % 30;
BEGIN
    IF v_dias = 0 THEN RETURN NULL; END IF;
    RETURN v_anios || ' años, ' || v_meses || ' meses, ' || v_d || ' días';
END;
$$;

-- Período de servicio activo de un funcionario (0 o 1 fila)
CREATE OR REPLACE FUNCTION personal.fn_periodo_actual(p_funcionario_id BIGINT)
RETURNS SETOF personal.periodos_servicio
LANGUAGE sql STABLE
AS $$
    SELECT *
      FROM personal.periodos_servicio
     WHERE funcionario_id = p_funcionario_id
       AND fecha_egreso IS NULL
     ORDER BY fecha_ingreso DESC
     LIMIT 1;
$$;

-- Cédula formateada (V-12.345.678)
CREATE OR REPLACE FUNCTION sys.fn_cedula_fmt(p_nacionalidad CHAR(1), p_cedula INT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
    SELECT p_nacionalidad || '-' || to_char(p_cedula, 'FM999G999G999');
$$;

-- =============================================================================
-- 23. TRIGGERS GENÉRICOS
-- =============================================================================

-- updated_at automático
CREATE OR REPLACE FUNCTION sys.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Auditoría genérica → escribe a aud.log_cambios usando JSONB
-- El usuario actual se setea por sesión:  SET LOCAL app.usuario_id = '42';
CREATE OR REPLACE FUNCTION aud.fn_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_old      JSONB;
    v_new      JSONB;
    v_diff     JSONB;
    v_usuario  BIGINT := NULLIF(current_setting('app.usuario_id', TRUE), '')::BIGINT;
    v_nombre   TEXT   := NULLIF(current_setting('app.usuario_nombre', TRUE), '');
    v_ip       INET   := NULLIF(current_setting('app.usuario_ip', TRUE), '')::INET;
    v_reg_id   TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
        v_reg_id := COALESCE(v_old->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_anterior, usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'D',
                v_old, v_usuario, v_nombre, v_ip);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        SELECT jsonb_object_agg(key, value) INTO v_diff
          FROM jsonb_each(v_new) e
         WHERE NOT (v_old @> jsonb_build_object(e.key, e.value));
        IF v_diff IS NULL OR v_diff = '{}'::jsonb THEN
            RETURN NEW;
        END IF;
        v_reg_id := COALESCE(v_new->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_anterior, valor_nuevo, campos_cambiados,
                                     usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'U',
                v_old, v_new, v_diff, v_usuario, v_nombre, v_ip);
        RETURN NEW;
    ELSE  -- INSERT
        v_new := to_jsonb(NEW);
        v_reg_id := COALESCE(v_new->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_nuevo, usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'I',
                v_new, v_usuario, v_nombre, v_ip);
        RETURN NEW;
    END IF;
END;
$$;

-- Helper: aplica updated_at + auditoría a una tabla
CREATE OR REPLACE FUNCTION sys.fn_attach_audit(p_schema TEXT, p_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_qual TEXT := format('%I.%I', p_schema, p_table);
    v_has_updated BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = p_schema
           AND table_name   = p_table
           AND column_name  = 'updated_at'
    ) INTO v_has_updated;

    IF v_has_updated THEN
        EXECUTE format(
            'DROP TRIGGER IF EXISTS tr_%I_set_updated_at ON %s', p_table, v_qual);
        EXECUTE format(
            'CREATE TRIGGER tr_%I_set_updated_at BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION sys.fn_set_updated_at()',
            p_table, v_qual);
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS tr_%I_audit ON %s', p_table, v_qual);
    EXECUTE format(
        'CREATE TRIGGER tr_%I_audit AFTER INSERT OR UPDATE OR DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION aud.fn_audit()',
        p_table, v_qual);
END;
$$;

-- Aplicar a todas las tablas de los schemas de dominio
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND n.nspname IN (
               'core','geo','org','personal','salud','ops','carrera',
               'equipo','beneficios','vivienda','egresos','documentos',
               'seguridad','sys'
           )
    LOOP
        PERFORM sys.fn_attach_audit(r.schema_name, r.table_name);
    END LOOP;
END $$;

-- =============================================================================
-- 24. VISTAS DE NEGOCIO
-- =============================================================================

-- Vista 360° del personal con todas las claves desnormalizadas
CREATE OR REPLACE VIEW personal.v_funcionarios_completo AS
SELECT
    f.id,
    sys.fn_cedula_fmt(f.nacionalidad, f.cedula) AS cedula_formateada,
    f.nacionalidad,
    f.cedula,
    f.apellidos,
    f.nombres,
    f.nombre_completo,
    f.fecha_nacimiento,
    sys.fn_edad(f.fecha_nacimiento)        AS edad,
    f.sexo,
    ec.nombre                              AS estado_civil,
    gs.nombre                              AS grupo_sanguineo,
    f.tipo_personal,
    f.estatus,
    f.numero_empleado,
    f.numero_equipo,
    f.fecha_primer_ingreso,
    pa.fecha_ingreso                       AS fecha_ingreso_actual,
    pa.numero_periodo                      AS numero_periodo_actual,
    (SELECT COUNT(*) FROM personal.periodos_servicio ps
       WHERE ps.funcionario_id = f.id)     AS total_periodos,
    personal.fn_antiguedad_texto(f.id)     AS antiguedad,
    (personal.fn_antiguedad_dias(f.id) / 365) AS antiguedad_anios,
    sys.fn_antiguedad(f.fecha_primer_ingreso) AS antiguedad_desde_primer_ingreso,
    f.promocion,
    j.nombre                               AS jerarquia,
    j.nombre_corto                         AS jerarquia_corta,
    c.nombre                               AS cargo,
    cnd.nombre                             AS condicion,
    z.nombre                               AS zona,
    e.nombre                               AS estacion,
    e.nombre_corto                         AS estacion_corta,
    a.nombre                               AS area,
    d.nombre                               AS dependencia,
    dv.nombre                              AS division,
    f.seccion,
    f.horario,
    f.telefono_movil,
    f.telefono_habitacion,
    f.correo,
    f.persona_contacto,
    f.telefono_contacto,
    ne.nombre                              AS nivel_educativo,
    f.profesion,
    esp.nombre                             AS especialidad,
    f.iutb,
    f.egresado_unes,
    f.pre_jubilado,
    f.es_voluntario,
    f.merito,
    f.foto_url,
    cb.banco_nombre,
    cb.numero_cuenta,
    cb.tipo_cuenta,
    lc.numero AS licencia_numero,
    lc.fecha_vence AS licencia_vence,
    f.created_at,
    f.updated_at
FROM personal.funcionarios f
LEFT JOIN LATERAL personal.fn_periodo_actual(f.id) pa ON TRUE
LEFT JOIN core.estados_civiles    ec ON ec.id = f.estado_civil_id
LEFT JOIN core.grupos_sanguineos  gs ON gs.id = f.grupo_sanguineo_id
LEFT JOIN core.jerarquias         j  ON j.id  = f.jerarquia_id
LEFT JOIN core.cargos             c  ON c.id  = f.cargo_id
LEFT JOIN core.condiciones        cnd ON cnd.id = f.condicion_id
LEFT JOIN org.zonas               z  ON z.id  = f.zona_id
LEFT JOIN org.estaciones          e  ON e.id  = f.estacion_id
LEFT JOIN org.areas               a  ON a.id  = f.area_id
LEFT JOIN org.dependencias        d  ON d.id  = f.dependencia_id
LEFT JOIN org.divisiones          dv ON dv.id = f.division_id
LEFT JOIN core.niveles_educativos ne ON ne.id = f.nivel_educativo_id
LEFT JOIN core.especialidades     esp ON esp.id = f.especialidad_id
LEFT JOIN LATERAL (
    SELECT b.nombre AS banco_nombre, x.numero_cuenta, x.tipo_cuenta
      FROM personal.cuentas_bancarias x
      JOIN core.bancos b ON b.id = x.banco_id
     WHERE x.funcionario_id = f.id AND x.es_actual
     LIMIT 1
) cb ON TRUE
LEFT JOIN LATERAL (
    SELECT numero, fecha_vence
      FROM personal.licencias_conducir
     WHERE funcionario_id = f.id AND es_actual
     ORDER BY fecha_emision DESC
     LIMIT 1
) lc ON TRUE;

-- Reposos vigentes
CREATE OR REPLACE VIEW salud.v_reposos_activos AS
SELECT
    r.id,
    r.funcionario_id,
    f.nombre_completo,
    sys.fn_cedula_fmt(f.nacionalidad, f.cedula) AS cedula,
    j.nombre AS jerarquia,
    r.fecha_inicio,
    r.fecha_fin,
    r.dias,
    tr.nombre AS tipo_reposo,
    d.nombre  AS diagnostico,
    r.diagnostico_libre,
    m.nombre_completo AS medico,
    cm.nombre AS centro_medico,
    CASE WHEN r.fecha_fin >= CURRENT_DATE THEN 'VIGENTE' ELSE 'VENCIDO' END AS estado_vigencia,
    r.observaciones
FROM salud.reposos r
JOIN personal.funcionarios f ON f.id = r.funcionario_id
LEFT JOIN core.jerarquias    j  ON j.id = f.jerarquia_id
LEFT JOIN core.tipos_reposo  tr ON tr.id = r.tipo_reposo_id
LEFT JOIN salud.diagnosticos d  ON d.id = r.diagnostico_id
LEFT JOIN salud.medicos      m  ON m.id = r.medico_id
LEFT JOIN salud.centros_medicos cm ON cm.id = r.centro_medico_id
WHERE NOT r.anulado
  AND r.fecha_fin >= CURRENT_DATE - INTERVAL '60 days';

-- Vacaciones del año en curso
CREATE OR REPLACE VIEW ops.v_vacaciones_actuales AS
SELECT
    v.id,
    v.funcionario_id,
    f.nombre_completo,
    sys.fn_cedula_fmt(f.nacionalidad, f.cedula) AS cedula,
    v.periodo_anio,
    v.fecha_inicio,
    v.fecha_fin,
    v.dias_calendario,
    v.dias_habiles,
    v.bono_pagado,
    v.monto_bono,
    v.autorizado,
    z.nombre AS zona,
    e.nombre AS estacion,
    CASE
        WHEN CURRENT_DATE BETWEEN v.fecha_inicio AND v.fecha_fin THEN 'EN_CURSO'
        WHEN CURRENT_DATE < v.fecha_inicio THEN 'PROGRAMADA'
        ELSE 'CULMINADA'
    END AS estado
FROM ops.vacaciones v
JOIN personal.funcionarios f ON f.id = v.funcionario_id
LEFT JOIN org.zonas       z  ON z.id = f.zona_id
LEFT JOIN org.estaciones  e  ON e.id = f.estacion_id
WHERE v.periodo_anio >= EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT - 1;

-- Distribución de personal por zona y jerarquía
CREATE OR REPLACE VIEW personal.v_distribucion_zona AS
SELECT
    z.id  AS zona_id,
    z.nombre AS zona,
    j.id  AS jerarquia_id,
    j.nombre AS jerarquia,
    COUNT(*)                                       AS total,
    COUNT(*) FILTER (WHERE f.sexo = 'M')           AS hombres,
    COUNT(*) FILTER (WHERE f.sexo = 'F')           AS mujeres,
    COUNT(*) FILTER (WHERE f.estatus = 'ACTIVO')   AS activos,
    COUNT(*) FILTER (WHERE f.estatus = 'REPOSO')   AS en_reposo,
    COUNT(*) FILTER (WHERE f.estatus = 'COMISION') AS en_comision
FROM personal.funcionarios f
LEFT JOIN org.zonas         z ON z.id = f.zona_id
LEFT JOIN core.jerarquias   j ON j.id = f.jerarquia_id
WHERE f.estatus IN ('ACTIVO','REPOSO','COMISION')
GROUP BY z.id, z.nombre, j.id, j.nombre, j.orden
ORDER BY z.nombre, j.orden;

-- Inventario de protección con disponibilidad
CREATE OR REPLACE VIEW equipo.v_inventario_disponible AS
SELECT
    tp.codigo                AS tipo_codigo,
    tp.nombre                AS tipo,
    t.nombre                 AS talla,
    e.nombre                 AS estacion,
    COUNT(*)                                          AS total,
    COUNT(*) FILTER (WHERE i.estatus = 'DISPONIBLE')  AS disponibles,
    COUNT(*) FILTER (WHERE i.estatus = 'ASIGNADO')    AS asignados,
    COUNT(*) FILTER (WHERE i.estatus = 'BAJA')        AS dados_de_baja,
    COUNT(*) FILTER (WHERE i.estatus = 'REPARACION')  AS en_reparacion
FROM equipo.proteccion_inventario i
JOIN equipo.tipos_proteccion tp ON tp.id = i.tipo_id
LEFT JOIN core.tallas        t  ON t.id  = i.talla_id
LEFT JOIN org.estaciones     e  ON e.id  = i.estacion_id
GROUP BY tp.codigo, tp.nombre, t.nombre, e.nombre;

-- Estadísticas globales (dashboard)
CREATE OR REPLACE VIEW sys.v_dashboard AS
SELECT
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'ACTIVO')        AS personal_activo,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'JUBILADO')      AS personal_jubilado,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'REPOSO')        AS personal_reposo,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'COMISION')      AS personal_comision,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'PRE_JUBILADO')  AS personal_pre_jubilado,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'FALLECIDO')     AS personal_fallecido,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'ACTIVO' AND sexo='M') AS hombres,
    (SELECT COUNT(*) FROM personal.funcionarios WHERE estatus = 'ACTIVO' AND sexo='F') AS mujeres,
    (SELECT COUNT(*) FROM salud.reposos WHERE NOT anulado AND fecha_fin >= CURRENT_DATE) AS reposos_vigentes,
    (SELECT COUNT(*) FROM ops.vacaciones WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin) AS vacaciones_en_curso,
    (SELECT COUNT(*) FROM ops.permisos WHERE fecha_inicio = CURRENT_DATE AND autorizado) AS permisos_hoy,
    (SELECT COUNT(*) FROM personal.postulados WHERE estatus = 'PENDIENTE') AS postulados_pendientes,
    (SELECT COUNT(*) FROM beneficios.ayudas WHERE estatus = 'PENDIENTE')   AS ayudas_pendientes;

-- =============================================================================
-- 25. STORED PROCEDURES / FUNCIONES DE NEGOCIO
-- =============================================================================

-- Búsqueda fuzzy de personal
CREATE OR REPLACE FUNCTION personal.fn_buscar(
    p_busqueda TEXT DEFAULT NULL,
    p_zona_id  SMALLINT DEFAULT NULL,
    p_jerarquia_id SMALLINT DEFAULT NULL,
    p_estatus  core.estatus_funcionario DEFAULT 'ACTIVO',
    p_limite   INT DEFAULT 50
)
RETURNS SETOF personal.v_funcionarios_completo
LANGUAGE sql STABLE
AS $$
    SELECT *
    FROM personal.v_funcionarios_completo v
    WHERE (p_busqueda IS NULL
           OR v.nombre_completo ILIKE '%'||p_busqueda||'%'
           OR v.cedula::TEXT ILIKE '%'||p_busqueda||'%'
           OR v.numero_empleado ILIKE '%'||p_busqueda||'%')
      AND (p_zona_id IS NULL OR v.zona = (SELECT nombre FROM org.zonas WHERE id = p_zona_id))
      AND (p_jerarquia_id IS NULL OR v.jerarquia = (SELECT nombre FROM core.jerarquias WHERE id = p_jerarquia_id))
      AND v.estatus = p_estatus
    ORDER BY v.apellidos, v.nombres
    LIMIT p_limite;
$$;

-- Actualizar estatus del funcionario al crear/cerrar reposo
CREATE OR REPLACE FUNCTION salud.fn_sync_estatus_reposo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NOT NEW.anulado AND CURRENT_DATE BETWEEN NEW.fecha_inicio AND NEW.fecha_fin THEN
        UPDATE personal.funcionarios SET estatus = 'REPOSO'
         WHERE id = NEW.funcionario_id AND estatus = 'ACTIVO';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reposos_sync_estatus ON salud.reposos;
CREATE TRIGGER tr_reposos_sync_estatus
AFTER INSERT ON salud.reposos
FOR EACH ROW EXECUTE FUNCTION salud.fn_sync_estatus_reposo();

-- Sincronizar histórico al cambiar jerarquía/ubicación
CREATE OR REPLACE FUNCTION personal.fn_sync_historicos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.jerarquia_id IS DISTINCT FROM NEW.jerarquia_id AND NEW.jerarquia_id IS NOT NULL THEN
            UPDATE personal.historico_jerarquias
               SET fecha_fin = CURRENT_DATE - 1
             WHERE funcionario_id = NEW.id AND fecha_fin IS NULL;
            INSERT INTO personal.historico_jerarquias (funcionario_id, jerarquia_id, fecha_inicio, motivo)
            VALUES (NEW.id, NEW.jerarquia_id, CURRENT_DATE, 'CAMBIO');
        END IF;

        IF (OLD.zona_id, OLD.estacion_id, OLD.area_id, OLD.dependencia_id, OLD.division_id, OLD.cargo_id)
           IS DISTINCT FROM
           (NEW.zona_id, NEW.estacion_id, NEW.area_id, NEW.dependencia_id, NEW.division_id, NEW.cargo_id)
        THEN
            UPDATE personal.historico_ubicaciones
               SET fecha_fin = CURRENT_DATE - 1
             WHERE funcionario_id = NEW.id AND fecha_fin IS NULL;
            INSERT INTO personal.historico_ubicaciones
                (funcionario_id, zona_id, estacion_id, area_id, dependencia_id, division_id, cargo_id, fecha_inicio, motivo)
            VALUES
                (NEW.id, NEW.zona_id, NEW.estacion_id, NEW.area_id, NEW.dependencia_id, NEW.division_id, NEW.cargo_id,
                 CURRENT_DATE, 'CAMBIO');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_funcionarios_sync_historicos ON personal.funcionarios;
CREATE TRIGGER tr_funcionarios_sync_historicos
AFTER UPDATE ON personal.funcionarios
FOR EACH ROW EXECUTE FUNCTION personal.fn_sync_historicos();

-- Calcular mérito de un funcionario en un período
CREATE OR REPLACE FUNCTION carrera.fn_calcular_merito(
    p_funcionario_id BIGINT,
    p_periodo_id     SMALLINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    v_eval   NUMERIC := 0;
    v_curso  NUMERIC := 0;
    v_acti   NUMERIC := 0;
    v_cond   NUMERIC := 0;
    v_falta  NUMERIC := 0;
    v_total  NUMERIC := 0;
BEGIN
    SELECT COALESCE(AVG(nota_total), 0)
      INTO v_eval
      FROM carrera.evaluaciones
     WHERE funcionario_id = p_funcionario_id
       AND periodo_id = p_periodo_id;

    SELECT COALESCE(SUM(CASE WHEN aprobado THEN COALESCE(horas,0) ELSE 0 END), 0) * 0.1
      INTO v_curso
      FROM carrera.cursos_realizados
     WHERE funcionario_id = p_funcionario_id;

    SELECT COUNT(*) * 2
      INTO v_acti
      FROM personal.actividades
     WHERE funcionario_id = p_funcionario_id;

    SELECT COUNT(*) * 5
      INTO v_cond
      FROM carrera.reconocimientos
     WHERE funcionario_id = p_funcionario_id;

    SELECT COUNT(*) * -3
      INTO v_falta
      FROM ops.faltas
     WHERE funcionario_id = p_funcionario_id;

    v_total := v_eval + v_curso + v_acti + v_cond + v_falta;

    INSERT INTO carrera.meritos (
        funcionario_id, periodo_id,
        puntaje_evaluacion, puntaje_cursos, puntaje_actividades,
        puntaje_condecoraciones, puntaje_faltas, puntaje_total
    )
    VALUES (
        p_funcionario_id, p_periodo_id,
        v_eval, v_curso, v_acti, v_cond, v_falta, v_total
    )
    ON CONFLICT (funcionario_id, periodo_id) DO UPDATE
       SET puntaje_evaluacion       = EXCLUDED.puntaje_evaluacion,
           puntaje_cursos           = EXCLUDED.puntaje_cursos,
           puntaje_actividades      = EXCLUDED.puntaje_actividades,
           puntaje_condecoraciones  = EXCLUDED.puntaje_condecoraciones,
           puntaje_faltas           = EXCLUDED.puntaje_faltas,
           puntaje_total            = EXCLUDED.puntaje_total,
           fecha_calculo            = now();

    RETURN v_total;
END;
$$;

-- Recalcular puntajes y posiciones de un período completo
CREATE OR REPLACE FUNCTION carrera.fn_recalcular_meritos_periodo(p_periodo_id SMALLINT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT := 0;
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM personal.funcionarios WHERE estatus = 'ACTIVO'
    LOOP
        PERFORM carrera.fn_calcular_merito(r.id, p_periodo_id);
        v_count := v_count + 1;
    END LOOP;

    WITH ordenados AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY puntaje_total DESC NULLS LAST) AS pos
          FROM carrera.meritos
         WHERE periodo_id = p_periodo_id
    )
    UPDATE carrera.meritos m
       SET posicion = o.pos
      FROM ordenados o
     WHERE m.id = o.id;

    RETURN v_count;
END;
$$;

-- =============================================================================
-- 26. SINCRONIZACIÓN DE SNAPSHOTS DESDE TABLAS HISTÓRICAS
-- =============================================================================

-- Vista de períodos de servicio con detalles del funcionario
CREATE OR REPLACE VIEW personal.v_periodos_servicio AS
SELECT
    ps.id,
    ps.funcionario_id,
    sys.fn_cedula_fmt(f.nacionalidad, f.cedula) AS cedula,
    f.nombre_completo,
    j.nombre_corto AS jerarquia,
    ps.numero_periodo,
    ps.fecha_ingreso,
    ps.fecha_egreso,
    (COALESCE(ps.fecha_egreso, CURRENT_DATE) - ps.fecha_ingreso + 1) AS dias_periodo,
    ps.tipo_ingreso,
    ps.tipo_egreso,
    ps.motivo,
    ps.numero_resolucion,
    CASE WHEN ps.fecha_egreso IS NULL THEN 'ACTIVO' ELSE 'CERRADO' END AS estado_periodo,
    ps.documento_url,
    ps.observaciones
FROM personal.periodos_servicio ps
JOIN personal.funcionarios f ON f.id = ps.funcionario_id
LEFT JOIN core.jerarquias    j ON j.id = f.jerarquia_id
ORDER BY ps.funcionario_id, ps.numero_periodo;

-- Trigger: al insertar/cerrar un período, sincroniza funcionarios.estatus
-- y mantiene fecha_primer_ingreso = MIN(fecha_ingreso) de todos los períodos.
CREATE OR REPLACE FUNCTION personal.fn_sync_periodo_servicio()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_primer DATE;
    v_tiene_activo BOOLEAN;
    v_tipo_egreso TEXT;
    v_nuevo_estatus core.estatus_funcionario;
BEGIN
    -- Recalcular primer ingreso histórico
    SELECT MIN(fecha_ingreso) INTO v_primer
      FROM personal.periodos_servicio
     WHERE funcionario_id = COALESCE(NEW.funcionario_id, OLD.funcionario_id);

    -- ¿Tiene período activo?
    SELECT EXISTS (
        SELECT 1 FROM personal.periodos_servicio
         WHERE funcionario_id = COALESCE(NEW.funcionario_id, OLD.funcionario_id)
           AND fecha_egreso IS NULL
    ) INTO v_tiene_activo;

    IF v_tiene_activo THEN
        v_nuevo_estatus := 'ACTIVO';
    ELSE
        -- Buscar último egreso para inferir el estatus
        SELECT tipo_egreso INTO v_tipo_egreso
          FROM personal.periodos_servicio
         WHERE funcionario_id = COALESCE(NEW.funcionario_id, OLD.funcionario_id)
         ORDER BY fecha_egreso DESC NULLS LAST
         LIMIT 1;

        v_nuevo_estatus := CASE v_tipo_egreso
            WHEN 'JUBILACION'    THEN 'JUBILADO'::core.estatus_funcionario
            WHEN 'FALLECIMIENTO' THEN 'FALLECIDO'::core.estatus_funcionario
            ELSE 'EGRESADO'::core.estatus_funcionario
        END;
    END IF;

    UPDATE personal.funcionarios
       SET fecha_primer_ingreso = v_primer,
           estatus = CASE
                       -- Respetar REPOSO/COMISION/SUSPENDIDO si está activo (los administra otra capa)
                       WHEN v_tiene_activo
                            AND estatus IN ('REPOSO','COMISION','SUSPENDIDO','PRE_JUBILADO','PERMISO_LARGO')
                       THEN estatus
                       ELSE v_nuevo_estatus
                     END
     WHERE id = COALESCE(NEW.funcionario_id, OLD.funcionario_id);

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_periodos_sync ON personal.periodos_servicio;
CREATE TRIGGER tr_periodos_sync
AFTER INSERT OR UPDATE OF fecha_ingreso, fecha_egreso, tipo_egreso OR DELETE
ON personal.periodos_servicio
FOR EACH ROW EXECUTE FUNCTION personal.fn_sync_periodo_servicio();

-- Trigger: cuando se inserta histórico_numeros_equipo (sin fecha_fin), actualiza
-- funcionarios.numero_equipo. Cuando se cierra el período, lo limpia si era el actual.
CREATE OR REPLACE FUNCTION personal.fn_sync_numero_equipo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_actual TEXT;
BEGIN
    SELECT numero_equipo INTO v_actual
      FROM personal.historico_numeros_equipo
     WHERE funcionario_id = COALESCE(NEW.funcionario_id, OLD.funcionario_id)
       AND fecha_fin IS NULL
     ORDER BY fecha_inicio DESC
     LIMIT 1;

    UPDATE personal.funcionarios
       SET numero_equipo = v_actual
     WHERE id = COALESCE(NEW.funcionario_id, OLD.funcionario_id);

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_hist_nequipo_sync ON personal.historico_numeros_equipo;
CREATE TRIGGER tr_hist_nequipo_sync
AFTER INSERT OR UPDATE OF numero_equipo, fecha_fin OR DELETE
ON personal.historico_numeros_equipo
FOR EACH ROW EXECUTE FUNCTION personal.fn_sync_numero_equipo();

-- Trigger: cuando se inserta histórico_condiciones (sin fecha_fin), actualiza
-- funcionarios.condicion_id.
CREATE OR REPLACE FUNCTION personal.fn_sync_condicion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_actual SMALLINT;
BEGIN
    SELECT condicion_id INTO v_actual
      FROM personal.historico_condiciones
     WHERE funcionario_id = COALESCE(NEW.funcionario_id, OLD.funcionario_id)
       AND fecha_fin IS NULL
     ORDER BY fecha_inicio DESC
     LIMIT 1;

    UPDATE personal.funcionarios
       SET condicion_id = v_actual
     WHERE id = COALESCE(NEW.funcionario_id, OLD.funcionario_id);

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_hist_condicion_sync ON personal.historico_condiciones;
CREATE TRIGGER tr_hist_condicion_sync
AFTER INSERT OR UPDATE OF condicion_id, fecha_fin OR DELETE
ON personal.historico_condiciones
FOR EACH ROW EXECUTE FUNCTION personal.fn_sync_condicion();

-- Función conveniencia: registra un nuevo ingreso/reingreso del funcionario
-- (cierra cualquier período abierto previo si lo hubiera quedado por error).
CREATE OR REPLACE FUNCTION personal.fn_registrar_ingreso(
    p_funcionario_id BIGINT,
    p_fecha_ingreso  DATE DEFAULT CURRENT_DATE,
    p_tipo_ingreso   TEXT DEFAULT 'INGRESO',
    p_motivo         TEXT DEFAULT NULL,
    p_resolucion     TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_num SMALLINT;
    v_id  BIGINT;
BEGIN
    SELECT COALESCE(MAX(numero_periodo), 0) + 1
      INTO v_num
      FROM personal.periodos_servicio
     WHERE funcionario_id = p_funcionario_id;

    INSERT INTO personal.periodos_servicio
        (funcionario_id, numero_periodo, fecha_ingreso, tipo_ingreso, motivo, numero_resolucion)
    VALUES
        (p_funcionario_id, v_num, p_fecha_ingreso, p_tipo_ingreso, p_motivo, p_resolucion)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Función conveniencia: cierra el período activo (egreso)
CREATE OR REPLACE FUNCTION personal.fn_registrar_egreso(
    p_funcionario_id BIGINT,
    p_fecha_egreso   DATE DEFAULT CURRENT_DATE,
    p_tipo_egreso    TEXT DEFAULT 'RENUNCIA',
    p_motivo         TEXT DEFAULT NULL,
    p_resolucion     TEXT DEFAULT NULL,
    p_base_legal     TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_id BIGINT;
BEGIN
    UPDATE personal.periodos_servicio
       SET fecha_egreso = p_fecha_egreso,
           tipo_egreso  = p_tipo_egreso,
           motivo       = COALESCE(motivo, p_motivo),
           numero_resolucion = COALESCE(numero_resolucion, p_resolucion),
           base_legal   = COALESCE(base_legal, p_base_legal),
           updated_at   = now()
     WHERE funcionario_id = p_funcionario_id
       AND fecha_egreso IS NULL
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'El funcionario % no tiene período activo para egresar.', p_funcionario_id;
    END IF;

    RETURN v_id;
END;
$$;

-- =============================================================================
-- FIN ARCHIVO 03
-- Continúa en 04_seed.sql con datos iniciales (catálogos, usuario admin, etc.).
-- =============================================================================
