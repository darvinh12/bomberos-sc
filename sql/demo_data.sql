-- =============================================================================
-- DATOS DEMO — pruebas / desarrollo local
-- Carga después de 04_seed.sql.  Eliminar con  TRUNCATE … RESTART IDENTITY CASCADE.
-- Todos los registros tienen apellido "DEMO" para identificar/limpiar fácilmente.
-- =============================================================================

\echo 'Cargando datos demo...'

-- ----- Funcionarios demo (50 personas con nombres realistas) -----
WITH cedulas AS (
    SELECT generate_series(11000000, 11000049) AS c
), nombres AS (
    SELECT * FROM (VALUES
        ('GARCIA','Carlos','M'),('RODRIGUEZ','Maria','F'),('PEREZ','Juan','M'),
        ('GONZALEZ','Ana','F'),('MARTINEZ','Luis','M'),('LOPEZ','Sofia','F'),
        ('HERNANDEZ','Jose','M'),('FERNANDEZ','Carmen','F'),('SANCHEZ','David','M'),
        ('TORRES','Lucia','F'),('RAMIREZ','Miguel','M'),('FLORES','Elena','F'),
        ('RIVERA','Fernando','M'),('GOMEZ','Patricia','F'),('DIAZ','Alejandro','M'),
        ('CRUZ','Isabel','F'),('REYES','Roberto','M'),('MORALES','Andrea','F'),
        ('GUTIERREZ','Sergio','M'),('ORTIZ','Valentina','F'),('CHAVEZ','Diego','M'),
        ('RAMOS','Camila','F'),('JIMENEZ','Andres','M'),('VARGAS','Laura','F'),
        ('CASTRO','Ricardo','M'),('ROMERO','Daniela','F'),('ALVAREZ','Eduardo','M'),
        ('MENDOZA','Gabriela','F'),('SUAREZ','Manuel','M'),('NAVARRO','Adriana','F'),
        ('ROJAS','Mario','M'),('MEDINA','Veronica','F'),('AGUILAR','Pedro','M'),
        ('CONTRERAS','Beatriz','F'),('SILVA','Ernesto','M'),('VELASQUEZ','Monica','F'),
        ('MORENO','Hector','M'),('GUERRERO','Cristina','F'),('LARA','Oscar','M'),
        ('MOLINA','Patricia','F'),('SOTO','Jorge','M'),('SALAZAR','Rosa','F'),
        ('CABRERA','Alberto','M'),('PAREDES','Yolanda','F'),('PINEDA','Felipe','M'),
        ('BLANCO','Margarita','F'),('VEGA','Antonio','M'),('CARDOZO','Elizabeth','F'),
        ('PARRA','Francisco','M'),('SANDOVAL','Teresa','F')
    ) AS t(apellido, nombre, sexo)
), pares AS (
    SELECT cedulas.c, nombres.apellido || ' DEMO' AS apellido,
           nombres.nombre, nombres.sexo,
           ROW_NUMBER() OVER () - 1 AS i
      FROM cedulas
      JOIN nombres ON ROW_NUMBER() OVER (ORDER BY cedulas.c)
                  = ROW_NUMBER() OVER (ORDER BY nombres.apellido)
)
INSERT INTO personal.funcionarios (
    nacionalidad, cedula, apellidos, nombres, sexo,
    fecha_nacimiento, fecha_primer_ingreso,
    tipo_personal, estatus,
    jerarquia_id, cargo_id, condicion_id,
    zona_id, estacion_id, division_id,
    correo, telefono_movil,
    iutb, egresado_unes,
    nivel_educativo_id, especialidad_id,
    created_at, updated_at
)
SELECT
    'V', c, apellido, nombre, sexo,
    CURRENT_DATE - INTERVAL '25 years' - (i || ' months')::interval,
    CURRENT_DATE - INTERVAL '8 years' + (i || ' days')::interval,
    'BOMBERO',
    (CASE
        WHEN i % 23 = 0 THEN 'REPOSO'
        WHEN i % 17 = 0 THEN 'COMISION'
        WHEN i % 31 = 0 THEN 'PRE_JUBILADO'
        ELSE 'ACTIVO'
    END)::core.estatus_funcionario,
    -- Distribución de jerarquías
    (SELECT id FROM core.jerarquias WHERE codigo = (
        CASE
            WHEN i % 30 < 15 THEN 'BOMBERO'
            WHEN i % 30 < 22 THEN 'DISTINGUIDO'
            WHEN i % 30 < 25 THEN 'CABO_2DO'
            WHEN i % 30 < 27 THEN 'SARGENTO_2DO'
            WHEN i % 30 < 29 THEN 'SUBTENIENTE'
            ELSE 'TENIENTE'
        END
    )),
    (SELECT id FROM core.cargos WHERE codigo='OPERATIVO'),
    (SELECT id FROM core.condiciones WHERE codigo='FUNCIONARIO'),
    (SELECT id FROM org.zonas ORDER BY id LIMIT 1 OFFSET (i % 6)),
    NULL, NULL,  -- estacion_id y division_id se pueden poblar después si hay datos
    'demo' || c || '@bomberos.gob.ve',
    '0414-' || lpad((1000000 + i)::text, 7, '0'),
    (i % 7 = 0),
    (i % 5 = 0),
    (SELECT id FROM core.niveles_educativos WHERE codigo='SECUNDARIA'),
    (SELECT id FROM core.especialidades ORDER BY id LIMIT 1 OFFSET (i % 11)),
    now(), now()
