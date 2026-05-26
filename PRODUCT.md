# PRODUCT.md — Sistema Bomberos Caracas (SIGP v2)

## Register

**product** — la UI sirve al producto, no es el producto. Es un sistema interno de gestión de personal, no un sitio de marketing.

## Product purpose

Sistema Integrado de Gestión de Personal (SIGP) del **Cuerpo de Bomberos del Distrito Capital**, Venezuela.

Reemplaza un sistema legacy en Visual Basic + SQL Server (PERSONALINTEGRADA, ~230 tablas) con un stack moderno: PostgreSQL 16 + FastAPI + Next.js 14. Cubre dominios de:
- Personal (funcionarios, historiales, identidad)
- Operaciones (guardias, vacaciones, permisos, comisiones, faltas)
- Salud (reposos, lesiones, HCM, evaluación física)
- Carrera (cursos, evaluaciones, ascensos, méritos)
- Equipo (protección/EPP, uniformes, radios)
- Beneficios (ayudas económicas, entregas)
- Egresos (jubilados, fallecimientos)
- Administración (usuarios, roles, módulos, catálogos, auditoría)

Despliegue final: **intranet aislada** del Cuerpo de Bomberos (sin salida a internet). Demo actual en Render/Vercel/Neon con datos ficticios.

## Users

### Usuario primario: Administrador SIGP (RRHH / Comando)
- Adulto profesional, 30-55 años, trabaja en oficina del Cuerpo de Bomberos.
- Pasa el día completo dentro del sistema haciendo CRUD de personal, asignaciones, autorizaciones.
- Lee tablas densas, busca por cédula/nombre, edita formularios largos.
- Necesita ver mucha información por pantalla sin scroll innecesario.
- No es power-user de software; necesita interfaces predecibles, sin sorpresas.

### Usuario secundario: Jefe de zona / estación
- Bombero de rango (Capitán/Mayor/Comandante) con permisos limitados a su jurisdicción.
- Consulta más que edita. Aprueba solicitudes (vacaciones, permisos, ayudas).
- Usa la app desde una PC compartida en la estación.

### Usuario terciario (futuro): Funcionario individual
- Consulta su propio perfil, descarga documentos, solicita permisos/vacaciones.
- Roadmap: aún no implementado.

## Brand

Esto es **una institución gubernamental militar de emergencia**, no una startup. La identidad debe transmitir:

- **Seriedad institucional.** Decisiones de personal afectan carreras y derechos laborales. La interfaz no puede sentirse juguetona ni "vibrante".
- **Autoridad sin agresión.** Es un cuerpo de seguridad, no un app de fitness. El rojo bombero clásico (rojo brillante) se ve mal en interfaces densas y crea fatiga ocular. Por eso la decisión es usar **burdeos oscuro** (#540e14) como acento institucional.
- **Confiabilidad.** El sistema almacena información sensible (cédulas, condiciones médicas, reposos psiquiátricos). Debe verse como un sistema serio y auditado.

## Tone

- Voz formal pero clara. Nunca infantilizante.
- Lenguaje institucional: "Funcionarios" no "personas", "Jerarquía" no "rol", "Reposos" no "permisos médicos".
- Errores honestos: "No se pudo guardar el reposo. La fecha de fin debe ser posterior a la de inicio." No "Oops, algo salió mal".
- Sin emojis decorativos. Excepto cuando representan acción concreta y son la mejor opción (raro).

## Anti-references

- **No SaaS-cream**: nada de fondos blancos con cards levitando + gradientes pastel. Esto no es Notion.
- **No fitness-app**: nada de iconos circulares de colores brillantes (verde fluo, naranja, violeta) como Ganesh tenía en /admin. Tres categorías de color es suficiente: fondo, foreground, acento institucional.
- **No "rojo bombero" plano**: el rojo brillante es la trampa categórica obvia. Bomberos → rojo. Lo evitamos. Burdeos oscuro institucional.
- **No "el dashboard de Linear genérico"**: aunque referenciemos su rigor sistémico, no copiamos su look (azul/violeta sobre fondo oscuro técnico). Aquí es navy con burdeos, sentido institucional gubernamental.
- **No dark mode "porque queda cool"**: dark mode aquí está justificado porque (1) el sistema se usa horas y horas, (2) las oficinas del CBDC tienen iluminación tenue, (3) los datos sensibles se ven mejor con fondos oscuros que con blanco brillante.

## Strategic principles

1. **Densidad sobre aireado.** Una pantalla de listado debe mostrar 20-30 filas, no 6. Aireado es para landings; aquí estorba.
2. **Predecibilidad sobre sorpresa.** Cero animaciones decorativas. Cada movimiento responde a una acción del usuario.
3. **Información sobre branding.** La marca no debe robar protagonismo. Logo discreto, sin imposición visual.
4. **Acceso por teclado de primera clase.** Power users escriben más que clickean. ⌘K para búsqueda global ya existe.
5. **Modo demo claramente diferenciable.** El "MODO DEMO — CAMBIAR ROL" en el sidebar es feature, no bug. Profesor/cliente debe ver inmediatamente que está en demo.

## Scene sentence (para decisiones de tema)

> "Funcionario administrativo de RRHH del CBDC, ~45 años, frente a un monitor 24" en una oficina con iluminación fluorescente tenue, gestiona expedientes de 800+ bomberos durante una jornada de 8 horas, alternando entre listados densos y formularios largos. A las 2pm está cansado y necesita encontrar al funcionario `V-15.234.567` en menos de 5 segundos."

Esa escena fuerza:
- Dark mode (oficina tenue, jornada larga, fatiga ocular).
- Densidad alta (mucha info, pocas pantallas).
- Búsqueda global instantánea (⌘K).
- Tipografía monoespaciada para cédulas/IDs (legibilidad de números).
- Cero animaciones que distraigan.
