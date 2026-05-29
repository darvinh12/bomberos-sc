"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useFormState } from "react-dom";
import { Check, X } from "lucide-react";
import {
  actualizarOrg,
  borrarOrg,
  crearOrg,
  type EntidadOrg,
  type Estacion,
  type Org,
  type OrgFormState,
  type Zona,
} from "./actions";

function BoolIcon({ value }: { value: boolean }) {
  return value ? (
    <Check className="w-4 h-4 text-emerald-400 inline" aria-label="Activo" />
  ) : (
    <X className="w-4 h-4 text-muted-foreground inline" aria-label="Inactivo" />
  );
}

type Tab = {
  key: EntidadOrg;
  label: string;
};

const TABS: Tab[] = [
  { key: "zonas", label: "Zonas" },
  { key: "estaciones", label: "Estaciones" },
  { key: "divisiones", label: "Divisiones" },
  { key: "areas", label: "Áreas" },
  { key: "dependencias", label: "Dependencias" },
];

export default function OrgTabs({
  zonas,
  estaciones,
  divisiones,
  areas,
  dependencias,
}: {
  zonas: Zona[];
  estaciones: Estacion[];
  divisiones: Org[];
  areas: Org[];
  dependencias: Org[];
}) {
  const [active, setActive] = useState<EntidadOrg>("zonas");

  return (
    <div className="space-y-4">
      <div className="border-b flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
              active === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "zonas" && <ZonasTab items={zonas} />}
      {active === "estaciones" && (
        <EstacionesTab items={estaciones} zonas={zonas} />
      )}
      {active === "divisiones" && (
        <PlanaTab entidad="divisiones" items={divisiones} parents={null} />
      )}
      {active === "areas" && (
        <PlanaTab
          entidad="areas"
          items={areas}
          parents={{ label: "División", items: divisiones }}
        />
      )}
      {active === "dependencias" && (
        <PlanaTab
          entidad="dependencias"
          items={dependencias}
          parents={{ label: "Área", items: areas }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Zonas
// ============================================================================

function ZonasTab({ items }: { items: Zona[] }) {
  const [creando, setCreando] = useState(false);
  return (
    <div className="space-y-3">
      <BotonNuevo onClick={() => setCreando((v) => !v)} cancelando={creando} />
      {creando && <ZonaForm onDone={() => setCreando(false)} />}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">Descripción</th>
              <th className="text-center p-3 w-20">Activo</th>
              <th className="text-right p-3 w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((z) => (
              <ZonaFila key={z.id} z={z} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZonaForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useFormState<OrgFormState, FormData>(
    (s, fd) => crearOrg("zonas", s, fd),
    {},
  );
  if (state.ok) queueMicrotask(onDone);
  return (
    <FormShell title="Nueva zona" state={state} onCancel={onDone} action={action}>
      <CampoTexto name="codigo" label="Código" placeholder="Z5" uppercase required />
      <CampoTexto name="nombre" label="Nombre" placeholder="Zona 5 — Sur" required />
      <CampoTexto name="descripcion" label="Descripción (opcional)" className="sm:col-span-2" />
      <CampoActivo name="activo" defaultChecked />
    </FormShell>
  );
}

function ZonaFila({ z }: { z: Zona }) {
  const [edit, setEdit] = useState(false);
  if (edit)
    return (
      <ZonaEditar z={z} onDone={() => setEdit(false)} />
    );
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="p-3 font-mono text-xs">{z.codigo}</td>
      <td className="p-3 font-medium">{z.nombre}</td>
      <td className="p-3 text-muted-foreground">{z.descripcion ?? "—"}</td>
      <td className="p-3 text-center"><BoolIcon value={z.activo} /></td>
      <BotonesFila id={z.id} entidad="zonas" onEditar={() => setEdit(true)} />
    </tr>
  );
}

function ZonaEditar({ z, onDone }: { z: Zona; onDone: () => void }) {
  const [nombre, setNombre] = useState(z.nombre);
  const [descripcion, setDescripcion] = useState(z.descripcion ?? "");
  const [activo, setActivo] = useState(z.activo);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const guardar = () => {
    setError(null);
    start(async () => {
      const r = await actualizarOrg("zonas", z.id, {
        nombre,
        descripcion: descripcion || null,
        activo,
      });
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };
  return (
    <tr className="border-t bg-muted/10">
      <td colSpan={5} className="p-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Código</div>
            <div className="font-mono">{z.codigo}</div>
          </div>
          <LabeledInput label="Nombre" value={nombre} onChange={setNombre} />
          <LabeledInput
            label="Descripción"
            value={descripcion}
            onChange={setDescripcion}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Activo
          </label>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <BotonesGuardar onCancel={onDone} onSave={guardar} pending={pending} />
      </td>
    </tr>
  );
}

// ============================================================================
// Estaciones
// ============================================================================

function EstacionesTab({ items, zonas }: { items: Estacion[]; zonas: Zona[] }) {
  const [creando, setCreando] = useState(false);
  const zonaNombre = useMemo(() => {
    const m = new Map<number, string>();
    for (const z of zonas) m.set(z.id, z.nombre);
    return m;
  }, [zonas]);
  return (
    <div className="space-y-3">
      <BotonNuevo onClick={() => setCreando((v) => !v)} cancelando={creando} />
      {creando && <EstacionForm zonas={zonas} onDone={() => setCreando(false)} />}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">Zona</th>
              <th className="text-left p-3">Dirección</th>
              <th className="text-left p-3">Teléfono</th>
              <th className="text-center p-3 w-20">Activa</th>
              <th className="text-right p-3 w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <EstacionFila key={e.id} e={e} zonas={zonas} zonaNombre={zonaNombre} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EstacionForm({
  zonas,
  onDone,
}: {
  zonas: Zona[];
  onDone: () => void;
}) {
  const [state, action] = useFormState<OrgFormState, FormData>(
    (s, fd) => crearOrg("estaciones", s, fd),
    {},
  );
  if (state.ok) queueMicrotask(onDone);
  return (
    <FormShell title="Nueva estación" state={state} onCancel={onDone} action={action}>
      <CampoTexto name="codigo" label="Código" placeholder="E13" uppercase required />
      <CampoTexto name="nombre" label="Nombre" placeholder="Estación La Pastora" required />
      <label className="block">
        <span className="text-xs text-muted-foreground">Zona</span>
        <select
          name="zona_id"
          required
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {zonas.filter((z) => z.activo).map((z) => (
            <option key={z.id} value={z.id}>{z.nombre}</option>
          ))}
        </select>
      </label>
      <CampoTexto name="nombre_corto" label="Nombre corto" placeholder="EPAS" />
      <CampoTexto name="direccion" label="Dirección" className="sm:col-span-2" />
      <CampoTexto name="telefono" label="Teléfono" />
      <CampoActivo name="activa" defaultChecked />
    </FormShell>
  );
}

function EstacionFila({
  e,
  zonas,
  zonaNombre,
}: {
  e: Estacion;
  zonas: Zona[];
  zonaNombre: Map<number, string>;
}) {
  const [edit, setEdit] = useState(false);
  if (edit) return <EstacionEditar e={e} zonas={zonas} onDone={() => setEdit(false)} />;
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="p-3 font-mono text-xs">{e.codigo}</td>
      <td className="p-3 font-medium">{e.nombre}</td>
      <td className="p-3 text-muted-foreground">{zonaNombre.get(e.zona_id) ?? `#${e.zona_id}`}</td>
      <td className="p-3 text-muted-foreground truncate max-w-xs">{e.direccion ?? "—"}</td>
      <td className="p-3 text-muted-foreground">{e.telefono ?? "—"}</td>
      <td className="p-3 text-center"><BoolIcon value={e.activa} /></td>
      <BotonesFila id={e.id} entidad="estaciones" onEditar={() => setEdit(true)} />
    </tr>
  );
}

function EstacionEditar({
  e,
  zonas,
  onDone,
}: {
  e: Estacion;
  zonas: Zona[];
  onDone: () => void;
}) {
  const [nombre, setNombre] = useState(e.nombre);
  const [zonaId, setZonaId] = useState(e.zona_id);
  const [direccion, setDireccion] = useState(e.direccion ?? "");
  const [telefono, setTelefono] = useState(e.telefono ?? "");
  const [activa, setActiva] = useState(e.activa);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const guardar = () => {
    setError(null);
    start(async () => {
      const r = await actualizarOrg("estaciones", e.id, {
        nombre,
        zona_id: zonaId,
        direccion: direccion || null,
        telefono: telefono || null,
        activa,
      });
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };
  return (
    <tr className="border-t bg-muted/10">
      <td colSpan={7} className="p-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Código</div>
            <div className="font-mono">{e.codigo}</div>
          </div>
          <LabeledInput label="Nombre" value={nombre} onChange={setNombre} />
          <label className="block">
            <span className="text-xs text-muted-foreground">Zona</span>
            <select
              value={zonaId}
              onChange={(ev) => setZonaId(Number(ev.target.value))}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>{z.nombre}</option>
              ))}
            </select>
          </label>
          <LabeledInput label="Dirección" value={direccion} onChange={setDireccion} />
          <LabeledInput label="Teléfono" value={telefono} onChange={setTelefono} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activa}
              onChange={(ev) => setActiva(ev.target.checked)}
            />
            Activa
          </label>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <BotonesGuardar onCancel={onDone} onSave={guardar} pending={pending} />
      </td>
    </tr>
  );
}

// ============================================================================
// Divisiones / Áreas / Dependencias (genérico)
// ============================================================================

function PlanaTab({
  entidad,
  items,
  parents,
}: {
  entidad: EntidadOrg;
  items: Org[];
  parents: { label: string; items: Org[] } | null;
}) {
  const [creando, setCreando] = useState(false);
  const parentNombre = useMemo(() => {
    if (!parents) return new Map<number, string>();
    const m = new Map<number, string>();
    for (const p of parents.items) m.set(p.id, p.nombre);
    return m;
  }, [parents]);
  return (
    <div className="space-y-3">
      <BotonNuevo onClick={() => setCreando((v) => !v)} cancelando={creando} />
      {creando && (
        <PlanaForm
          entidad={entidad}
          parents={parents}
          onDone={() => setCreando(false)}
        />
      )}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Nombre</th>
              {parents && <th className="text-left p-3">{parents.label}</th>}
              <th className="text-center p-3 w-20">Activo</th>
              <th className="text-right p-3 w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <PlanaFila
                key={it.id}
                entidad={entidad}
                it={it}
                parents={parents}
                parentNombre={parentNombre}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanaForm({
  entidad,
  parents,
  onDone,
}: {
  entidad: EntidadOrg;
  parents: { label: string; items: Org[] } | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState<OrgFormState, FormData>(
    (s, fd) => crearOrg(entidad, s, fd),
    {},
  );
  if (state.ok) queueMicrotask(onDone);
  return (
    <FormShell
      title={`Nuevo registro · ${entidad}`}
      state={state}
      onCancel={onDone}
      action={action}
    >
      <CampoTexto name="codigo" label="Código" uppercase required />
      <CampoTexto name="nombre" label="Nombre" required />
      {parents && (
        <label className="block">
          <span className="text-xs text-muted-foreground">
            {parents.label} (opcional)
          </span>
          <select
            name="parent_id"
            defaultValue=""
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">— sin asignar —</option>
            {parents.items.filter((p) => p.activo).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
      )}
      <CampoActivo name="activo" defaultChecked />
    </FormShell>
  );
}

function PlanaFila({
  entidad,
  it,
  parents,
  parentNombre,
}: {
  entidad: EntidadOrg;
  it: Org;
  parents: { label: string; items: Org[] } | null;
  parentNombre: Map<number, string>;
}) {
  const [edit, setEdit] = useState(false);
  if (edit)
    return (
      <PlanaEditar
        entidad={entidad}
        it={it}
        parents={parents}
        onDone={() => setEdit(false)}
      />
    );
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="p-3 font-mono text-xs">{it.codigo}</td>
      <td className="p-3 font-medium">{it.nombre}</td>
      {parents && (
        <td className="p-3 text-muted-foreground">
          {it.parent_id ? parentNombre.get(it.parent_id) ?? `#${it.parent_id}` : "—"}
        </td>
      )}
      <td className="p-3 text-center"><BoolIcon value={it.activo} /></td>
      <BotonesFila id={it.id} entidad={entidad} onEditar={() => setEdit(true)} />
    </tr>
  );
}

function PlanaEditar({
  entidad,
  it,
  parents,
  onDone,
}: {
  entidad: EntidadOrg;
  it: Org;
  parents: { label: string; items: Org[] } | null;
  onDone: () => void;
}) {
  const [nombre, setNombre] = useState(it.nombre);
  const [parentId, setParentId] = useState<number | null>(it.parent_id);
  const [activo, setActivo] = useState(it.activo);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const guardar = () => {
    setError(null);
    start(async () => {
      const r = await actualizarOrg(entidad, it.id, {
        nombre,
        parent_id: parentId,
        activo,
      });
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };
  const colCount = parents ? 5 : 4;
  return (
    <tr className="border-t bg-muted/10">
      <td colSpan={colCount} className="p-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Código</div>
            <div className="font-mono">{it.codigo}</div>
          </div>
          <LabeledInput label="Nombre" value={nombre} onChange={setNombre} />
          {parents && (
            <label className="block">
              <span className="text-xs text-muted-foreground">{parents.label}</span>
              <select
                value={parentId ?? ""}
                onChange={(e) =>
                  setParentId(e.target.value ? Number(e.target.value) : null)
                }
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">— sin asignar —</option>
                {parents.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            Activo
          </label>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <BotonesGuardar onCancel={onDone} onSave={guardar} pending={pending} />
      </td>
    </tr>
  );
}

// ============================================================================
// Helpers UI
// ============================================================================

function BotonNuevo({ onClick, cancelando }: { onClick: () => void; cancelando: boolean }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onClick}
        className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
      >
        {cancelando ? "Cancelar" : "+ Nuevo"}
      </button>
    </div>
  );
}

function FormShell({
  title,
  state,
  action,
  onCancel,
  children,
}: {
  title: string;
  state: OrgFormState;
  action: (fd: FormData) => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <form action={action} className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {state.error && <ErrorBox>{state.error}</ErrorBox>}
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
        >
          Crear
        </button>
      </div>
    </form>
  );
}

function CampoTexto({
  name,
  label,
  placeholder,
  uppercase,
  required,
  className,
}: {
  name: string;
  label: string;
  placeholder?: string;
  uppercase?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        required={required}
        className={`mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm ${uppercase ? "uppercase font-mono" : ""}`}
      />
    </label>
  );
}

function CampoActivo({ name, defaultChecked }: { name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      Activo
    </label>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive">
      {children}
    </div>
  );
}

function BotonesGuardar({
  onCancel,
  onSave,
  pending,
}: {
  onCancel: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border px-3 py-2 text-sm"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

function BotonesFila({
  id,
  entidad,
  onEditar,
}: {
  id: number;
  entidad: EntidadOrg;
  onEditar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <td className="p-3 text-right space-x-2">
      <button type="button" onClick={onEditar} className="text-xs underline">
        editar
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-xs underline text-destructive"
      >
        borrar
      </button>
      {confirmando &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-card rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
              <h3 className="font-semibold">¿Borrar este registro?</h3>
              <p className="text-sm text-muted-foreground">
                Si tiene hijos asignados (estaciones, áreas, etc.), te avisará y
                tendrás que reasignarlos antes.
              </p>
              {error && <ErrorBox>{error}</ErrorBox>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    start(async () => {
                      const r = await borrarOrg(entidad, id);
                      if (r.ok) setConfirmando(false);
                      else setError(r.error ?? "Error");
                    });
                  }}
                  disabled={pending}
                  className="rounded-md bg-destructive text-destructive-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {pending ? "Borrando…" : "Borrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </td>
  );
}
