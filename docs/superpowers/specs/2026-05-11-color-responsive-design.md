# Color y Responsive — SIGP Bomberos Caracas

**Fecha:** 2026-05-11  
**Estado:** Aprobado  

## Problema

El tema actual (`slate-900` azul-pizarra + crimson puro `hsl(0 65% 48%)`) crea un choque frío-cálido que se percibe visualmente discordante. Además el layout no es funcional en pantallas móviles: el sidebar es fijo en `w-56` sin ningún mecanismo de colapso.

## Alcance

- Actualizar paleta de color a tema **Azul profundo + Burdeos oscuro (B2)**
- Hacer el layout responsive con **drawer hamburger** en móvil
- Sin cambios en lógica de negocio, modelos, API ni páginas internas

---

## 1. Paleta de color

### Variables CSS (`globals.css`)

| Variable | Valor actual | Valor nuevo | Hex approx |
|---|---|---|---|
| `--background` | `222 47% 11%` | `218 28% 7%` | `#0c0f15` |
| `--foreground` | `213 20% 88%` | `213 20% 88%` | sin cambio |
| `--card` | `215 28% 17%` | `220 24% 12%` | `#131720` |
| `--card-foreground` | sin cambio | sin cambio | — |
| `--primary` | `0 65% 48%` | `355 72% 19%` | `#540e14` |
| `--primary-foreground` | `0 0% 100%` | `0 0% 92%` | `#ebebeb` |
| `--secondary` | `215 20% 26%` | `220 28% 17%` | `#1e2433` |
| `--secondary-foreground` | sin cambio | sin cambio | — |
| `--muted` | `215 25% 22%` | `220 24% 14%` | `#181d28` |
| `--muted-foreground` | `215 15% 52%` | `220 18% 38%` | `#4a5570` |
| `--accent` | `215 20% 24%` | `220 26% 16%` | `#1a2030` |
| `--accent-foreground` | sin cambio | sin cambio | — |
| `--destructive` | `0 72% 52%` | `0 72% 52%` | sin cambio |
| `--border` | `215 20% 26%` | `220 28% 17%` | `#1e2433` |
| `--input` | `215 28% 17%` | `220 24% 12%` | `#131720` |
| `--ring` | `0 65% 48%` | `355 58% 35%` | `#8c2535` |

### Uso del color primario

- **Fondos de botones primarios, logo CB, badges de jerarquía:** `--primary` (`#540e14`)
- **Hover de botones, foco de inputs, texto activo en nav:** `--ring` (`#8c2535`)
- **Fondo tenue (badges, estado activo en nav):** `hsl(var(--primary) / 0.12)`
- **Borde tenue:** `hsl(var(--primary) / 0.30)`

La notificación "debe cambiar contraseña" actualmente usa clases `bg-amber-50 border-amber-200 text-amber-900` (modo claro). Se actualiza a variantes oscuras: `bg-amber-950/40 border-amber-800/50 text-amber-300`.

---

## 2. Layout responsive

### Breakpoints

- **Móvil** `< 768px (md)`: sidebar oculto, topbar visible, drawer disponible
- **Tablet/Desktop** `≥ 768px`: layout actual sin cambios (sidebar siempre visible)

### Componente nuevo: `MobileSidebar.tsx`

**Ubicación:** `apps/web/src/components/layout/MobileSidebar.tsx`  
**Tipo:** Client component (`"use client"`)

**Responsabilidades:**
1. Botón ☰ (hamburger) — abre el drawer
2. Drawer — overlay oscuro semitransparente + panel lateral con el mismo contenido de nav
3. Cerrar al hacer clic en el overlay, al navegar (usando `usePathname`) o con tecla `Escape`

**Props recibidas desde `layout.tsx`:**
```ts
interface MobileSidebarProps {
  me: Me | null
  general: NavItem[]
  operativo: NavItem[]
  gestion: NavItem[]
  referencia: NavItem[]
  admin: NavItem[]
}
```

El componente renderiza el botón en la topbar y el drawer completo. No duplica lógica de fetch — recibe los datos ya calculados del server component padre.

### Cambios en `layout.tsx`

1. Sidebar existente: añadir `hidden md:flex` para ocultarlo en móvil
2. Añadir topbar móvil encima del `<main>`:
   ```
   <div class="md:hidden flex items-center border-b ...">
     <MobileSidebar ... />          ← botón hamburger + drawer
     <span>título de página</span>
     <div>usuario avatar</div>
   </div>
   ```
3. Pasar navItems y `me` como props a `MobileSidebar`
4. Actualizar clases de la notificación de contraseña a variantes oscuras

### Comportamiento del drawer

- Se monta siempre en el DOM (para animación), visible/oculto vía clases CSS
- Transición: `translate-x-[-100%]` → `translate-x-0` con `transition-transform duration-200`
- Overlay: `bg-black/60` con `transition-opacity`
- Cierre automático en cambio de ruta (`usePathname` + `useEffect`)
- Cierre con `Escape` (`useEffect` + `keydown`)
- `aria-hidden` y `tabIndex` correctos cuando está cerrado

---

## 3. Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `apps/web/src/app/globals.css` | Reemplazar variables CSS del `:root` |
| `apps/web/src/app/(app)/layout.tsx` | Añadir `hidden md:flex` al sidebar, añadir topbar móvil, pasar props a MobileSidebar, actualizar notificación |
| `apps/web/src/components/layout/MobileSidebar.tsx` | **Nuevo** — client component hamburger + drawer |

**Sin cambios:** todas las páginas, componentes internos, API, modelos, schemas, tests.

---

## 4. Criterios de aceptación

- [ ] En desktop (≥768px) la apariencia y comportamiento son idénticos a hoy, solo con nuevos colores
- [ ] En móvil (<768px) el sidebar no es visible al cargar
- [ ] El botón ☰ abre el drawer con animación suave
- [ ] Hacer clic en el overlay cierra el drawer
- [ ] Navegar a otra página cierra el drawer automáticamente
- [ ] El color primario en botones, badges y nav activo usa el nuevo burdeos oscuro
- [ ] No hay regresiones en ninguna página interna
