-- =============================================================================
-- 14 — Auditoría: excluir columnas sensibles + disparadores faltantes
--
-- (a) aud.fn_audit() guardaba la fila completa en JSONB (valor_anterior,
--     valor_nuevo, campos_cambiados). En seguridad.usuarios eso incluía
--     password_hash, mfa_secret y token_recuperacion: cualquier usuario con
--     acceso a la bitácora podía leer los hashes de contraseña.
--     Se redefine la función para quitar esas claves del JSONB. Cuando cambia
--     una columna sensible, solo se deja constancia del NOMBRE de la columna en
--     campos_cambiados->'_campos_sensibles_modificados', nunca de su valor.
--
-- (b) Las tablas creadas después de 03_funciones_vistas.sql (scripts 08, 10 y
--     12) no recibieron el disparador de auditoría: el bucle de 03 solo cubre
--     las tablas existentes en ese momento. Se adjunta aquí.
--
-- (c) Se sanean los registros históricos de aud.log_cambios que ya contenían
--     columnas sensibles.
--
-- Idempotente: puede ejecutarse varias veces.
-- =============================================================================

-- Lista única de columnas que NUNCA deben copiarse a la bitácora.
CREATE OR REPLACE FUNCTION aud.fn_columnas_sensibles()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY['password_hash', 'mfa_secret', 'token_recuperacion']::TEXT[];
$$;

COMMENT ON FUNCTION aud.fn_columnas_sensibles() IS
    'Columnas excluidas del JSONB de aud.log_cambios (secretos y hashes).';

CREATE OR REPLACE FUNCTION aud.fn_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_sensibles TEXT[] := aud.fn_columnas_sensibles();
    v_old       JSONB;
    v_new       JSONB;
    v_diff      JSONB;
    v_sens_mod  TEXT[];
    v_usuario   BIGINT := NULLIF(current_setting('app.usuario_id', TRUE), '')::BIGINT;
    v_nombre    TEXT   := NULLIF(current_setting('app.usuario_nombre', TRUE), '');
    v_ip        INET   := NULLIF(current_setting('app.usuario_ip', TRUE), '')::INET;
    v_reg_id    TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD) - v_sensibles;
        v_reg_id := COALESCE(v_old->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_anterior, usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'D',
                v_old, v_usuario, v_nombre, v_ip);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);

        -- Columnas sensibles que cambiaron (solo el nombre, nunca el valor).
        SELECT array_agg(k ORDER BY k) INTO v_sens_mod
          FROM unnest(v_sensibles) AS k
         WHERE v_new ? k
           AND (v_old->k) IS DISTINCT FROM (v_new->k);

        v_old := v_old - v_sensibles;
        v_new := v_new - v_sensibles;

        SELECT jsonb_object_agg(key, value) INTO v_diff
          FROM jsonb_each(v_new) e
         WHERE NOT (v_old @> jsonb_build_object(e.key, e.value));

        IF v_sens_mod IS NOT NULL THEN
            v_diff := COALESCE(v_diff, '{}'::jsonb)
                      || jsonb_build_object('_campos_sensibles_modificados', to_jsonb(v_sens_mod));
        END IF;

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
        v_new := to_jsonb(NEW) - v_sensibles;
        v_reg_id := COALESCE(v_new->>'id','');
        INSERT INTO aud.log_cambios(schema_name, table_name, registro_id, operacion,
                                     valor_nuevo, usuario_id, usuario_nombre, ip)
        VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, v_reg_id, 'I',
                v_new, v_usuario, v_nombre, v_ip);
        RETURN NEW;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- (b) Disparadores de auditoría en las 12 tablas que no los tenían
-- -----------------------------------------------------------------------------
-- 08_catalogos_ola1.sql
SELECT sys.fn_attach_audit('core', 'tipos_personal');
SELECT sys.fn_attach_audit('core', 'estatus_funcionarios');
SELECT sys.fn_attach_audit('core', 'instituciones_formadoras');
SELECT sys.fn_attach_audit('core', 'tipos_vivienda');
SELECT sys.fn_attach_audit('core', 'tenencias_vivienda');
-- 10_catalogos_mini_sprint.sql
SELECT sys.fn_attach_audit('core', 'parentescos');
SELECT sys.fn_attach_audit('core', 'tipos_nacionalizacion');
SELECT sys.fn_attach_audit('core', 'idiomas');
SELECT sys.fn_attach_audit('core', 'paises');
SELECT sys.fn_attach_audit('core', 'secciones_funcionario');
SELECT sys.fn_attach_audit('personal', 'funcionario_idiomas');
-- 12_permisos_recursos.sql
SELECT sys.fn_attach_audit('seguridad', 'permisos_recursos');

-- Verificación: ninguna tabla de los esquemas de dominio debe quedar sin
-- disparador de auditoría.
DO $$
DECLARE
    v_faltantes TEXT;
BEGIN
    SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY 1)
      INTO v_faltantes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('core','geo','org','personal','salud','ops','carrera',
                         'equipo','beneficios','vivienda','egresos','documentos',
                         'seguridad','sys')
       AND NOT EXISTS (
           SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = c.oid
              AND NOT t.tgisinternal
              AND t.tgfoid = 'aud.fn_audit()'::regprocedure
       );
    IF v_faltantes IS NOT NULL THEN
        RAISE WARNING 'Tablas sin disparador de auditoría: %', v_faltantes;
    ELSE
        RAISE NOTICE 'Auditoría: todas las tablas de dominio tienen disparador.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- (c) Sanear la bitácora existente
-- -----------------------------------------------------------------------------
UPDATE aud.log_cambios
   SET valor_anterior   = valor_anterior - aud.fn_columnas_sensibles(),
       valor_nuevo      = valor_nuevo - aud.fn_columnas_sensibles(),
       campos_cambiados = campos_cambiados - aud.fn_columnas_sensibles()
 WHERE valor_anterior   ?| aud.fn_columnas_sensibles()
    OR valor_nuevo      ?| aud.fn_columnas_sensibles()
    OR campos_cambiados ?| aud.fn_columnas_sensibles();
