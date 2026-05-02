-- =============================================================================
-- CUERPO DE BOMBEROS DE CARACAS — Archivo 04/04: Seeds (datos iniciales)
-- =============================================================================

-- Estados civiles
INSERT INTO core.estados_civiles (codigo, nombre) VALUES
('SOLTERO',     'Soltero(a)'),
('CASADO',      'Casado(a)'),
('DIVORCIADO',  'Divorciado(a)'),
('VIUDO',       'Viudo(a)'),
('CONCUBINATO', 'Unión estable de hecho')
ON CONFLICT (codigo) DO NOTHING;

-- Grupos sanguíneos
INSERT INTO core.grupos_sanguineos (codigo, nombre) VALUES
('A+','A positivo'),('A-','A negativo'),
('B+','B positivo'),('B-','B negativo'),
('AB+','AB positivo'),('AB-','AB negativo'),
('O+','O positivo'),('O-','O negativo')
ON CONFLICT (codigo) DO NOTHING;

-- Niveles educativos
INSERT INTO core.niveles_educativos (codigo, nombre, orden) VALUES
('PRIMARIA',         'Primaria',                                  10),
('SECUNDARIA',       'Secundaria / Bachillerato',                 20),
('TSU',              'Técnico Superior Universitario',            30),
('UNIVERSITARIO',    'Universitario / Licenciatura',              40),
('ESPECIALIZACION',  'Especialización',                           50),
('MAESTRIA',         'Maestría',                                  60),
('DOCTORADO',        'Doctorado',                                 70),
('POSDOCTORADO',     'Postdoctorado',                             80)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO core.tipos_nivel_educativo (codigo, nombre) VALUES
('GRADUADO',  'Graduado'),
('CURSANDO',  'Cursando'),
('ABANDONO',  'Abandonó'),
('PENDIENTE', 'Tesis pendiente')
ON CONFLICT (codigo) DO NOTHING;

-- Especialidades operativas
INSERT INTO core.especialidades (codigo, nombre, descripcion) VALUES
('RESCATE',       'Rescate Vertical / Estructuras', 'Operaciones de rescate técnico'),
('INCENDIOS',     'Combate de Incendios',           'Estructurales, vehiculares y forestales'),
('EMS',           'Emergencias Médicas',            'Atención prehospitalaria, paramédico'),
('HAZMAT',        'Materiales Peligrosos',          'Manejo de incidentes con sustancias peligrosas'),
('USAR',          'Búsqueda y Rescate Urbano',      'Estructuras colapsadas'),
('BUCEO',         'Buceo y Rescate Acuático',       'Operaciones subacuáticas'),
('K9',            'Unidad Canina',                  'Rescate y detección con perros'),
('PILOTO',        'Piloto de Aeronaves',            'Helicópteros / aviones de apoyo'),
('CONDUCTOR',     'Conductor de Unidades',          'Operación de vehículos pesados'),
('OPERADOR_RADIO','Operador de Radio',              'Comunicaciones / centro de despacho'),
('INSTRUCTOR',    'Instructor',                     'Formación y capacitación')
ON CONFLICT (codigo) DO NOTHING;