FROM pares
ON CONFLICT (nacionalidad, cedula) DO NOTHING;

-- ----- Períodos de servicio (1 por funcionario, abierto) -----
INSERT INTO personal.periodos_servicio (
    funcionario_id, numero_periodo, fecha_ingreso, tipo_ingreso, motivo, created_at, updated_at
)
SELECT
    f.id, 1, f.fecha_primer_ingreso, 'INGRESO',
    'Promoción demo ' || EXTRACT(YEAR FROM f.fecha_primer_ingreso),
    now(), now()
FROM personal.funcionarios f
WHERE f.apellidos LIKE '%DEMO'
  AND NOT EXISTS (SELECT 1 FROM personal.periodos_servicio ps WHERE ps.funcionario_id = f.id);

-- ----- Reposos demo (10 reposos vigentes) -----
INSERT INTO salud.reposos (
    funcionario_id, tipo_reposo_id, diagnostico_id, fecha_inicio, fecha_fin,
    folio, observaciones, created_at, updated_at
)
SELECT
    f.id,
    (SELECT id FROM core.tipos_reposo WHERE codigo='ORDINARIO'),
    (SELECT id FROM salud.diagnosticos WHERE codigo_cie='J11' LIMIT 1),
    CURRENT_DATE - 3,
    CURRENT_DATE + 4,
    'DEMO-' || f.id,
    'Reposo demo (eliminable)',
    now(), now()
FROM personal.funcionarios f
WHERE f.apellidos LIKE '%DEMO'
  AND f.estatus = 'REPOSO'
LIMIT 10;

-- ----- Vacaciones demo (15 vacaciones del año actual) -----
INSERT INTO ops.vacaciones (
    funcionario_id, periodo_anio, fecha_inicio, fecha_fin, dias_habiles,
    autorizado, created_at
)
SELECT
    f.id,
    EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT,
    CURRENT_DATE - (10 + (ROW_NUMBER() OVER ())::int) * 7,
    CURRENT_DATE - (10 + (ROW_NUMBER() OVER ())::int) * 7 + 14,
    15,
    TRUE,
    now()
FROM personal.funcionarios f
WHERE f.apellidos LIKE '%DEMO'
  AND f.estatus = 'ACTIVO'
LIMIT 15
ON CONFLICT DO NOTHING;

-- ----- Guardias demo (próximos 7 días, 1 estación si existe) -----
INSERT INTO ops.guardias (fecha, estacion_id, seccion, turno, hora_inicio, hora_fin, created_at)
SELECT
    CURRENT_DATE + d,
    (SELECT id FROM org.estaciones ORDER BY id LIMIT 1),
    'A',
    '24H',
    '07:00'::time,
    '07:00'::time,
    now()
FROM generate_series(0, 6) d
WHERE EXISTS (SELECT 1 FROM org.estaciones)
ON CONFLICT (fecha, estacion_id, seccion, turno) DO NOTHING;

-- ----- Resumen -----
DO $$
DECLARE
    v_func INT;
    v_repos INT;
    v_vac INT;
    v_guardias INT;
BEGIN
    SELECT COUNT(*) INTO v_func FROM personal.funcionarios WHERE apellidos LIKE '%DEMO';
    SELECT COUNT(*) INTO v_repos FROM salud.reposos r JOIN personal.funcionarios f ON f.id=r.funcionario_id WHERE f.apellidos LIKE '%DEMO';
    SELECT COUNT(*) INTO v_vac FROM ops.vacaciones v JOIN personal.funcionarios f ON f.id=v.funcionario_id WHERE f.apellidos LIKE '%DEMO';
    SELECT COUNT(*) INTO v_guardias FROM ops.guardias WHERE fecha >= CURRENT_DATE;
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Datos demo cargados:';
    RAISE NOTICE '  - Funcionarios DEMO: %', v_func;
    RAISE NOTICE '  - Reposos demo:       %', v_repos;
    RAISE NOTICE '  - Vacaciones demo:    %', v_vac;
    RAISE NOTICE '  - Guardias demo:      %', v_guardias;
    RAISE NOTICE '----------------------------------------------------';
    RAISE NOTICE 'Para limpiar:  sql/demo_data_clean.sql';
    RAISE NOTICE '====================================================';
END $$;
