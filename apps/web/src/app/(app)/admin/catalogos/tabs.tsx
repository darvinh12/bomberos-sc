"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useFormState } from "react-dom";
import { Check, X } from "lucide-react";
import {
  actualizarCat,
  borrarCat,
  crearCat,
  type CatFormState,
  type CatItem,
  type EntidadCat,
} from "./actions";

function BoolIcon({ value }: { value: boolean }) {
  return value ? (
    <Check className="w-4 h-4 text-emerald-400 inline" aria-label="Sí" />
  ) : (
    <X className="w-4 h-4 text-muted-foreground inline" aria-label="No" />
  );
}

type Tab = {
  key: EntidadCat;
  label: string;
  tieneActivo: boolean;
};

const TABS: Tab[] = [
  { key: "jerarquias", label: "Jerarquías", tieneActivo: true },
  { key: "cargos", label: "Cargos", tieneActivo: true },
  { key: "condiciones", label: "Condiciones", tieneActivo: true },
  { key: "niveles-educativos", label: "Niveles educativos", tieneActivo: false },
  { key: "especialidades", label: "Especialidades", tieneActivo: true },
  { key: "estados-civiles", label: "Estados civiles", tieneActivo: true },
  { key: "grupos-sanguineos", label: "Grupos sanguíneos", tieneActivo: false },
  { key: "bancos", label: "Bancos", tieneActivo: true },
  { key: "tipos-personal", label: "Tipos de personal", tieneActivo: true },
  { key: "estatus-funcionario", label: "Estatus funcionario", tieneActivo: true },
  { key: "instituciones-formadoras", label: "Instituciones formadoras", tieneActivo: true },
  { key: "tipos-vivienda", label: "Tipos de vivienda", tieneActivo: true },
  { key: "tenencias-vivienda", label: "Tenencias vivienda", tieneActivo: true },
  { key: "estados", label: "Estados (Venezuela)", tieneActivo: true },
  { key: "municipios", label: "Municipios", tieneActivo: true },
  { key: "parroquias", label: "Parroquias", tieneActivo: true },
];

export default function CatalogosTabs({
  data,
  estadosLista = [],
  municipiosLista = [],
}: {
  data: Record<EntidadCat, CatItem[]>;
  estadosLista?: CatItem[];
  municipiosLista?: CatItem[];
}) {
  const [active, setActive] = useState<EntidadCat>("jerarquias");
  const tabActual = TABS.find((t) => t.key === active)!;

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
            {t.label} ({data[t.key]?.length ?? 0})
          </button>
        ))}
      </div>
      <TablaCat
        key={active}
        entidad={active}
        items={data[active] ?? []}
        tieneActivo={tabActual.tieneActivo}
        estadosLista={estadosLista}
        municipiosLista={municipiosLista}
      />
    </div>
  );
}

