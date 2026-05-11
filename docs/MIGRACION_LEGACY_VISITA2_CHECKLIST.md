# Visita 2 al servidor legacy — Checklist

Esta es la segunda (y, si todo sale bien, ultima) visita por AnyDesk al servidor del cliente para cerrar el contexto antes de la migracion real.

**Tiempo estimado:** 30 min (15 min ejecutar script + 15 min preguntas al cliente).

---

## A. Ejecutar el script de valores opacos (en AnyDesk)

```powershell
cd C:\Temp\bomberos
# Copiar inspeccionar_valores_opacos.ps1 desde el repo (file transfer F4 de AnyDesk,
# NO clipboard porque ya sabemos que rompe comillas).

powershell -ExecutionPolicy Bypass -File .\inspeccionar_valores_opacos.ps1 `
  -Server "localhost\SERVIDORDATOS" `
  -Database PERSONALINTEGRADA
```

Genera 2 archivos en la carpeta actual:
- `legacy_values_<timestamp>.json`
- `legacy_values_<timestamp>.md`

Traer cualquiera de los dos por file-transfer de AnyDesk al repo en `apps/migration/`.

---

## B. Preguntas al cliente (15 min)

Aprovechar la visita para resolver gaps que el JSON estructural no responde:

### B.1. Permisos individuales
La tabla `PERMISOS` **no existe**. Solo hay `PERMISO` (3 filas = catalogo).

**Preguntar:**
- ¿Como llevan los permisos individuales por funcionario? ¿papel? ¿hoja de Excel? ¿otra BD?
- ¿Necesitan migrar ese historico o el modulo de permisos arranca limpio en el nuevo sistema?

### B.2. Guardias
Hay `ENC_GUARDIAS` (9 filas) + `DET_GUARDIAS` (1,461 filas). Muy pocas.

**Preguntar:**
- ¿Es el universo real de guardias historicas o hay otra fuente?
- ¿Cuanto historico esperan ver en el sistema nuevo?

### B.3. Asistencia
`ASISTENCIA_GUARDIA` no existe como tabla.

**Preguntar:**
- ¿La asistencia se registra en otro lado? ¿reloj biometrico? ¿papel?

### B.4. Funcionarios egresados — diferencias de columnas
`FUNCIONARIOS_EGRESADOS` (3,285 filas) tiene 4 columnas adicionales de auditoria legacy:
`FECHA_TRANSACCION, USUARIO, TRANSACCION, ESTATUS_ANTERIOR`.

Y le falta `FECHA_INGRESOGDF` (que si tiene `FUNCIONARIOS`).

**Preguntar:**
- ¿`FECHA_INGRESOGDF` se rellena despues del egreso o se descarta?
- ¿Las columnas USUARIO/TRANSACCION/ESTATUS_ANTERIOR son utiles para auditoria historica o se descartan?

### B.5. Catalogos sospechosamente grandes
- `NIVEL_EDUCATIVO` tiene 5,617 filas (raro para un catalogo).
- `UBICACION_ADMINISTRATIVA` tiene 5,522 filas.

**Preguntar:**
- ¿Estan mezclando catalogo con datos asignados? ¿O hay realmente esa cantidad?

### B.6. Columnas que son bit (ya boolean en SQL Server)
`COMISION_SERVICIO.PTOSI/PTONO/RENOSI/RENONO/FIN_SI/FIN_NO` son tipo `bit`.

**Preguntar:**
- Confirmar que `PTOSI=1` significa "punto cuenta SI" y `PTONO=1` significa "punto cuenta NO". ¿O son flags independientes?
- Idem `RENO*` (renovacion?) y `FIN_*` (finalizacion?).

### B.7. Beneficios — multiples snapshots mensuales
Hay varias tablas tipo `BENEFICIO_ENE22`, `BENEFICIO_ABRIL2022`, `BENEFICIO_oct2021`, `BENEFICIO_(ANTES_*)`.

**Preguntar:**
- Confirmar que la tabla canonica es `BENEFICIO` (2,069 filas) y `REGISTRO_BENEFICIO` (11,521 filas) — el resto se descarta.

---

## C. Despues de la visita

1. Hacer commit del JSON de valores opacos en `apps/migration/`.
2. Documentar las respuestas del cliente en `docs/MIGRACION_LEGACY_DECISIONES_VISITA2.md`.
3. Escribir `sql/06_legacy_extensions.sql` con las clasificaciones decididas.
4. Refactorizar `apps/migration/src/bomberos_migration/transform.py` y `migrate.py`.
5. Dry-run en BD destino limpia.
6. Apply real.

---

## D. Argumento para el custodio (mismo de la primera visita)

> "Es el mismo tipo de script que la primera vez. Solo lista valores con conteo (`DISTINCT + COUNT`). No copia filas individuales. No expone PII — no toca cedula, nombres, telefonos ni direcciones. Solo columnas tipo S/N o categorias. Pueden revisar el output antes de que me lo lleve."
