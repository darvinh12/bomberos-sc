# Frontend Modules Implementation Plan

> **Para agentes:** SKILL REQUERIDA: superpowers:subagent-driven-development o superpowers:executing-plans.

**Goal:** Completar la cobertura UI del frontend Next.js — implementar todos los módulos faltantes para que cada endpoint del API tenga interfaz.

**Architecture:** Next.js 14 App Router + RSC. Patrón canónico: page listado + page detalle + page nuevo + actions hardenadas (requireServerRole + zod safeParse). Tokens en HttpOnly cookie. TanStack Query para client-side cache donde necesario.

**Tech Stack:** Next.js 14.2.35, React 18, TypeScript strict, Tailwind 3, shadcn/ui, TanStack Query 5, react-hook-form 7, zod 3.

**Esfuerzo estimado:** 80-120 horas / 2-3 semanas / 1 dev senior, o 1.5 semanas con 2 devs paralelos.

---

## Tabla de contenidos

1. [Patrón canónico de módulo](#sección-1--patrón-canónico-de-módulo)
   - 1.1 Schema zod compartido
   - 1.2 `page.tsx` — listado
   - 1.3 `[id]/page.tsx` — detalle
   - 1.4 `nuevo/page.tsx` — server component
   - 1.5 `nuevo/form.tsx` — client form
   - 1.6 `actions.ts` — server actions hardenadas
   - 1.7 Helper `requireServerRole`
   - 1.8 Componente `DataTable` reutilizable
   - 1.9 Estados loading / error / empty
   - 1.10 Test smoke con Playwright
   - 1.11 Navegación lateral (sidebar)
2. [Aplicación módulo por módulo](#sección-2--aplicación-módulo-por-módulo)
   - 2.1 Salud — lesiones, evaluacion-fisica, hcm
   - 2.2 Carrera — evaluaciones, reconocimientos, meritos
   - 2.3 Equipo — uniformes
   - 2.4 Documentos — acervo, oficios, actas
   - 2.5 Beneficios — entregas
   - 2.6 Egresos — jubilados, solicitudes, fallecimientos
3. [Verificación final](#sección-3--verificación-final)

---

## Sección 1 — Patrón canónico de módulo

Cada nuevo módulo CRUD del frontend sigue **exactamente este patrón**. Sólo cambian los DTOs, las columnas y las labels. La estructura, los helpers, los gates de seguridad y los estados son idénticos.

> **Importante:** El patrón asume el inventario real de `apps/web/`:
> - `lib/api.ts`, `lib/session.ts`, `lib/roles.ts`, `lib/utils.ts` ya existen.
> - Tailwind v3 (no v4): clase `input` definida en `globals.css` como utility class para inputs/selects.
> - React 18 (no 19): no se usa `ref` como prop directa, sí `useFormState` / `useFormStatus` del `react-dom`.
> - shadcn pre-instalado: Radix Dialog, Toast, Select, etc.

### 1.1 Schema zod compartido

Cada módulo declara su schema en `src/schemas/<modulo>.ts`. Se exporta para reuso en server actions y, si aplica, en el cliente vía `@hookform/resolvers/zod`.

**Plantilla** — `apps/web/src/schemas/lesion.ts`:

```ts
import { z } from "zod";

export const lesionCreateSchema = z.object({
  funcionario_id: z.number().int().positive(),
  tipo_accidente_id: z.number().int().positive().nullable().optional(),
  fecha_evento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  lugar_evento: z.string().max(255).nullable().optional(),
  descripcion: z.string().min(3, "Mínimo 3 caracteres").max(2000),
  en_servicio: z.boolean().default(true),
  parte_afectada: z.string().max(120).nullable().optional(),
  centro_medico_id: z.number().int().positive().nullable().optional(),
  medico_id: z.number().int().positive().nullable().optional(),
  diagnostico_id: z.number().int().positive().nullable().optional(),
  dias_incapacidad: z.number().int().min(0).max(3650).nullable().optional(),
  secuelas: z.string().max(2000).nullable().optional(),
  documento_url: z.string().url().nullable().optional(),
});

export type LesionCreate = z.infer<typeof lesionCreateSchema>;

export interface LesionOut extends LesionCreate {
  id: number;
}
```

### 1.2 `page.tsx` — listado (Server Component)

Patrón canónico con: filtros via URL searchParams, búsqueda, paginación, gate por rol con `requireRoleOrRedirect`, botón "+ Nuevo" condicional, export CSV, estados error/empty.

**Plantilla** — `apps/web/src/app/(app)/salud/lesiones/page.tsx`:

```tsx
import Link from "next/link";
import { Plus, Download, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect, hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import type { LesionOut } from "@/schemas/lesion";

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface SearchProps {
  searchParams: {
    funcionario_id?: string;
    page?: string;
  };
}

export default async function LesionesPage({ searchParams }: SearchProps) {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH", "SUPERVISOR"]);
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  const funcionarioId = searchParams.funcionario_id ?? "";
  const page = Number(searchParams.page ?? 1);

  const params = new URLSearchParams({ page: String(page), page_size: "25" });
  if (funcionarioId) params.set("funcionario_id", funcionarioId);

  let data: Page<LesionOut> | null = null;
  let err: string | null = null;
  try {
    data = await api.get<Page<LesionOut>>(`/salud/lesiones?${params}`, token);
  } catch (e: unknown) {
    err = e instanceof Error ? e.message : "Error desconocido";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="size-5 stroke-[1.5] text-primary" />
            Lesiones
          </h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.total.toLocaleString("es-VE")} registros`
              : "Cargando…"}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/export/lesiones?${params}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Download className="size-4 stroke-[1.5]" /> CSV
          </a>
          {puedeEditar && (
            <Link
              href="/salud/lesiones/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
            >
              <Plus className="size-4 stroke-[1.5]" /> Nueva lesión
            </Link>
          )}
        </div>
      </div>

      <form className="rounded-xl border bg-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Funcionario ID</label>
          <input
            name="funcionario_id"
            defaultValue={funcionarioId}
            type="number"
            min="1"
            placeholder="Filtrar por funcionario"
            className="input"
          />
        </div>
        <div className="md:col-span-3 flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Filtrar
          </button>
          {funcionarioId && (
            <Link
              href="/salud/lesiones"
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {err && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {err}
        </div>
      )}

      {data && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Funcionario</th>
                  <th className="text-left p-3">Descripción</th>
                  <th className="text-left p-3">En servicio</th>
                  <th className="text-right p-3">Días inc.</th>
                  <th className="text-right p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{formatDate(l.fecha_evento)}</td>
                    <td className="p-3 font-mono text-xs">#{l.funcionario_id}</td>
                    <td className="p-3 max-w-[40ch] truncate" title={l.descripcion}>
                      {l.descripcion}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          l.en_servicio
                            ? "inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-700/50"
                            : "inline-block px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border"
                        }
                      >
                        {l.en_servicio ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="p-3 text-right">{l.dias_incapacidad ?? "—"}</td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/salud/lesiones/${l.id}`}
                        className="text-primary hover:underline text-xs"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Sin lesiones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="border-t p-3 flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                Página {data.page} de {data.pages}
              </span>
              <div className="flex gap-2">
                {data.page > 1 && (
                  <Link
                    href={`?${new URLSearchParams({ ...searchParams, page: String(data.page - 1) })}`}
                    className="px-3 py-1 rounded border hover:bg-accent"
                  >
                    ← Anterior
                  </Link>
                )}
                {data.page < data.pages && (
                  <Link
                    href={`?${new URLSearchParams({ ...searchParams, page: String(data.page + 1) })}`}
                    className="px-3 py-1 rounded border hover:bg-accent"
                  >
                    Siguiente →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### 1.3 `[id]/page.tsx` — detalle (Server Component)

**Plantilla** — `apps/web/src/app/(app)/salud/lesiones/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Activity } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { hasAnyRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import type { LesionOut } from "@/schemas/lesion";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-slate-200 font-medium">
        {value ?? <span className="text-slate-600">—</span>}
      </div>
    </div>
  );
}

export default async function LesionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const token = await requireAuth();
  let l: LesionOut;
  try {
    l = await api.get<LesionOut>(`/salud/lesiones/${params.id}`, token);
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  const puedeEditar = hasAnyRole(me.roles, ["ADMIN", "RRHH"]);

  return (
    <div className="space-y-4 max-w-screen-lg">
      <div className="flex items-center justify-between">
        <Link
          href="/salud/lesiones"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="size-4 stroke-[1.5]" />
          Lesiones
        </Link>
        {puedeEditar && (
          <Link
            href={`/salud/lesiones/${l.id}/editar`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-primary text-white hover:opacity-90"
          >
            <Pencil className="size-3.5 stroke-[1.5]" />
            Editar
          </Link>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded p-5">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="size-6 stroke-[1.5] text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              Lesión #{l.id}
            </h1>
            <p className="text-sm text-slate-400">
              Funcionario #{l.funcionario_id} · {formatDate(l.fecha_evento)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-700">
          <Field label="Fecha del evento" value={formatDate(l.fecha_evento)} />
          <Field label="En servicio" value={l.en_servicio ? "Sí" : "No"} />
          <Field label="Días incapacidad" value={l.dias_incapacidad ?? null} />
          <Field label="Lugar" value={l.lugar_evento} />
          <Field label="Parte afectada" value={l.parte_afectada} />
          <Field label="Tipo accidente" value={l.tipo_accidente_id ?? null} />
          <div className="col-span-full">
            <Field label="Descripción" value={l.descripcion} />
          </div>
          {l.secuelas && (
            <div className="col-span-full">
              <Field label="Secuelas" value={l.secuelas} />
            </div>
          )}
          {l.documento_url && (
            <div className="col-span-full">
              <Field
                label="Documento"
                value={
                  <a
                    href={l.documento_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Abrir documento ↗
                  </a>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 1.4 `nuevo/page.tsx` — server component que carga catálogos

**Plantilla** — `apps/web/src/app/(app)/salud/lesiones/nuevo/page.tsx`:

```tsx
import { api } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireRoleOrRedirect } from "@/lib/roles";
import NuevaLesionForm from "./form";

interface Cat {
  id: number;
  codigo: string;
  nombre: string;
}

export default async function NuevaLesionPage() {
  const token = await requireAuth();
  const me = await api
    .get<{ roles: string[] }>("/auth/me", token)
    .catch(() => ({ roles: [] as string[] }));
  requireRoleOrRedirect(me.roles, ["ADMIN", "RRHH"]);

  let tiposAccidente: Cat[] = [];
  let centros: Cat[] = [];
  let diagnosticos: Cat[] = [];
  try {
    [tiposAccidente, centros, diagnosticos] = await Promise.all([
      api.get<Cat[]>("/catalogos/tipos-accidente", token).catch(() => []),
      api.get<Cat[]>("/catalogos/centros-medicos", token).catch(() => []),
      api.get<Cat[]>("/catalogos/diagnosticos", token).catch(() => []),
    ]);
  } catch {
    /* silent */
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nueva lesión</h1>
        <p className="text-sm text-muted-foreground">
          Registra un evento que generó incapacidad o requirió atención médica.
        </p>
      </div>
      <NuevaLesionForm
        tiposAccidente={tiposAccidente}
        centros={centros}
        diagnosticos={diagnosticos}
      />
    </div>
  );
}
```

### 1.5 `nuevo/form.tsx` — client form

**Plantilla** — `apps/web/src/app/(app)/salud/lesiones/nuevo/form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { crearLesion, type NuevaLesionState } from "./actions";

interface Cat {
  id: number;
  nombre: string;
}

const initial: NuevaLesionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-60 transition"
    >
      {pending ? "Guardando…" : "Crear lesión"}
    </button>
  );
}

export default function NuevaLesionForm({
  tiposAccidente,
  centros,
  diagnosticos,
}: {
  tiposAccidente: Cat[];
  centros: Cat[];
  diagnosticos: Cat[];
}) {
  const [state, action] = useFormState(crearLesion, initial);

  return (
    <form action={action} className="rounded-xl border bg-card p-6 space-y-5">
      {state.error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
        >
          {state.error}
        </div>
      )}
      {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive"
        >
          <ul className="list-disc pl-5 space-y-1">
            {Object.entries(state.fieldErrors).map(([k, v]) => (
              <li key={k}>
                <strong>{k}:</strong> {v.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Funcionario ID" required>
          <input type="number" name="funcionario_id" required min="1" className="input" />
        </Field>
        <Field label="Fecha del evento" required>
          <input type="date" name="fecha_evento" required className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Tipo de accidente">
          <select name="tipo_accidente_id" defaultValue="" className="input">
            <option value="">—</option>
            {tiposAccidente.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="En servicio">
          <select name="en_servicio" defaultValue="true" className="input">
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </Field>
      </div>

      <Field label="Descripción" required>
        <textarea
          name="descripcion"
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          className="input min-h-[80px]"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Lugar del evento">
          <input name="lugar_evento" maxLength={255} className="input" />
        </Field>
        <Field label="Parte afectada">
          <input name="parte_afectada" maxLength={120} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Centro médico">
          <select name="centro_medico_id" defaultValue="" className="input">
            <option value="">—</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Diagnóstico">
          <select name="diagnostico_id" defaultValue="" className="input">
            <option value="">—</option>
            {diagnosticos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Días de incapacidad">
          <input
            type="number"
            name="dias_incapacidad"
            min="0"
            max="3650"
            className="input"
          />
        </Field>
      </div>

      <Field label="Secuelas">
        <textarea name="secuelas" maxLength={2000} rows={2} className="input min-h-[60px]" />
      </Field>

      <Field label="URL de documento">
        <input type="url" name="documento_url" className="input" />
      </Field>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Link
          href="/salud/lesiones"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancelar
        </Link>
        <Submit />
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
```

### 1.6 `actions.ts` — server actions hardenadas (zod safeParse + role gate)

**Plantilla** — `apps/web/src/app/(app)/salud/lesiones/nuevo/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireServerRole } from "@/lib/server-guards";
import { lesionCreateSchema } from "@/schemas/lesion";

export type NuevaLesionState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  ok?: boolean;
};

export async function crearLesion(
  _prev: NuevaLesionState,
  formData: FormData,
): Promise<NuevaLesionState> {
  const token = await requireAuth();
  await requireServerRole(["ADMIN", "RRHH"], token);

  // Normalizar FormData → objeto antes de validar
  const raw = {
    funcionario_id: numberOrNaN(formData.get("funcionario_id")),
    tipo_accidente_id: numberOrNull(formData.get("tipo_accidente_id")),
    fecha_evento: String(formData.get("fecha_evento") || ""),
    lugar_evento: blankToNull(formData.get("lugar_evento")),
    descripcion: String(formData.get("descripcion") || "").trim(),
    en_servicio: formData.get("en_servicio") === "true",
    parte_afectada: blankToNull(formData.get("parte_afectada")),
    centro_medico_id: numberOrNull(formData.get("centro_medico_id")),
    medico_id: numberOrNull(formData.get("medico_id")),
    diagnostico_id: numberOrNull(formData.get("diagnostico_id")),
    dias_incapacidad: numberOrNull(formData.get("dias_incapacidad")),
    secuelas: blankToNull(formData.get("secuelas")),
    documento_url: blankToNull(formData.get("documento_url")),
  };

  const parsed = lesionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "Datos inválidos. Revise los campos marcados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const created = await api.post<{ id: number }>(
      "/salud/lesiones",
      parsed.data,
      token,
    );
    revalidatePath("/salud/lesiones");
    redirect(`/salud/lesiones/${created.id}`);
  } catch (e: unknown) {
    if (e instanceof ApiError) return { error: e.message };
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return { error: e instanceof Error ? e.message : "Error al crear" };
  }
}

function blankToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numberOrNaN(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : NaN;
}
```

### 1.7 Helper `requireServerRole`

Antes de empezar Sección 2, crear **una sola vez** este helper compartido. Lo usan todas las server actions.

**Crear** — `apps/web/src/lib/server-guards.ts`:

```ts
"use server";

import { api } from "@/lib/api";
import { hasAnyRole, type Rol } from "@/lib/roles";

/**
 * Gate server-side para Server Actions. Lanza Error visible al cliente
 * si el usuario no tiene NINGUNO de los roles requeridos.
 * Llamar siempre después de requireAuth().
 */
export async function requireServerRole(required: Rol[], token: string): Promise<void> {
  let me: { roles: string[] };
  try {
    me = await api.get<{ roles: string[] }>("/auth/me", token);
  } catch {
    throw new Error("Sesión inválida");
  }
  if (!hasAnyRole(me.roles, required)) {
    throw new Error("No tiene permisos para esta acción");
  }
}
```

### 1.8 Componente `DataTable` reutilizable (opcional)

Si más de 3 módulos comparten exactamente la misma estructura de tabla con tipos genéricos, extraer a `apps/web/src/components/common/DataTable.tsx`. **No forzar la abstracción si los módulos divergen en columnas o acciones.**

```tsx
"use client";

import type { ReactNode } from "react";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

interface Props<T extends { id: number }> {
  rows: T[];
  columns: Column<T>[];
  emptyMessage?: string;
  actions?: (row: T) => ReactNode;
}

export function DataTable<T extends { id: number }>({
  rows,
  columns,
  emptyMessage = "Sin resultados.",
  actions,
}: Props<T>) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((c) => (
                <th
                  key={String(c.key)}
                  className={`p-3 ${c.align === "right" ? "text-right" : "text-left"} ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
              {actions && <th className="text-right p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/30">
                {columns.map((c) => (
                  <td
                    key={String(c.key)}
                    className={`p-3 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
                  >
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[String(c.key)] ?? "—")}
                  </td>
                ))}
                {actions && <td className="p-3 text-right">{actions(row)}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="p-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 1.9 Estados loading / error / empty (shadcn + skeleton)

Cada page de listado debe tener tres estados explícitos:

- **Loading** — usar `loading.tsx` hermano en App Router:

```tsx
// apps/web/src/app/(app)/salud/lesiones/loading.tsx
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="rounded-xl border bg-card p-4 h-20" />
      <div className="rounded-xl border bg-card divide-y">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}
```

- **Error** — `error.tsx`:

```tsx
// apps/web/src/app/(app)/salud/lesiones/error.tsx
"use client";

import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 max-w-lg">
      <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
        <AlertTriangle className="size-5 stroke-[1.5]" />
        Ocurrió un error
      </div>
      <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
      >
        Reintentar
      </button>
    </div>
  );
}
```

- **Empty** — ya cubierto inline en el `<tbody>` de cada listado (`Sin <recurso>.`).

### 1.10 Test smoke con Playwright

Cada módulo nuevo debe traer al menos un smoke test. Asumir que existe `apps/web/tests/e2e/` con setup (si no, crearlo en la primera tarea como dependencia).

**Plantilla** — `apps/web/tests/e2e/salud-lesiones.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("Lesiones — smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name=usuario]", process.env.E2E_USER ?? "admin");
    await page.fill("input[name=password]", process.env.E2E_PASS ?? "admin123");
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard");
  });

  test("lista de lesiones carga", async ({ page }) => {
    await page.goto("/salud/lesiones");
    await expect(page.getByRole("heading", { name: /lesiones/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /nueva lesi/i })).toBeVisible();
  });

  test("formulario nueva lesión carga y rechaza datos vacíos", async ({ page }) => {
    await page.goto("/salud/lesiones/nuevo");
    await expect(page.getByRole("heading", { name: /nueva lesi/i })).toBeVisible();
    await page.click("button[type=submit]");
    // El form HTML rechaza por required="" — no debe haber navegación
    await expect(page).toHaveURL(/\/salud\/lesiones\/nuevo/);
  });

  test("usuario LECTURA no ve el botón Nueva lesión", async ({ page, context }) => {
    await context.addCookies([
      { name: "bcd_demo_role", value: "LECTURA", url: "http://localhost:3000" },
    ]);
    await page.goto("/salud/lesiones");
    await expect(page.getByRole("link", { name: /nueva lesi/i })).toHaveCount(0);
  });
});
```

Si Playwright aún no está configurado, la primera tarea de la primera sección será:

```bash
cd apps/web && npm install -D @playwright/test && npx playwright install --with-deps chromium
```

con `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

### 1.11 Navegación lateral (sidebar) — agregar item

Cada módulo nuevo se agrega en `apps/web/src/app/(app)/layout.tsx`:

1. Importar el icono Lucide al top.
2. Insertar `{ href: "/salud/lesiones", label: "Lesiones", Icon: Activity }` en el grupo `NAV_OPERATIVO` (Salud) o el grupo correspondiente.
3. Registrar el path en `apps/web/src/lib/roles.ts` → `ACCESO_MODULOS`:

```ts
"/salud/lesiones": ["ADMIN", "RRHH", "SUPERVISOR"],
```

Si el módulo tiene sub-rutas, agregar también la matriz para el escritor (`/salud/lesiones/nuevo`) con menor cardinalidad de roles.

---

## Sección 2 — Aplicación módulo por módulo

Cada módulo se construye con **7 tareas TDD** ejecutadas en orden:

1. Escribir test smoke Playwright que falle (lista no existe).
2. Crear schema zod en `src/schemas/<modulo>.ts`.
3. Crear page listado (`page.tsx` + `loading.tsx` + `error.tsx`).
4. Crear page detalle (`[id]/page.tsx`).
5. Crear page nuevo (`nuevo/page.tsx` + `form.tsx`).
6. Crear server actions (`nuevo/actions.ts`) con `requireServerRole` + zod `safeParse`.
7. Agregar al sidebar (`layout.tsx`) y matriz de roles (`roles.ts`); correr test y commit.

> **Convención de mensajes commit:** `feat(<modulo>): UI completa CRUD listado/detalle/nuevo`.

---

### 2.1 Salud — Lesiones

**Endpoint backend:** `GET/POST /salud/lesiones`. Schema `LesionCreate` con `funcionario_id`, `fecha_evento`, `descripcion` (min 3), `en_servicio` (default true), `parte_afectada`, `dias_incapacidad`, etc.

**Roles:** lectura `["ADMIN", "RRHH", "SUPERVISOR"]`. Escritura `["ADMIN", "RRHH", "MEDICO"]` (en frontend usamos ADMIN+RRHH; MEDICO no está en `Rol` del FE — confirmar con backend si se añade).

**Ruta UI:** `/salud/lesiones`. Icono: `Activity` de lucide.

**Tareas:**

1. `tests/e2e/salud-lesiones.spec.ts` (smoke ya plantillado en 1.10).
2. `src/schemas/lesion.ts` (schema ya plantillado en 1.1).
3. `src/app/(app)/salud/lesiones/page.tsx` + `loading.tsx` + `error.tsx` (1.2 + 1.9).
4. `src/app/(app)/salud/lesiones/[id]/page.tsx` (1.3).
5. `src/app/(app)/salud/lesiones/nuevo/page.tsx` + `form.tsx` (1.4 + 1.5).
6. `src/app/(app)/salud/lesiones/nuevo/actions.ts` (1.6).
7. Sidebar (`Icon: Activity`, grupo Operativo) + `ACCESO_MODULOS["/salud/lesiones"]`.

### 2.2 Salud — Evaluación física

**Endpoint:** `GET/POST /salud/evaluacion-fisica`. Schema `EvaluacionFisicaCreate` con métricas (`peso_kg`, `estatura_cm`, `presion_*`, `pulso`, `flexiones`, `abdominales`, `tiempo_carrera_seg`, `apto`).

**Ruta UI:** `/salud/evaluacion-fisica`. Icono: `Dumbbell`.

**Columnas listado:** Fecha · Funcionario · Peso · Estatura · IMC (campo derivado del backend) · Apto.

**Form fields agrupados:**
- Bloque "Antropometría": peso_kg, estatura_cm.
- Bloque "Cardiovascular": presion_sistolica, presion_diastolica, pulso.
- Bloque "Resistencia": flexiones, abdominales, tiempo_carrera_seg.
- Bloque "Veredicto": apto (select Sí/No/Pendiente), observaciones, medico_id.

**Schema zod:** todos los numéricos como `z.number().positive().nullable().optional()`. `tiempo_carrera_seg` puede aceptar `min(0).max(7200)`.

**Tareas:** mismas 7. Test smoke valida que IMC se calcula y muestra.

### 2.3 Salud — HCM (Historia clínica)

> **Nota:** El backend actual NO expone aún router `/salud/hcm` (ver inventario `apps/api/src/bomberos_api/routers/salud.py`). Esta tarea **incluye stub backend** primero. Documentado aquí porque la UI lo necesita; el plan respeta el orden API-first.

**Pre-tarea (backend):**

1. Crear `apps/api/src/bomberos_api/models/salud.py` → modelo `HistoriaClinica` (campos sugeridos: `funcionario_id`, `fecha_registro`, `alergias`, `antecedentes`, `medicamentos_actuales`, `peso_actual`, `talla_actual`, `tipo_sangre_id`, `observaciones`).
2. Crear schema en `salud.py` (Pydantic).
3. Agregar endpoints `/salud/hcm` (GET listar, GET por funcionario, POST, PATCH).
4. Migración DB (`alembic revision`).

**Ruta UI:** `/salud/hcm`. Icono: `Stethoscope`.

**Particularidad:** la entidad HCM es **1:1 con funcionario**, no listado paginado. La página `/salud/hcm/[funcionario_id]` muestra/edita inline. La página `/salud/hcm` es buscador por cédula.

**Tareas:** 8 (7 estándar + pre-tarea backend).

### 2.4 Carrera — Evaluaciones

**Endpoint:** `GET/POST /carrera/evaluaciones`. Schema `EvaluacionCreate` con `tipo` enum `DESEMPENO|FISICA|INTEGRAL|ESTADO_MAYOR`, `nota_total`, `estatus` (default `BORRADOR`).

**Ruta UI:** `/carrera/evaluaciones`. Icono: `ClipboardCheck`.

**Filtros listado:** `funcionario_id`, `periodo_id`, `tipo`, `estatus`.

**Form:**
- Funcionario, Período (select de catálogo `/catalogos/periodos-evaluacion`).
- Tipo (select con 4 valores enum).
- Evaluador (select de funcionarios con rol SUPERVISOR).
- Nota total (number 0-100).
- Estatus (select `BORRADOR|EN_REVISION|FINALIZADA|ANULADA`).
- Documento URL.

**Schema zod:** `tipo: z.enum(["DESEMPENO", "FISICA", "INTEGRAL", "ESTADO_MAYOR"])`, `nota_total: z.number().min(0).max(100).nullable()`.

**Roles:** lectura `["ADMIN", "RRHH", "SUPERVISOR"]`. Escritura `["ADMIN", "SUPERVISOR"]`.

**Tareas:** 7 estándar.

### 2.5 Carrera — Reconocimientos

**Endpoint:** `GET/POST /carrera/reconocimientos`. Schema `ReconocimientoCreate` con `condecoracion_id`, `institucion_id`, `nombre_libre`, `fecha_otorgamiento`, `motivo`, `resolucion`, `documento_url`.

**Ruta UI:** `/carrera/reconocimientos`. Icono: `Medal`.

**Particularidad:** uno entre `condecoracion_id` y `nombre_libre` debe estar presente. Validar en zod con `.refine()`:

```ts
.refine(
  (d) => d.condecoracion_id != null || (d.nombre_libre && d.nombre_libre.length >= 3),
  { message: "Indique condecoración del catálogo o nombre libre", path: ["nombre_libre"] }
)
```

**Tareas:** 7 estándar.

### 2.6 Carrera — Méritos (vista de cálculo)

**Endpoint:** `GET /carrera/meritos`, `POST /carrera/meritos/recalcular/{periodo_id}`. No hay create directo — sólo recalcular.

**Ruta UI:** `/carrera/meritos`. Icono: `TrendingUp`.

**Diferencia vs patrón:**
- **No hay** `/nuevo`. Sí hay botón "Recalcular período" (server action que llama `/carrera/meritos/recalcular/{id}`).
- Listado muestra: posición · funcionario · puntaje_evaluacion · puntaje_cursos · puntaje_actividades · puntaje_condecoraciones · puntaje_faltas · **puntaje_total**.
- Filtro `periodo_id` obligatorio en URL — sin él, la página muestra selector de período.
- Ordenar por `posicion` ASC.

**Server action** — `apps/web/src/app/(app)/carrera/meritos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { requireServerRole } from "@/lib/server-guards";

export async function recalcularMeritos(periodoId: number) {
  const token = await requireAuth();
  await requireServerRole(["ADMIN", "RRHH"], token);
  try {
    const res = await api.post<{ funcionarios_procesados: number }>(
      `/carrera/meritos/recalcular/${periodoId}`,
      {},
      token,
    );
    revalidatePath("/carrera/meritos");
    return { ok: true, procesados: res.funcionarios_procesados };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Error" };
  }
}
```

**Tareas:**

1. Test smoke (lista vacía, botón recalcular visible para ADMIN).
2. Schema zod `meritoSchema` (sólo Out).
3. `page.tsx` con tabla de ranking + form recalcular.
4. **Saltar** detalle individual (no aplica).
5. **Saltar** /nuevo.
6. `actions.ts` con `recalcularMeritos`.
7. Sidebar (grupo Gestión, sub-item de Carrera).

### 2.7 Equipo — Uniformes

**Backend:** verificar si existe endpoint `/equipo/uniformes` (no aparece en `equipo.py` actual; sólo hay `proteccion` y `radios`). **Pre-tarea: crear router backend.**

**Modelo sugerido:**
- `UniformeInventario`: tipo_uniforme_id, talla_id, color, lote, fecha_adquisicion, estatus, estacion_id.
- `UniformeAsignacion`: inventario_id, funcionario_id, fecha_entrega, devuelto.

**Ruta UI:** `/equipo/uniformes`. Icono: `Shirt`.

**Estructura idéntica a Protección** (inventario + asignaciones). Copiar páginas de `/equipo/proteccion/*` cambiando rutas y labels.

**Tareas:** 8 (7 + pre-tarea backend).

### 2.8 Documentos — Acervo

> **Nota crítica:** El backend NO tiene aún router `/documentos`. **Toda esta sección 2.4 (Documentos) requiere pre-tareas backend.**

**Pre-tarea backend (común a las 3 sub-secciones):**

1. Crear `apps/api/src/bomberos_api/models/documentos.py` con modelos `AcervoDocumento`, `Oficio`, `Acta`.
2. Crear schemas en `schemas/documentos.py`.
3. Crear router `apps/api/src/bomberos_api/routers/documentos.py`.
4. Registrar router en `apps/api/src/bomberos_api/main.py`.
5. Migración Alembic.

**Acervo (documental):**

- Modelo: `id`, `titulo`, `tipo_documento_id`, `fecha_documento`, `autor`, `categoria` (`HISTORICO|ADMINISTRATIVO|LEGAL`), `signatura`, `archivo_url`, `descripcion`, `created_at`.
- Endpoint: `GET/POST /documentos/acervo`.

**Ruta UI:** `/documentos/acervo`. Icono: `Archive`.

**Filtros listado:** `q` (búsqueda título/autor), `categoria`, `tipo_documento_id`, rango de fechas.

**Form:** todos los campos + uploader URL (input type=url, integración real con S3 se haría en sprint posterior).

**Tareas:** 8 (7 + pre-tarea router común).

### 2.9 Documentos — Oficios

**Modelo:** `id`, `numero` (auto secuencia), `tipo` (`ENTRANTE|SALIENTE`), `fecha_emision`, `fecha_recepcion`, `remitente`, `destinatario`, `asunto`, `prioridad` (`NORMAL|URGENTE`), `estatus` (`PENDIENTE|EN_TRAMITE|RESUELTO|ARCHIVADO`), `archivo_url`.

**Ruta UI:** `/documentos/oficios`. Icono: `Mail`.

**Particularidad:** action "Cambiar estatus" en detalle (server action que hace PATCH al backend).

**Schema zod:**

```ts
export const oficioCreateSchema = z.object({
  tipo: z.enum(["ENTRANTE", "SALIENTE"]),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_recepcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  remitente: z.string().min(3).max(255),
  destinatario: z.string().min(3).max(255),
  asunto: z.string().min(3).max(500),
  prioridad: z.enum(["NORMAL", "URGENTE"]).default("NORMAL"),
  archivo_url: z.string().url().nullable().optional(),
}).refine(
  (d) => d.tipo !== "ENTRANTE" || d.fecha_recepcion,
  { message: "Oficios entrantes requieren fecha_recepcion", path: ["fecha_recepcion"] }
);
```

**Tareas:** 7 (la pre-tarea backend ya se hizo en 2.8).

### 2.10 Documentos — Actas

**Modelo:** `id`, `numero`, `tipo` (`SESION_GENERAL|REUNION_TECNICA|JUNTA_DISCIPLINARIA`), `fecha`, `lugar`, `participantes` (texto libre o array), `temas`, `acuerdos`, `archivo_url`.

**Ruta UI:** `/documentos/actas`. Icono: `FileText`.

**Particularidad:** detalle muestra acuerdos como lista numerada parseada de `acuerdos` (texto con saltos de línea), con copy-to-clipboard.

**Tareas:** 7.

### 2.11 Beneficios — Entregas

**Endpoint:** `GET/POST /beneficios/entregas` (asumir existe; el schema `EntregaCreate` ya está en `apps/api/src/bomberos_api/schemas/beneficios.py`).

**Schema `EntregaCreate`:** `funcionario_id`, `tipo_beneficio_id`, `periodo`, `monto`, `cantidad`, `fecha_entrega`, `referencia`, `documento_url`.

**Ruta UI:** `/beneficios/entregas`. Icono: `PackageCheck`.

**Listado columnas:** Fecha · Funcionario · Tipo beneficio · Período · Monto · Cantidad · Estatus.

**Filtros:** `tipo_beneficio_id`, `periodo`, rango fechas, `estatus`.

**Tareas:** 7 estándar.

### 2.12 Egresos — Jubilados

**Endpoint:** `GET/POST /egresos/jubilados`. Schema `JubiladoCreate` con `funcionario_id`, `fecha_jubilacion`, `años_servicio`, `tipo_jubilacion`, `pension_mensual`, `moneda` (default `VES`), `resolucion`.

**Ruta UI:** `/egresos/jubilados`. Icono: `BadgeCheck`.

**Filtros:** `activo` (Sí/No/Todos), rango años jubilación.

**Listado columnas:** Funcionario · Fecha jubilación · Años servicio · Tipo · Pensión · Activo.

**Particularidad backend:** `POST /egresos/jubilados` cierra el período activo via SP `personal.fn_registrar_egreso`. El frontend debe **mostrar warning** en el form: "Esta acción marcará al funcionario como JUBILADO y cerrará su período activo."

**Tareas:** 7 estándar.

### 2.13 Egresos — Solicitudes de jubilación

**Endpoint:** `GET/POST /egresos/solicitudes-jubilacion`. Schema `SolicitudJubilacionCreate` con `funcionario_id`, `fecha_solicitud`, `fecha_efectiva_propuesta`, `años_servicio`, `motivo`.

**Ruta UI:** `/egresos/solicitudes`. Icono: `FileClock`.

**Listado:** ordenado por `fecha_solicitud DESC`. Columnas: Funcionario · Fecha solicitud · Fecha propuesta · Años · Estatus.

**Estatus:** `PENDIENTE|APROBADA|RECHAZADA`. Badge color: amber/emerald/red.

**Acciones en detalle:** "Aprobar" (lleva a `/egresos/jubilados/nuevo` con datos prellenados), "Rechazar" (modal con `motivo_rechazo`).

**Tareas:** 7 estándar + acción de aprobación con server action.

### 2.14 Egresos — Fallecimientos

**Endpoint:** `POST /egresos/fallecimientos` (no hay GET en `egresos.py` actual — **agregar GET** como pre-tarea backend si se quiere listado).

**Schema `FallecimientoCreate`:** `funcionario_id`, `fecha_fallecimiento`, `en_servicio`, `causa`, `lugar`, `acta_defuncion`, `documento_url`.

**Ruta UI:** `/egresos/fallecimientos`. Icono: `Cross`.

**Particularidad backend:** también cierra período activo via SP. UI muestra warning equivalente al de jubilados.

**Pre-tarea backend:**

```python
@router.get("/fallecimientos", response_model=Page[FallecimientoOut])
async def listar_fallecimientos(...): ...
```

**Tareas:** 8 (7 + pre-tarea backend GET).

### 2.15 Perfil — MFA (referencia desde Sprint 3)

**Endpoint:** asumir endpoints MFA del Sprint 3: `POST /auth/mfa/enable` (devuelve QR + secret), `POST /auth/mfa/verify` (con código TOTP), `POST /auth/mfa/disable`.

**Ruta UI:** `/perfil/mfa`. Icono: `KeyRound`.

**Pantalla única (no listado/detalle):**
- Estado actual (habilitado/deshabilitado).
- Botón "Habilitar MFA" → muestra QR + input código verificación.
- Botón "Deshabilitar MFA" → confirmación con password actual.

**Particularidad:** el QR viene como base64 PNG del backend. Renderizar con `<img src="data:image/png;base64,...">`.

**Tareas:** 5 (no aplica list/detail/nuevo separados):

1. Test smoke (página carga, muestra estado actual).
2. Schema zod `mfaVerifySchema` (sólo código 6 dígitos).
3. `page.tsx` server component que consulta estado actual.
4. Componentes `EnableMFA` + `DisableMFA` (client components con server actions).
5. Sidebar: agregar bajo `/perfil` (sub-item) con icon `KeyRound`.

---

## Sección 3 — Verificación final

Antes de declarar el sprint cerrado, ejecutar **en orden**:

### 3.1 Typecheck y lint

```bash
cd apps/web
npm run typecheck
npm run lint
```

**Criterio:** `tsc --noEmit` con **0 errores**. ESLint con **0 errores** (warnings tolerados sólo si están justificados).

### 3.2 Tests

```bash
cd apps/web
npx playwright test
```

**Criterio:** todos los smoke tests en `tests/e2e/` pasan en chromium. Total esperado: ~16 specs (uno por módulo + admin existentes).

### 3.3 Build de producción

```bash
cd apps/web
npm run build
```

**Criterio:** build verde sin errores. Revisar output de tamaño por ruta — ninguna ruta nueva debe superar **150kB** First Load JS. Si alguna se va, mover datos pesados a server components o `dynamic` imports.

### 3.4 Lighthouse Performance ≥ 90 (mobile)

Para cada nueva ruta (15 listados + 15 detalles + 14 nuevos):

```bash
npx lighthouse http://localhost:3000/salud/lesiones \
  --preset=desktop \
  --only-categories=performance,accessibility \
  --chrome-flags="--headless" \
  --output=json --output-path=./lh-lesiones.json
```

Con preset mobile:

```bash
npx lighthouse http://localhost:3000/salud/lesiones \
  --form-factor=mobile \
  --only-categories=performance \
  --chrome-flags="--headless"
```

**Criterio:** Performance ≥ 90 mobile, Accessibility ≥ 95. Si falla:
- LCP > 2.5s → revisar carga de catálogos en server (usar `Promise.all`, ya hecho).
- CLS > 0.1 → revisar tablas sin reservar altura → agregar `min-h-[400px]` al `<div className="rounded-xl border">`.
- TBT > 200ms → revisar client components pesados, considerar `React.lazy`.

### 3.5 Test manual por rol mínimo + scope

Matriz de prueba **manual** (no automatizable de forma fiable):

| Módulo | Rol mínimo lectura | Rol mínimo escritura | Scope check |
|---|---|---|---|
| `/salud/lesiones` | SUPERVISOR | RRHH | funcionario_id de otra zona → 403/404 |
| `/salud/evaluacion-fisica` | SUPERVISOR | RRHH | idem |
| `/salud/hcm` | SUPERVISOR | RRHH | idem |
| `/carrera/evaluaciones` | SUPERVISOR | SUPERVISOR | periodo cerrado → no permite edit |
| `/carrera/reconocimientos` | SUPERVISOR | RRHH | — |
| `/carrera/meritos` | SUPERVISOR | RRHH (solo recalcular) | periodo cerrado → recalcular bloqueado |
| `/equipo/uniformes` | LOGISTICA | LOGISTICA | estacion fuera de scope → 403 |
| `/documentos/acervo` | LECTURA | RRHH | — |
| `/documentos/oficios` | LECTURA | RRHH | — |
| `/documentos/actas` | LECTURA | RRHH | — |
| `/beneficios/entregas` | RRHH | RRHH | — |
| `/egresos/jubilados` | RRHH | RRHH | — |
| `/egresos/solicitudes` | RRHH | RRHH | — |
| `/egresos/fallecimientos` | RRHH | RRHH | — |
| `/perfil/mfa` | self | self | sólo el propio usuario |

**Procedimiento por celda:**

1. Login con usuario que tenga **exactamente** el rol mínimo.
2. Visitar la ruta → debe cargar sin redirect.
3. Bajar rol al inferior → debe redirigir a `/dashboard` (gate de `requireRoleOrRedirect`).
4. Como rol de escritura, hacer POST → debe completar con 201.
5. Como rol de sólo lectura, hacer POST manual via DevTools → backend debe devolver 403 (gate del backend del Sprint 1).

### 3.6 Cobertura UI vs endpoints

Generar tabla de cobertura comparando endpoints reales del backend (extraer de `apps/api/src/bomberos_api/routers/*.py`) vs rutas frontend implementadas.

```bash
# Generar inventario de endpoints (manual, una vez):
cd apps/api
python -c "
from bomberos_api.main import app
for r in app.routes:
    if hasattr(r, 'methods'):
        for m in r.methods:
            if m != 'HEAD':
                print(f'{m:6s} {r.path}')
" | sort > /tmp/endpoints.txt
```

Y manualmente listar las rutas frontend en una checklist. **Criterio:** cada endpoint POST/PATCH/DELETE público (no `/admin/*`, no `/_internal/*`) tiene al menos una página o acción UI que lo invoca.

### 3.7 Accesibilidad y reduced-motion

Para cada listado nuevo:

- [ ] Navegable 100% por teclado (Tab/Enter/Esc).
- [ ] Focus visible (verificar Tailwind `:focus-visible` ring presente).
- [ ] Contraste AA en badges de estatus (usar [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/) con los hex de `ESTATUS_COLORS`).
- [ ] `role="alert"` en banners de error (ya plantillado).
- [ ] `<label htmlFor>` o anidado en todos los inputs (verificar `Field` helper).
- [ ] `prefers-reduced-motion`: no aplica fuertemente porque no hay GSAP en estos módulos. Si se agrega transición `transition-colors` está bien (no es movimiento físico).

### 3.8 Commit y release notes

Una vez todo verde:

```bash
git add apps/web/src apps/web/tests apps/api/src
git commit -m "feat(web): implementación Fase 4 — módulos UI completos"
```

Actualizar `docs/ROADMAP.md` §7 marcando Fase 4 como `DONE` con fecha.

Crear entry en `docs/PENDING.md` con cualquier deuda menor descubierta durante el desarrollo (ej: integración real de uploads, real-time updates con SSE, etc.).

---

## Resumen ejecutivo

| Sub-sección | Módulos | Tareas | Esfuerzo |
|---|---|---|---|
| 2.1–2.3 | Salud (lesiones, eval-fisica, hcm) | 22 | 18-24h |
| 2.4–2.6 | Carrera (evaluaciones, reconocimientos, meritos) | 21 | 16-22h |
| 2.7 | Equipo uniformes | 8 | 6-8h |
| 2.8–2.10 | Documentos (acervo, oficios, actas) | 23 | 18-26h |
| 2.11 | Beneficios entregas | 7 | 5-7h |
| 2.12–2.14 | Egresos (jubilados, solicitudes, fallecimientos) | 22 | 14-20h |
| 2.15 | Perfil MFA | 5 | 3-5h |
| **Total** | **15 módulos** | **108 tareas** | **80-112h** |

**Ruta crítica:**

1. Sección 1.7 — crear `requireServerRole` (bloquea todo lo demás).
2. Sección 1.10 — setup Playwright (bloquea tests).
3. Pre-tareas backend (2.3 HCM, 2.7 Uniformes, 2.8 Documentos, 2.14 Fallecimientos GET).
4. Resto en paralelo si hay 2 devs.
