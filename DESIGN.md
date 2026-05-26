# DESIGN.md — Sistema Bomberos Caracas (SIGP v2)

## Color strategy

**Restrained.** Tinted neutrals (navy con leve tinte hacia burdeos) + un acento institucional ≤10% del área (burdeos oscuro `#540e14`).

### Tokens (HSL, vía CSS variables en `apps/web/src/app/globals.css`)

| Token | HSL | Hex aproximado | Uso |
|---|---|---|---|
| `--background` | `218 28% 7%` | `#0c0f15` | Fondo de la app (deep navy) |
| `--foreground` | `213 20% 88%` | `#dce3f0` | Texto principal |
| `--card` | `220 24% 12%` | `#131720` | Superficies elevadas (cards, dialogs) |
| `--card-foreground` | `213 20% 88%` | `#dce3f0` | Texto en cards |
| `--primary` | `355 72% 19%` | `#540e14` | **Acento institucional** (burdeos oscuro). CTAs, badges activos, logo |
| `--primary-foreground` | `0 0% 92%` | `#ebebeb` | Texto sobre primary |
| `--secondary` | `220 28% 17%` | `#1e2433` | Botones secundarios, bordes activos |
| `--muted` | `220 24% 14%` | `#181d28` | Fondos sutiles, separadores |
| `--muted-foreground` | `220 18% 38%` | `#4a5570` | Labels, captions, texto auxiliar |
| `--accent` | `220 26% 16%` | `#1a2030` | Hover states |
| `--destructive` | `0 72% 52%` | `#dc2626` | Errores, eliminación |
| `--border` | `220 28% 17%` | `#1e2433` | Bordes |
| `--input` | `220 24% 12%` | `#131720` | Fondo de inputs |
| `--ring` | `355 58% 35%` | `#8c2535` | Focus ring (burdeos más claro) |

### Regla absoluta

- Burdeos solo en: logo chip, CTAs primarios ("Ingresar", "Nuevo funcionario", "Editar", "Exportar"), badges de estado activo, focus ring.
- Nunca usar burdeos para texto largo (ilegible).
- Estados de éxito/error/warning **NO** tienen tokens propios todavía — usamos `--destructive` para error y emojis o ausencia para los demás. **Esto es un hallazgo a mejorar.**

## Typography

- **Familia:** sistema default de Next.js (Tailwind defaults). **No hay declaración explícita.** Hallazgo: faltaría declarar Inter o similar via `next/font` para consistencia cross-OS.
- **Feature settings:** `"rlig" 1, "calt" 1, "tnum" 1` (ligaduras, números tabulares — bueno para alinear cédulas).
- **Smoothing:** antialias en webkit/firefox.
- **Tracking:** `tracking-tight` en h1/h2/h3.
- **Body line length:** sin límite declarado (debería capear en 65-75ch en textos largos).

## Spacing & layout

- Padding base de páginas autenticadas: `p-4` mobile, `p-6` desktop.
- `container` Tailwind: centrado, padding 1rem, max 1400px en 2xl.
- Border radius: `0.25rem` base, calc para sm/md.

## Elevation

- Sin sombras (`shadow-*`) por defecto. Las superficies se distinguen por **color de fondo** (card más claro que background), no por blur.
- Esto está alineado con la decisión de restraint: nada de glassmorphism, nada de cards levitando.

## Components base

shadcn-style sobre Radix UI primitivos. No hay un design system aislado; cada página usa Tailwind utilities directamente con los tokens.

### `.input` utility class (en `globals.css`)

```css
.input {
  @apply w-full rounded border border-border bg-input px-3 py-2 text-sm text-foreground
         placeholder:text-muted-foreground
         focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring
         transition-colors;
}
```

## Iconography

**Lucide React 0.469.0** instalado. Sin embargo, varias pantallas todavía usan **emojis Unicode** (👥, 🎭, ✳️, 🔑, 🏢, 📚, ⚙️, ✨, 📜) en lugar de Lucide. Hallazgo a mejorar.

Tamaños recomendados: `size-4` (16px) para nav items, `size-5` (20px) para CTAs, `size-6` (24px) para acciones grandes. `stroke-[1.5]`.

## Motion

- `tailwindcss-animate` plugin instalado.
- No hay animaciones GSAP. Solo transiciones CSS sutiles (`transition-colors` en focus).
- Mobile drawer (`MobileSidebar.tsx`) tiene transición de slide + overlay con fade.
- **Filosofía:** cero animaciones decorativas. Cada transición sirve a una acción.

## Layout patterns observados

### App shell (rutas autenticadas)
- Desktop ≥768px: sidebar fija izquierda (16rem aprox), main scrolleable a la derecha.
- Mobile <768px: topbar con hamburguesa → drawer overlay.

### Sidebar
- Logo "CB Bomberos Caracas" arriba.
- Global search box (botón con kbd `⌘K`).
- Lista de links agrupada por categorías invisibles (sin headers).
- Al final: `MODO DEMO — CAMBIAR ROL` (select), info del usuario, "Cerrar sesión".

### Dashboard
- Heading "Buenas tardes, {nombre}".
- Banda de "Acciones rápidas" con 6 links horizontales.
- Grid de KpiCards (2 cols mobile, 4 cols desktop) con barra lateral de acento (burdeos a la izquierda en stat positivo).
- Tabla "Distribución por zona y jerarquía" abajo.

### Listados (funcionarios, reposos, etc.)
- Heading + descripción corta.
- Filtros en grid (búsqueda, estatus, zona, estación).
- Tabla con paginación inferior.

### Detalle (ficha funcionario)
- Cabecera con avatar + nombre + badges (cédula, estado, condición).
- Bloques de secciones (Datos personales, Datos laborales, Ubicación administrativa, etc.) en 2 columnas.
- Bloques laterales: "Estado actual", "Información relacionada".
- Acciones grandes al fondo.

### Hub /admin
- Heading "Administración" + descripción.
- **Grid plano 3×3** de cards con emoji + título + descripción.
- Sin agrupación por categorías. **Hallazgo a mejorar.**

## Decisiones de marca explícitas

(De `docs/superpowers/specs/2026-05-11-color-responsive-design.md`)

- Antes: paleta crimson + slate (rojo brillante + gris frío). Se sentía como "choque frío-cálido" desagradable.
- Después: navy profundo (#0c0f15) + burdeos oscuro (#540e14). Más institucional, menos fatiga ocular, mejor contraste con texto claro.

## Conocido / pendiente

- No hay paleta para success / warning / info (solo destructive). Si necesitamos badge "PENDIENTE" o "APROBADO" estamos usando colores inline ad-hoc.
- No hay font declarada con `next/font`. Heredando system fonts.
- Algunos emojis aún en /admin y dashboard. Lucide está instalado y disponible.
- No hay clases utilitarias `.btn-primary`, `.btn-secondary`, `.badge` definidas; cada página recombina utilities Tailwind.
- Sin focus-visible deliberado en todos los elementos clickeables (algunos usan default del navegador).
