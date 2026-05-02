"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  asignarComision,
  iniciarReposo,
  jubilar,
  preJubilar,
  registrarFallecimiento,
  sancionar,
  type AccionState,
} from "./actions";

type AccionKey =
  | "reposo"
  | "comision"
  | "sancion"
  | "pre-jubilar"
  | "jubilar"
  | "fallecimiento";

interface AccionDef {
  key: AccionKey;
  label: string;
  icon: string;
  color: string;
  disabled?: (estatus: string) => boolean;
}

const ACCIONES: AccionDef[] = [
  { key: "reposo", label: "Iniciar reposo", icon: "🏥", color: "bg-yellow-500", disabled: (s) => s !== "ACTIVO" },
  { key: "comision", label: "Asignar a comisión", icon: "📋", color: "bg-blue-500", disabled: (s) => !["ACTIVO", "REPOSO"].includes(s) },
  { key: "sancion", label: "Sancionar", icon: "⚠️", color: "bg-orange-500" },
  { key: "pre-jubilar", label: "Solicitar jubilación", icon: "📝", color: "bg-purple-500", disabled: (s) => ["JUBILADO", "FALLECIDO", "EGRESADO"].includes(s) },
  { key: "jubilar", label: "Jubilar", icon: "🏁", color: "bg-purple-700", disabled: (s) => ["JUBILADO", "FALLECIDO", "EGRESADO"].includes(s) },
  { key: "fallecimiento", label: "Registrar fallecimiento", icon: "🕊️", color: "bg-gray-700", disabled: (s) => ["FALLECIDO", "EGRESADO"].includes(s) },
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Procesando…" : label}
    </button>
  );
}

const initial: AccionState = {};