function TablaCat({
  entidad,
  items,
  tieneActivo,
  estadosLista,
  municipiosLista,
}: {
  entidad: EntidadCat;
  items: CatItem[];
  tieneActivo: boolean;
  estadosLista: CatItem[];
  municipiosLista: CatItem[];
}) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const camposExtra = camposPorEntidad(entidad);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium"
        >
          {creando ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>

      {creando && (
        <FormCrear
          entidad={entidad}
          camposExtra={camposExtra}
          tieneActivo={tieneActivo}
          onDone={() => setCreando(false)}
          estadosLista={estadosLista}
          municipiosLista={municipiosLista}
        />
      )}

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Nombre</th>
              {camposExtra.map((c) => (
                <th key={c.name} className="text-left p-3">
                  {c.label}
                </th>
              ))}
              {tieneActivo && <th className="text-center p-3 w-20">Activo</th>}
              <th className="text-right p-3 w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const enEdicion = editando === it.id;
              if (enEdicion) {
                return (
                  <FilaEditar
                    key={it.id}
                    entidad={entidad}
                    item={it}
                    camposExtra={camposExtra}
                    tieneActivo={tieneActivo}
                    onDone={() => setEditando(null)}
                    colCount={2 + camposExtra.length + (tieneActivo ? 1 : 0) + 1}
                    estadosLista={estadosLista}
                    municipiosLista={municipiosLista}
                  />
                );
              }
              return (
                <Fila
                  key={it.id}
                  entidad={entidad}
                  item={it}
                  camposExtra={camposExtra}
                  tieneActivo={tieneActivo}
                  onEditar={() => setEditando(it.id)}
                  estadosLista={estadosLista}
                  municipiosLista={municipiosLista}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CampoExtra = {
  name: string;
  label: string;
  tipo: "texto" | "numero" | "checkbox" | "select_estado" | "select_municipio";
};

function camposPorEntidad(e: EntidadCat): CampoExtra[] {
  switch (e) {
    case "jerarquias":
      return [
        { name: "nombre_corto", label: "Abrev.", tipo: "texto" },
        { name: "orden", label: "Orden", tipo: "numero" },
        { name: "es_oficial", label: "Oficial", tipo: "checkbox" },
        { name: "es_tropa", label: "Tropa", tipo: "checkbox" },
        { name: "es_estado_mayor", label: "EM", tipo: "checkbox" },
      ];
    case "cargos":
      return [
        { name: "descripcion", label: "Descripción", tipo: "texto" },
        { name: "es_jefatura", label: "Jefatura", tipo: "checkbox" },
      ];
    case "niveles-educativos":
      return [{ name: "orden", label: "Orden", tipo: "numero" }];
    case "especialidades":
      return [{ name: "descripcion", label: "Descripción", tipo: "texto" }];
    case "bancos":
      return [{ name: "swift", label: "SWIFT", tipo: "texto" }];
    case "municipios":
      return [{ name: "estado_id", label: "Estado", tipo: "select_estado" }];
    case "parroquias":
      return [{ name: "municipio_id", label: "Municipio", tipo: "select_municipio" }];
    default:
      return [];
  }
}

function Fila({
  entidad,
  item,
  camposExtra,
  tieneActivo,
  onEditar,
  estadosLista,
  municipiosLista,
}: {
  entidad: EntidadCat;
  item: CatItem;
  camposExtra: CampoExtra[];
  tieneActivo: boolean;
  onEditar: () => void;
  estadosLista: CatItem[];
  municipiosLista: CatItem[];
}) {
  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="p-3 font-mono text-xs">{item.codigo}</td>
      <td className="p-3 font-medium">{item.nombre}</td>
      {camposExtra.map((c) => {
        const raw = (item as Record<string, unknown>)[c.name];
        if (c.tipo === "checkbox") {
          return (
            <td key={c.name} className="p-3 text-muted-foreground">
              {raw ? <BoolIcon value={true} /> : <span>—</span>}
            </td>
          );
        }
        if (c.tipo === "select_estado") {
          const estado = estadosLista.find((x) => x.id === Number(raw));
          return (
            <td key={c.name} className="p-3 text-muted-foreground">
              {estado?.nombre ?? "—"}
            </td>
          );
        }
        if (c.tipo === "select_municipio") {
          const muni = municipiosLista.find((x) => x.id === Number(raw));
          return (
            <td key={c.name} className="p-3 text-muted-foreground">
              {muni?.nombre ?? "—"}
            </td>
          );
        }
        return (
          <td key={c.name} className="p-3 text-muted-foreground">
            {(raw as string | number | null) ?? "—"}
          </td>
        );
      })}
      {tieneActivo && (
        <td className="p-3 text-center"><BoolIcon value={item.activo ?? false} /></td>
      )}
      <BotonesFila id={item.id} entidad={entidad} onEditar={onEditar} />
    </tr>
  );
}

function FormCrear({
  entidad,
  camposExtra,
  tieneActivo,
  onDone,
  estadosLista,
  municipiosLista,
}: {
  entidad: EntidadCat;
  camposExtra: CampoExtra[];
  tieneActivo: boolean;
  onDone: () => void;
  estadosLista: CatItem[];
  municipiosLista: CatItem[];
}) {
  const [state, action] = useFormState<CatFormState, FormData>(
    (s, fd) => crearCat(entidad, s, fd),
    {},
  );
  if (state.ok) queueMicrotask(onDone);
  return (
    <form action={action} className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Nuevo registro</h3>
      {state.error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive"
        >
          {state.error}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Input name="codigo" label="Código" uppercase required />
        <Input name="nombre" label="Nombre" required />
        {camposExtra.map((c) => {
          if (c.tipo === "checkbox") {
            return (
              <label key={c.name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={c.name} />
                {c.label}
              </label>
            );
          }
          if (c.tipo === "select_estado") {
            return (
              <SelectFK
                key={c.name}
                name={c.name}
                label={c.label}
                options={estadosLista}
                required
              />
            );
          }
          if (c.tipo === "select_municipio") {
            return (
              <SelectFK
                key={c.name}
                name={c.name}
                label={c.label}
                options={municipiosLista}
                required
              />
            );
          }
          return (
            <Input
              key={c.name}
              name={c.name}
              label={c.label}
              type={c.tipo === "numero" ? "number" : "text"}
            />
          );
        })}
        {tieneActivo && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="activo" defaultChecked />
            Activo
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
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

function FilaEditar({
  entidad,
  item,
  camposExtra,
  tieneActivo,
  onDone,
  colCount,
  estadosLista,
  municipiosLista,
}: {
  entidad: EntidadCat;
  item: CatItem;
  camposExtra: CampoExtra[];
  tieneActivo: boolean;
  onDone: () => void;
  colCount: number;
  estadosLista: CatItem[];
  municipiosLista: CatItem[];
}) {
  const [nombre, setNombre] = useState(item.nombre);
  const [activo, setActivo] = useState<boolean>(item.activo ?? true);
  const [extra, setExtra] = useState<Record<string, unknown>>(() => {
    const o: Record<string, unknown> = {};
    for (const c of camposExtra) o[c.name] = (item as Record<string, unknown>)[c.name];
    return o;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const guardar = () => {
    setError(null);
    const data: Record<string, unknown> = { nombre, ...extra };
    if (tieneActivo) data.activo = activo;
    start(async () => {
      const r = await actualizarCat(entidad, item.id, data);
      if (r.ok) onDone();
      else setError(r.error ?? "Error");
    });
  };
  return (
    <tr className="border-t bg-muted/10">
      <td colSpan={colCount} className="p-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Código</div>
            <div className="font-mono">{item.codigo}</div>
          </div>
          <Labeled label="Nombre" value={nombre} onChange={setNombre} />
          {camposExtra.map((c) => {
            if (c.tipo === "checkbox") {
              return (
                <label key={c.name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!extra[c.name]}
                    onChange={(e) =>
                      setExtra({ ...extra, [c.name]: e.target.checked })
                    }
                  />
                  {c.label}
                </label>
              );
            }
            if (c.tipo === "numero") {
              return (
                <Labeled
                  key={c.name}
                  label={c.label}
                  value={String(extra[c.name] ?? 0)}
                  onChange={(v) => setExtra({ ...extra, [c.name]: Number(v) })}
                  type="number"
                />
              );
            }
            if (c.tipo === "select_estado" || c.tipo === "select_municipio") {
              const options =
                c.tipo === "select_estado" ? estadosLista : municipiosLista;
              const current = Number(extra[c.name] ?? 0);
              const inputId = `edit-${item.id}-${c.name}`;
              return (
                <label key={c.name} htmlFor={inputId} className="block">
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                  <select
                    id={inputId}
                    value={current || ""}
                    onChange={(e) =>
                      setExtra({
                        ...extra,
                        [c.name]: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— Seleccioná —</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <Labeled
                key={c.name}
                label={c.label}
                value={String(extra[c.name] ?? "")}
                onChange={(v) => setExtra({ ...extra, [c.name]: v || null })}
              />
            );
          })}
          {tieneActivo && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              Activo
            </label>
          )}
        </div>
        {error && (
          <div
            role="alert"
            className="mt-2 rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border px-3 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Input({
  name,
  label,
  type,
  uppercase,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  uppercase?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type ?? "text"}
        required={required}
        className={`mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm ${uppercase ? "uppercase font-mono" : ""}`}
      />
    </label>
  );
}

function Labeled({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function SelectFK({
  name,
  label,
  options,
  required,
}: {
  name: string;
  label: string;
  options: CatItem[];
  required?: boolean;
}) {
  return (
    <label htmlFor={`new-${name}`} className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        id={`new-${name}`}
        name={name}
        required={required}
        defaultValue=""
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        <option value="">— Seleccioná —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

function BotonesFila({
  id,
  entidad,
  onEditar,
}: {
  id: number;
  entidad: EntidadCat;
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
                Si está en uso por algún funcionario, no se puede borrar — el
                sistema lo bloquea. En ese caso desactivalo (activo=false).
              </p>
              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive"
                >
                  {error}
                </div>
              )}
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
                      const r = await borrarCat(entidad, id);
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