-- Jerarquías (cuerpo de bomberos venezolano — orden de menor a mayor)
INSERT INTO core.jerarquias (codigo, nombre, nombre_corto, orden, es_oficial, es_tropa, es_estado_mayor) VALUES
('CADETE',           'Cadete',                            'CDT',  5,  FALSE, FALSE, FALSE),
('BOMBERO',          'Bombero',                           'BBO', 10,  FALSE, TRUE,  FALSE),
('DISTINGUIDO',      'Bombero Distinguido',               'BBOD',20,  FALSE, TRUE,  FALSE),
('CABO_2DO',         'Cabo Segundo',                      'C/2', 30,  FALSE, TRUE,  FALSE),
('CABO_1RO',         'Cabo Primero',                      'C/1', 40,  FALSE, TRUE,  FALSE),
('SARGENTO_2DO',     'Sargento Segundo',                  'S/2', 50,  FALSE, TRUE,  FALSE),
('SARGENTO_1RO',     'Sargento Primero',                  'S/1', 60,  FALSE, TRUE,  FALSE),
('SARGENTO_AYUDANTE','Sargento Ayudante',                 'SA',  70,  FALSE, TRUE,  FALSE),
('SARGENTO_MAYOR',   'Sargento Mayor',                    'SM',  80,  FALSE, TRUE,  FALSE),
('SUBTENIENTE',      'Sub-Teniente',                      'STTE',90,  TRUE,  FALSE, FALSE),
('TENIENTE',         'Teniente',                          'TTE',100,  TRUE,  FALSE, FALSE),
('CAPITAN',          'Capitán',                           'CAP',110,  TRUE,  FALSE, FALSE),
('MAYOR',            'Mayor',                             'MY', 120,  TRUE,  FALSE, FALSE),
('TENIENTE_CORONEL', 'Teniente Coronel',                  'TCNL',130, TRUE,  FALSE, FALSE),
('CORONEL',          'Coronel',                           'CNL',140,  TRUE,  FALSE, TRUE),
('GENERAL_BRIGADA',  'General de Brigada',                'G/B',150,  TRUE,  FALSE, TRUE),
('GENERAL_DIVISION', 'General de División',               'G/D',160,  TRUE,  FALSE, TRUE),
('MAYOR_GENERAL',    'Mayor General',                     'MG', 170,  TRUE,  FALSE, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- Cargos comunes
INSERT INTO core.cargos (codigo, nombre, es_jefatura) VALUES
('COMANDANTE_GENERAL',   'Comandante General',                TRUE),
('SEGUNDO_COMANDANTE',   'Segundo Comandante',                TRUE),
('JEFE_ZONA',            'Jefe de Zona',                      TRUE),
('JEFE_ESTACION',        'Jefe de Estación',                  TRUE),
('SUBJEFE_ESTACION',     'Sub-Jefe de Estación',              TRUE),
('JEFE_DIVISION',        'Jefe de División',                  TRUE),
('JEFE_AREA',            'Jefe de Área',                      TRUE),
('JEFE_DEPENDENCIA',     'Jefe de Dependencia',               TRUE),
('JEFE_GUARDIA',         'Jefe de Guardia',                   TRUE),
('OPERATIVO',            'Operativo',                         FALSE),
('ADMINISTRATIVO',       'Administrativo',                    FALSE),
('MEDICO',               'Médico',                            FALSE),
('PARAMEDICO',           'Paramédico',                        FALSE),
('CONDUCTOR',            'Conductor',                         FALSE),
('OPERADOR_RADIO',       'Operador de Radio',                 FALSE),
('INSTRUCTOR',           'Instructor',                        FALSE),
('OBRERO',               'Obrero',                            FALSE)
ON CONFLICT (codigo) DO NOTHING;

-- Condiciones laborales
INSERT INTO core.condiciones (codigo, nombre) VALUES
('FUNCIONARIO',     'Funcionario de carrera'),
('CONTRATADO',      'Contratado'),
('FIJO',            'Personal fijo'),
('OBRERO',          'Obrero'),
('VOLUNTARIO',      'Voluntario'),
('PASANTE',         'Pasante'),
('JUBILADO',        'Jubilado'),
('PRE_JUBILADO',    'Pre-jubilado')
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de reposo
INSERT INTO core.tipos_reposo (codigo, nombre, dias_max, requiere_diagnostico) VALUES
('ORDINARIO',       'Reposo médico ordinario',           7,    TRUE),
('PROLONGADO',      'Reposo prolongado',                 30,   TRUE),
('POSTOPERATORIO',  'Post-operatorio',                   30,   TRUE),
('MATERNIDAD',      'Pre y post natal',                  182,  FALSE),
('PATERNIDAD',      'Permiso por paternidad',            14,   FALSE),
('LACTANCIA',       'Lactancia',                         180,  FALSE),
('ACCIDENTE_TRAB',  'Accidente de trabajo',              NULL, TRUE),
('ENFERMEDAD_GEN',  'Enfermedad general',                NULL, TRUE),
('ENFERMEDAD_OCUP', 'Enfermedad ocupacional',            NULL, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de solicitud (ayudas)
INSERT INTO core.tipos_solicitud (codigo, nombre, descripcion) VALUES
('AYUDA_MEDICA',    'Ayuda médica',           'Cobertura de gastos médicos'),
('AYUDA_FUNERARIA', 'Ayuda funeraria',        'Gastos funerarios'),
('AYUDA_MATERNAL',  'Ayuda maternal',         'Apoyo por nacimiento'),
('AYUDA_MATRIMONIAL','Ayuda matrimonial',     'Apoyo por matrimonio'),
('AYUDA_VIVIENDA',  'Ayuda para vivienda',    'Mejoras / reparación de vivienda'),
('AYUDA_ESCOLAR',   'Ayuda escolar',          'Útiles, uniformes, matrícula'),
('AYUDA_ALIMENTACION','Ayuda de alimentación','Cesta alimenticia especial'),
('AYUDA_TRANSPORTE','Ayuda de transporte',    'Combustible / pasajes'),
('AYUDA_EQUIPOS',   'Equipos médicos',        'Sillas, prótesis, etc.'),
('AYUDA_OTRA',      'Otra',                   'Solicitudes diversas')
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de documento (acervo personal)
INSERT INTO core.tipos_documento (codigo, nombre) VALUES
('CEDULA',           'Cédula de identidad'),
('PARTIDA_NAC',      'Partida de nacimiento'),
('TITULO_BACH',      'Título de bachiller'),
('TITULO_UNIV',      'Título universitario'),
('TITULO_BOMBERIL',  'Título bomberil'),
('CONSTANCIA_TRAB',  'Constancia de trabajo'),
('CONSTANCIA_RESID', 'Constancia de residencia'),
('RIF',              'RIF'),
('CARNET_PATRIA',    'Carnet de la Patria'),
('CARNET_VOTACION',  'Carnet de votación'),
('CARNET_CIVICO',    'Carnet cívico'),
('LICENCIA_COND',    'Licencia de conducir'),
('CERTIF_MEDICO',    'Certificado médico'),
('ASCENSO',          'Resolución de ascenso'),
('SANCION',          'Resolución de sanción'),
('REPOSO',           'Reposo médico'),
('VACACIONES',       'Resolución de vacaciones'),
('COMISION',         'Resolución de comisión'),
('OTRO',             'Otro documento')
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de carnet
INSERT INTO core.tipos_carnet (codigo, nombre) VALUES
('CIVICO',     'Carnet cívico'),
('MILITAR',    'Carnet militar'),
('PATRIA',     'Carnet de la Patria'),
('VOTACION',   'Carnet de votación'),
('VEHICULO',   'Carnet de vehículo'),
('ARMA',       'Porte de arma'),
('SOMOS_VZLA', 'Somos Venezuela'),
('CONDUCIR',   'Licencia de conducir'),
('INSTITUCIONAL','Carnet institucional')
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de licencia de conducir
INSERT INTO core.tipos_licencia (codigo, nombre) VALUES
('1','1ra Grado - Vehículos hasta 3.500 kg'),
('2','2da Grado - Vehículos hasta 7.500 kg'),
('3','3ra Grado - Vehículos pesados'),
('4','4ta Grado - Vehículos articulados'),
('5','5ta Grado - Transporte público'),
('MOTO','Moto')
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de accidente
INSERT INTO core.tipos_accidente (codigo, nombre) VALUES
('SERVICIO',       'En servicio'),
('FORMACION',      'En formación / entrenamiento'),
('TRAYECTO',       'In itinere (camino al trabajo)'),
('NO_LABORAL',     'No laboral'),
('VEHICULAR',      'Vehicular en servicio'),
('CAIDA',          'Caída'),
('QUEMADURA',      'Quemadura'),
('INTOXICACION',   'Intoxicación / inhalación')
ON CONFLICT (codigo) DO NOTHING;

-- Tallas
INSERT INTO core.tallas (codigo, nombre, grupo, orden) VALUES
('XS','XS - Extra Small','ROPA',10),
('S','S - Small','ROPA',20),
('M','M - Medium','ROPA',30),
('L','L - Large','ROPA',40),
('XL','XL - Extra Large','ROPA',50),
('XXL','XXL','ROPA',60),
('XXXL','XXXL','ROPA',70),
('36','36','CALZADO',1),
('37','37','CALZADO',2),
('38','38','CALZADO',3),
('39','39','CALZADO',4),
('40','40','CALZADO',5),
('41','41','CALZADO',6),
('42','42','CALZADO',7),
('43','43','CALZADO',8),
('44','44','CALZADO',9),
('45','45','CALZADO',10),
('46','46','CALZADO',11),
('47','47','CALZADO',12),
('48','48','CALZADO',13),
('CASCO_S','Casco S','CASCO',1),
('CASCO_M','Casco M','CASCO',2),
('CASCO_L','Casco L','CASCO',3),
('CASCO_XL','Casco XL','CASCO',4)
ON CONFLICT (codigo) DO NOTHING;

-- Bancos venezolanos (códigos BCV)
INSERT INTO core.bancos (codigo, nombre) VALUES
('0102','Banco de Venezuela'),
('0104','Venezolano de Crédito'),
('0105','Banco Mercantil'),
('0108','Banco Provincial (BBVA)'),
('0114','Bancaribe'),
('0115','Banco Exterior'),
('0116','Banco Occidental de Descuento'),
('0128','Banco Caroní'),
('0134','Banesco'),
('0137','Banco Sofitasa'),
('0138','Banco Plaza'),
('0146','Banco de la Gente Emprendedora'),
('0151','BFC Banco Fondo Común'),
('0156','100% Banco'),
('0157','DelSur Banco'),
('0163','Banco del Tesoro'),
('0166','Banco Agrícola de Venezuela'),
('0168','Bancrecer'),
('0169','Mi Banco'),
('0171','Banco Activo'),
('0172','Bancamiga'),
('0173','Banco Internacional de Desarrollo'),
('0174','Banplus'),
('0175','Banco Bicentenario'),
('0177','Banco de la FANB'),
('0190','Citibank'),
('0191','Banco Nacional de Crédito')
ON CONFLICT (codigo) DO NOTHING;

-- Geografía: Venezuela (estados — abreviado)
INSERT INTO geo.estados (codigo, nombre, capital) VALUES
('AM','Amazonas','Puerto Ayacucho'),
('AN','Anzoátegui','Barcelona'),
('AP','Apure','San Fernando de Apure'),
('AR','Aragua','Maracay'),
('BA','Barinas','Barinas'),
('BO','Bolívar','Ciudad Bolívar'),
('CA','Carabobo','Valencia'),
('CO','Cojedes','San Carlos'),
('DA','Delta Amacuro','Tucupita'),
('DC','Distrito Capital','Caracas'),
('FA','Falcón','Coro'),
('GU','Guárico','San Juan de los Morros'),
('LA','Lara','Barquisimeto'),
('ME','Mérida','Mérida'),
('MI','Miranda','Los Teques'),
('MO','Monagas','Maturín'),
('NE','Nueva Esparta','La Asunción'),
('PO','Portuguesa','Guanare'),
('SU','Sucre','Cumaná'),
('TA','Táchira','San Cristóbal'),
('TR','Trujillo','Trujillo'),
('VA','Vargas / La Guaira','La Guaira'),
('YA','Yaracuy','San Felipe'),
('ZU','Zulia','Maracaibo')
ON CONFLICT (codigo) DO NOTHING;

-- Municipios y parroquias del Distrito Capital (zona de operación principal)
INSERT INTO geo.municipios (estado_id, codigo, nombre)
SELECT id, 'LIBERTADOR', 'Libertador' FROM geo.estados WHERE codigo='DC'
ON CONFLICT DO NOTHING;

INSERT INTO geo.parroquias (municipio_id, codigo, nombre)
SELECT m.id, p.codigo, p.nombre
FROM geo.municipios m,
     (VALUES
        ('ALTAGRACIA','Altagracia'),
        ('ANTIMANO','Antímano'),
        ('CANDELARIA','La Candelaria'),
        ('CARICUAO','Caricuao'),
        ('CATEDRAL','Catedral'),
        ('COCHE','Coche'),
        ('EL_JUNQUITO','El Junquito'),
        ('EL_PARAISO','El Paraíso'),
        ('EL_RECREO','El Recreo'),
        ('EL_VALLE','El Valle'),
        ('LA_PASTORA','La Pastora'),
        ('LA_VEGA','La Vega'),
        ('MACARAO','Macarao'),
        ('SAN_AGUSTIN','San Agustín'),
        ('SAN_BERNARDINO','San Bernardino'),
        ('SAN_JOSE','San José'),
        ('SAN_JUAN','San Juan'),
        ('SAN_PEDRO','San Pedro'),
        ('SANTA_ROSALIA','Santa Rosalía'),
        ('SANTA_TERESA','Santa Teresa'),
        ('SUCRE_CCS','Sucre (Catia)'),
        ('23_ENERO','23 de Enero')
     ) AS p(codigo, nombre)
WHERE m.codigo = 'LIBERTADOR'
ON CONFLICT DO NOTHING;

-- Zonas operativas (ejemplo Caracas — ajustar según realidad)
INSERT INTO org.zonas (codigo, nombre, descripcion) VALUES
('Z1','Zona 1 - Centro',           'Catedral, Altagracia, Candelaria, San José'),
('Z2','Zona 2 - Oeste',             'Sucre, La Pastora, 23 de Enero'),
('Z3','Zona 3 - Sur Oeste',         'El Paraíso, La Vega, Antímano, Macarao'),
('Z4','Zona 4 - Sur',                'El Valle, Coche, Santa Rosalía'),
('Z5','Zona 5 - Este',               'El Recreo, San Pedro, San Bernardino'),
('Z6','Zona 6 - Caricuao / Junquito','Caricuao, El Junquito')
ON CONFLICT (codigo) DO NOTHING;

-- Divisiones
INSERT INTO org.divisiones (codigo, nombre) VALUES
('OPERATIVA',         'División Operativa'),
('ADMINISTRATIVA',    'División Administrativa'),
('LOGISTICA',         'División de Logística'),
('SALUD',             'División de Salud'),
('FORMACION',         'División de Formación y Educación'),
('PREVENCION',        'División de Prevención e Investigación'),
('COMUNICACIONES',    'División de Comunicaciones'),
('RRHH',              'División de Recursos Humanos'),
('INSPECTORIA',       'Inspectoría General')
ON CONFLICT (codigo) DO NOTHING;

-- Áreas (algunas comunes)
INSERT INTO org.areas (division_id, codigo, nombre)
SELECT id, x.codigo, x.nombre
FROM org.divisiones d,
     (VALUES
        ('RRHH',          'PERSONAL',     'Personal'),
        ('RRHH',          'NOMINA',       'Nómina'),
        ('RRHH',          'BIENESTAR',    'Bienestar Social'),
        ('SALUD',         'CONSULTORIO',  'Consultorio Médico'),
        ('SALUD',         'REPOSOS',      'Reposos y Recurrencias'),
        ('SALUD',         'HCM',          'HCM'),
        ('LOGISTICA',     'UNIFORMES',    'Uniformes'),
        ('LOGISTICA',     'PROTECCION',   'Equipos de Protección'),
        ('LOGISTICA',     'RADIOS',       'Comunicaciones / Radios'),
        ('LOGISTICA',     'PROVEEDURIA',  'Proveeduría'),
        ('OPERATIVA',     'GUARDIAS',     'Guardias'),
        ('OPERATIVA',     'DESPACHO',     'Centro de Despacho'),
        ('FORMACION',     'CURSOS',       'Cursos Internos'),
        ('FORMACION',     'EVALUACIONES', 'Evaluaciones'),
        ('PREVENCION',    'INSPECCIONES', 'Inspecciones'),
        ('ADMINISTRATIVA','PRESUPUESTO',  'Presupuesto'),
        ('ADMINISTRATIVA','PAGOS',        'Pagos y Tesorería')
     ) AS x(div_codigo, codigo, nombre)
WHERE d.codigo = x.div_codigo
ON CONFLICT (codigo) DO NOTHING;

-- Diagnósticos básicos (CIE-10) — los más comunes; el listado completo se importa luego
INSERT INTO salud.grupos_diagnosticos (codigo, nombre) VALUES
('A',  'Enfermedades infecciosas y parasitarias'),
('B',  'Enfermedades infecciosas - parte 2'),
('J',  'Enfermedades del sistema respiratorio'),
('K',  'Enfermedades del aparato digestivo'),
('M',  'Enfermedades del sistema osteomuscular'),
('R',  'Síntomas y signos no clasificados'),
('S',  'Traumatismos'),
('T',  'Traumatismos - múltiples'),
('Z',  'Factores que influyen en el estado de salud')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO salud.diagnosticos (codigo_cie, grupo_id, nombre)
SELECT x.cie, g.id, x.nombre
FROM salud.grupos_diagnosticos g,
     (VALUES
        ('J00','J','Rinofaringitis aguda (resfriado común)'),
        ('J06','J','Infección aguda de las vías respiratorias superiores'),
        ('J11','J','Influenza, virus no identificado'),
        ('A09','A','Diarrea y gastroenteritis de presunto origen infeccioso'),
        ('K29','K','Gastritis y duodenitis'),
        ('M54','M','Dorsalgia'),
        ('M54.5','M','Lumbago no especificado'),
        ('M25','M','Otros trastornos articulares'),
        ('R51','R','Cefalea'),
        ('R10','R','Dolor abdominal y pélvico'),
        ('S52','S','Fractura del antebrazo'),
        ('S82','S','Fractura de la pierna'),
        ('S93','S','Luxación de tobillo'),
        ('Z76','Z','Atención en otras circunstancias')
     ) AS x(cie, grupo, nombre)
WHERE g.codigo = x.grupo
ON CONFLICT (codigo_cie) DO NOTHING;

-- Tipos de equipo de protección
INSERT INTO equipo.tipos_proteccion (codigo, nombre, requiere_talla, grupo_talla, vida_util_meses) VALUES
('CASCO',           'Casco bomberil estructural',     TRUE,  'CASCO',    60),
('CHAQUETON',       'Chaquetón estructural',          TRUE,  'ROPA',     60),
('PANTALON',        'Pantalón estructural',           TRUE,  'ROPA',     60),
('BOTAS',           'Botas bomberiles',               TRUE,  'CALZADO',  36),
('GUANTES',         'Guantes estructurales',          TRUE,  'ROPA',     24),
('CAPUCHA',         'Capucha (balaclava) ignífuga',   FALSE, NULL,       12),
('SCBA',            'Equipo autónomo de respiración', FALSE, NULL,       NULL),
('CINTURON',        'Cinturón de rescate',            FALSE, NULL,       60),
('LINTERNA',        'Linterna de casco',              FALSE, NULL,       NULL),
('UNIFORME_DIARIO', 'Uniforme de servicio diario',    TRUE,  'ROPA',     24),
('TRAJE_HAZMAT',    'Traje materiales peligrosos',    TRUE,  'ROPA',     NULL)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO equipo.tipos_uniforme (codigo, nombre, grupo_talla) VALUES
('CAMISA_GALA',     'Camisa de gala',           'ROPA'),
('PANTALON_GALA',   'Pantalón de gala',         'ROPA'),
('GORRA',           'Gorra de gala',            'CASCO'),
('ZAPATOS_GALA',    'Zapatos de gala',          'CALZADO'),
('CAMISA_SERVICIO', 'Camisa de servicio',       'ROPA'),
('PANTALON_SERV',   'Pantalón de servicio',     'ROPA'),
('FRANELA',         'Franela institucional',    'ROPA'),
('OVEROL',          'Overol de mecánica',       'ROPA')
ON CONFLICT (codigo) DO NOTHING;

-- Tipos de beneficio
INSERT INTO beneficios.tipos_beneficio (codigo, nombre, periodicidad) VALUES
('CESTA_TICKET',    'Cesta Ticket / Bono Alimentación',  'MENSUAL'),
('BONO_FIN_AÑO',    'Bono de fin de año',                'ANUAL'),
('AGUINALDOS',      'Aguinaldos',                        'ANUAL'),
('JUGUETES',        'Jornada de juguetes',               'ANUAL'),
('UTILES',          'Útiles escolares',                  'ANUAL'),
('UNIFORMES_HIJOS', 'Uniformes escolares de hijos',      'ANUAL'),
('CESTA_NAVIDEÑA',  'Cesta navideña',                    'ANUAL'),
('BONO_DIA_BOMBERO','Bono Día del Bombero',              'ANUAL'),
('BONO_VACACIONAL', 'Bono vacacional',                   'ANUAL'),
('UTILIDADES',      'Utilidades',                        'ANUAL')
ON CONFLICT (codigo) DO NOTHING;

-- Programas de vivienda institucionales
INSERT INTO vivienda.programas (codigo, nombre, descripcion) VALUES
('CONSTRUCCION_SEDE','Construcción / Mejora vivienda propia', 'Apoyo a construcción de viviendas del personal'),
('REFUGIO',          'Refugio temporal',                       'Familias afectadas por contingencias'),
('ALQUILER',         'Subsidio de alquiler',                   'Apoyo mensual de alquiler'),
('ADJUDICACION',     'Adjudicación de vivienda institucional', 'Inmuebles asignados al cuerpo')
ON CONFLICT (codigo) DO NOTHING;

-- Roles del sistema
INSERT INTO seguridad.roles (codigo, nombre, descripcion, es_sistema) VALUES
('ADMIN',       'Administrador',          'Acceso completo al sistema',                 TRUE),
('SUPERVISOR',  'Supervisor',             'Supervisión y aprobaciones',                 TRUE),
('OPERADOR',    'Operador',               'Operaciones del día a día',                  TRUE),
('CONSULTA',    'Consulta',               'Solo lectura',                               TRUE),
('MEDICO',      'Médico',                 'Personal de salud',                          TRUE),
('RRHH',        'Recursos Humanos',       'Gestión de personal',                        TRUE),
('INSPECTOR',   'Inspector',              'Inspectoría / disciplinarios',               TRUE),
('JEFE_ZONA',   'Jefe de Zona',           'Acceso scope zona',                          TRUE),
('JEFE_ESTACION','Jefe de Estación',      'Acceso scope estación',                      TRUE),
('LOGISTICA',   'Logística',              'Equipo, uniformes, radios',                  TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- Módulos del sistema
INSERT INTO seguridad.modulos (codigo, nombre, orden) VALUES
('PERSONAL',     'Personal',                10),
('IDENTIDAD',    'Identidad y Carnets',     15),
('SALUD',        'Salud y Reposos',         20),
('GUARDIAS',     'Guardias',                30),
('VACACIONES',   'Vacaciones',              40),
('PERMISOS',     'Permisos',                50),
('CARRERA',      'Carrera y Ascensos',      60),
('EVALUACIONES', 'Evaluaciones',            70),
('CURSOS',       'Cursos',                  80),
('UNIFORMES',    'Uniformes',               90),
('PROTECCION',   'Equipos de Protección',  100),
('RADIOS',       'Radios',                 110),
('BENEFICIOS',   'Beneficios',             120),
('VIVIENDA',     'Vivienda',               130),
('PERIODOS',     'Períodos de Servicio',   135),
('EGRESOS',      'Egresos / Jubilaciones', 140),
('DOCUMENTOS',   'Documentos / Acervo',    150),
('REPORTES',     'Reportes',               200),
('AUDITORIA',    'Auditoría',              210),
('CONFIG',       'Configuración',          220)
ON CONFLICT (codigo) DO NOTHING;

-- Permisos por defecto: ADMIN tiene todo
INSERT INTO seguridad.rol_permisos
    (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar, puede_exportar, puede_aprobar)
SELECT r.id, m.id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM seguridad.roles r CROSS JOIN seguridad.modulos m
WHERE r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;

-- CONSULTA: solo lectura
INSERT INTO seguridad.rol_permisos
    (rol_id, modulo_id, puede_ver, puede_exportar)
SELECT r.id, m.id, TRUE, TRUE
FROM seguridad.roles r CROSS JOIN seguridad.modulos m
WHERE r.codigo = 'CONSULTA'
ON CONFLICT DO NOTHING;

-- Parámetros del sistema
INSERT INTO sys.parametros (codigo, nombre, valor, tipo_dato, descripcion, grupo) VALUES
('INSTITUCION_NOMBRE',    'Nombre institución',     'Cuerpo de Bomberos del Distrito Capital', 'string', 'Nombre que aparece en reportes', 'institucion'),
('INSTITUCION_RIF',       'RIF',                    'G-20000000-0',           'string', 'RIF de la institución',           'institucion'),
('INSTITUCION_DIRECCION', 'Dirección',              'Caracas, Venezuela',     'string', 'Dirección sede principal',         'institucion'),
('INSTITUCION_TELEFONO',  'Teléfono',               '0212-0000000',           'string', 'Teléfono central',                 'institucion'),
('INSTITUCION_CORREO',    'Correo',                 'info@bomberoscaracas.gob.ve','string','Correo institucional',          'institucion'),
('SESSION_TIMEOUT_MIN',   'Timeout sesión (min)',   '30',                     'int',    'Minutos antes de expirar sesión',  'seguridad'),
('LOGIN_INTENTOS_MAX',    'Intentos máx. login',    '5',                      'int',    'Antes de bloquear usuario',        'seguridad'),
('PASSWORD_MIN_LEN',      'Longitud mín. password', '10',                     'int',    'Longitud mínima de contraseña',    'seguridad'),
('PASSWORD_VENCE_DIAS',   'Días vencimiento pass',  '90',                     'int',    'Días antes de exigir cambio',      'seguridad'),
('FECHA_FORMATO',         'Formato fecha',          'DD/MM/YYYY',             'string', 'Formato de fecha en UI',           'general'),
('REPORTES_PAGINA',       'Registros por página',   '25',                     'int',    'Default en listados',              'general'),
('VERSION_APP',           'Versión',                '2.0.0',                  'string', 'Versión actual del sistema',       'general'),
('REPOSO_MAX_DIAS_DIRECTO','Días reposo sin reval.','7',                      'int',    'Máx. días sin requerir revalidación', 'salud'),
('VACACIONES_DIAS_BASE',  'Días vacaciones base',   '15',                     'int',    'Días anuales (LOTTT)',             'rrhh'),
('AYUDA_MEDICA_TOPE',     'Tope ayuda médica',      '1000.00',                'decimal','Tope por solicitud (USD ref)',     'beneficios')
ON CONFLICT (codigo) DO NOTHING;

-- Versión inicial
INSERT INTO sys.versiones (version, descripcion, script_origen)
VALUES ('2.0.0', 'Esquema inicial — rediseño completo desde Visual Basic legacy', '01_base.sql + 02_dominio.sql + 03_funciones_vistas.sql + 04_seed.sql')
ON CONFLICT DO NOTHING;

-- Usuario administrador inicial
-- Password: Admin#2026* (bcrypt round 12). CAMBIAR EN PRIMER LOGIN.
-- Hash generado con: SELECT crypt('Admin#2026*', gen_salt('bf', 12));
INSERT INTO seguridad.usuarios
    (usuario, password_hash, nombre_completo, correo, debe_cambiar_password)
VALUES (
    'admin',
    crypt('Admin#2026*', gen_salt('bf', 12)),
    'Administrador del Sistema',
    'admin@bomberoscaracas.gob.ve',
    TRUE
)
ON CONFLICT (usuario) DO NOTHING;

-- Asignar rol ADMIN al usuario admin
INSERT INTO seguridad.usuario_roles (usuario_id, rol_id)
SELECT u.id, r.id
FROM seguridad.usuarios u, seguridad.roles r
WHERE u.usuario = 'admin' AND r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Mensaje final
DO $$
BEGIN
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'BD bomberos_caracas v2.0.0 instalada exitosamente';
    RAISE NOTICE '----------------------------------------------------';
    RAISE NOTICE 'Schemas: 15 (core, geo, org, personal, salud, ops,';
    RAISE NOTICE '         carrera, equipo, beneficios, vivienda,';
    RAISE NOTICE '         egresos, documentos, seguridad, aud, sys)';
    RAISE NOTICE '----------------------------------------------------';
    RAISE NOTICE 'Usuario inicial: admin';
    RAISE NOTICE 'Password: Admin#2026*  ← CAMBIAR EN PRIMER LOGIN';
    RAISE NOTICE '====================================================';
END $$;