export default function PanelAcciones({
  funcionarioId,
  estatus,
}: {
  funcionarioId: number;
  estatus: string;
}) {
  const [abierto, setAbierto] = useState<AccionKey | null>(null);

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold mb-4">Acciones</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {ACCIONES.map((a) => {
          const dis = a.disabled?.(estatus);
          return (
            <button
              key={a.key}
              onClick={() => setAbierto(abierto === a.key ? null : a.key)}
              disabled={dis}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs font-medium hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed transition ${
                abierto === a.key ? "border-primary bg-primary/5" : ""
              }`}
            >
              <span className="text-2xl">{a.icon}</span>
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>

      {abierto === "reposo" && (
        <ReposoForm funcionarioId={funcionarioId} onClose={() => setAbierto(null)} />
      )}
      {abierto === "comision" && (
        <ComisionForm funcionarioId={funcionarioId} onClose={() => setAbierto(null)} />
      )}
      {abierto === "sancion" && (
        <SancionForm funcionarioId={funcionarioId} onClose={() => setAbierto(null)} />
      )}
      {abierto === "pre-jubilar" && (
        <PreJubilarForm funcionarioId={funcionarioId} onClose={() => setAbierto(null)} />
      )}
      {abierto === "jubilar" && (
        <JubilarForm funcionarioId={funcionarioId} onClose={() => setAbierto(null)} />
      )}
      {abierto === "fallecimiento" && (
        <FallecimientoForm funcionarioId={funcionarioId} onClose={() => setAbierto(null)} />
      )}
    </section>
  );
}

function FormWrapper({
  title,
  state,
  onClose,
  children,
  submitLabel,
}: {
  title: string;
  state: AccionState;
  onClose: () => void;
  children: React.ReactNode;
  submitLabel: string;
}) {
  return (
    <div className="mt-4 p-4 border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {state.error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2 text-xs text-destructive mb-3">
          {state.error}
        </div>
      )}
      <div className="space-y-3">{children}</div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-input px-3 py-2 text-xs hover:bg-accent"
        >
          Cancelar
        </button>
        <Submit label={submitLabel} />
      </div>
    </div>
  );
}

function ReposoForm({ funcionarioId, onClose }: { funcionarioId: number; onClose: () => void }) {
  const [state, action] = useFormState(iniciarReposo.bind(null, funcionarioId), initial);
  return (
    <form action={action}>
      <FormWrapper title="Iniciar reposo" state={state} onClose={onClose} submitLabel="Registrar reposo">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Tipo *</label>
            <select name="tipo_reposo_id" required defaultValue="1" className="input">
              <option value="1">Médico</option>
              <option value="2">Reposo postoperatorio</option>
              <option value="3">Maternidad</option>
              <option value="4">Lesión en servicio</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Inicio *</label>
            <input type="date" name="fecha_inicio" required className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Fin *</label>
            <input type="date" name="fecha_fin" required className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Diagnóstico</label>
          <input name="diagnostico_libre" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Folio</label>
          <input name="folio" className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Observaciones</label>
          <textarea name="observaciones" rows={2} className="input" />
        </div>
      </FormWrapper>
    </form>
  );
}

function ComisionForm({ funcionarioId, onClose }: { funcionarioId: number; onClose: () => void }) {
  const [state, action] = useFormState(asignarComision.bind(null, funcionarioId), initial);
  return (
    <form action={action}>
      <FormWrapper title="Asignar a comisión de servicio" state={state} onClose={onClose} submitLabel="Asignar">
        <div>
          <label className="block text-xs font-medium mb-1">Institución *</label>
          <input name="institucion_libre" required className="input" placeholder="ej. Protección Civil" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Cargo en comisión</label>
          <input name="cargo_comision" className="input" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Inicio *</label>
            <input type="date" name="fecha_inicio" required className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Fin (opcional)</label>
            <input type="date" name="fecha_fin" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Resolución</label>
          <input name="resolucion" className="input" placeholder="ej. RES-2026-100" />
        </div>
      </FormWrapper>
    </form>
  );
}

function SancionForm({ funcionarioId, onClose }: { funcionarioId: number; onClose: () => void }) {
  const [state, action] = useFormState(sancionar.bind(null, funcionarioId), initial);
  return (
    <form action={action}>
      <FormWrapper title="Registrar falta y sanción" state={state} onClose={onClose} submitLabel="Registrar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Tipo *</label>
            <select name="tipo_falta" required className="input">
              <option value="LEVE">Leve</option>
              <option value="MEDIA">Media</option>
              <option value="GRAVE">Grave</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Fecha *</label>
            <input type="date" name="fecha" required className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Descripción *</label>
          <textarea name="descripcion" required rows={3} className="input" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Sanción</label>
            <input name="sancion" className="input" placeholder="ej. Suspensión 5 días" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Días suspensión</label>
            <input type="number" name="dias_suspension" min="0" className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Resolución</label>
            <input name="resolucion" className="input" />
          </div>
        </div>
      </FormWrapper>
    </form>
  );
}

function PreJubilarForm({ funcionarioId, onClose }: { funcionarioId: number; onClose: () => void }) {
  const [state, action] = useFormState(preJubilar.bind(null, funcionarioId), initial);
  return (
    <form action={action}>
      <FormWrapper title="Solicitar jubilación" state={state} onClose={onClose} submitLabel="Crear solicitud">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Fecha solicitud *</label>
            <input type="date" name="fecha_solicitud" required className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Efectiva propuesta</label>
            <input type="date" name="fecha_efectiva_propuesta" className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Años de servicio</label>
            <input type="number" step="0.5" name="años_servicio" className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Motivo</label>
          <textarea name="motivo" rows={2} className="input" />
        </div>
      </FormWrapper>
    </form>
  );
}

function JubilarForm({ funcionarioId, onClose }: { funcionarioId: number; onClose: () => void }) {
  const [state, action] = useFormState(jubilar.bind(null, funcionarioId), initial);
  return (
    <form action={action}>
      <FormWrapper title="Ejecutar jubilación" state={state} onClose={onClose} submitLabel="Jubilar (irreversible)">
        <div className="rounded-md bg-yellow-50 border border-yellow-300 p-2 text-xs text-yellow-800">
          ⚠️ Esto cierra el período de servicio del funcionario y cambia su estatus a JUBILADO.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Fecha jubilación *</label>
            <input type="date" name="fecha_jubilacion" required className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tipo</label>
            <select name="tipo_jubilacion" defaultValue="ORDINARIA" className="input">
              <option value="ORDINARIA">Ordinaria</option>
              <option value="INVALIDEZ">Invalidez</option>
              <option value="ESPECIAL">Especial</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Años servicio</label>
            <input type="number" step="0.5" name="años_servicio" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Pensión mensual</label>
            <input type="number" step="0.01" name="pension_mensual" className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Moneda</label>
            <select name="moneda" defaultValue="VES" className="input">
              <option value="VES">VES (Bolívares)</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Resolución</label>
          <input name="resolucion" className="input" />
        </div>
      </FormWrapper>
    </form>
  );
}

function FallecimientoForm({
  funcionarioId,
  onClose,
}: {
  funcionarioId: number;
  onClose: () => void;
}) {
  const [state, action] = useFormState(
    registrarFallecimiento.bind(null, funcionarioId),
    initial,
  );
  return (
    <form action={action}>
      <FormWrapper
        title="Registrar fallecimiento"
        state={state}
        onClose={onClose}
        submitLabel="Registrar (irreversible)"
      >
        <div className="rounded-md bg-yellow-50 border border-yellow-300 p-2 text-xs text-yellow-800">
          ⚠️ Cierra el período de servicio y cambia el estatus a FALLECIDO.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Fecha *</label>
            <input type="date" name="fecha_fallecimiento" required className="input" />
          </div>
          <div className="flex items-center gap-2 mt-5">
            <input type="checkbox" name="en_servicio" id="en_servicio" />
            <label htmlFor="en_servicio" className="text-sm">
              En servicio activo
            </label>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Causa</label>
          <input name="causa" className="input" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Lugar</label>
            <input name="lugar" className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Acta de defunción</label>
            <input name="acta_defuncion" className="input" />
          </div>
        </div>
      </FormWrapper>
    </form>
  );
}
