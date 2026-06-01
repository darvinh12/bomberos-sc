"use client";

import { useState, useTransition } from "react";
import { Mail, KeyRound, Power, Lock, Check, X, Loader2 } from "lucide-react";
import {
  actualizarCorreo,
  resetearPassword,
  toggleActivo,
  toggleBloqueado,
} from "./actions";

interface Props {
  usuarioId: number;
  correoActual: string | null;
  activo: boolean;
  bloqueado: boolean;
  motivoBloqueo: string | null;
}

type Toast =
  | { tipo: "ok"; msg: string }
  | { tipo: "err"; msg: string }
  | null;

export default function CuentaEditor({
  usuarioId,
  correoActual,
  activo,
  bloqueado,
  motivoBloqueo,
}: Props) {
  const [toast, setToast] = useState<Toast>(null);

  function notificar(t: Exclude<Toast, null>) {
    setToast(t);
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-sm flex items-center gap-2 ${
            toast.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.tipo === "ok" ? (
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          ) : (
            <X className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          {toast.msg}
        </div>
      )}

      <EditarCorreo
        usuarioId={usuarioId}
        correoActual={correoActual}
        onResultado={notificar}
      />

      <ResetearPassword usuarioId={usuarioId} onResultado={notificar} />

      <ActivoToggle
        usuarioId={usuarioId}
        activo={activo}
        onResultado={notificar}
      />

      <BloqueadoToggle
        usuarioId={usuarioId}
        bloqueado={bloqueado}
        motivoActual={motivoBloqueo}
        onResultado={notificar}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────

function Bloque({
  Icon,
  titulo,
  descripcion,
  children,
}: {
  Icon: typeof Mail;
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
          <Icon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">{titulo}</div>
          <div className="text-xs text-muted-foreground">{descripcion}</div>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function EditarCorreo({
  usuarioId,
  correoActual,
  onResultado,
}: {
  usuarioId: number;
  correoActual: string | null;
  onResultado: (t: { tipo: "ok" | "err"; msg: string }) => void;
}) {
  const [editar, setEditar] = useState(false);
  const [valor, setValor] = useState(correoActual ?? "");
  const [pending, start] = useTransition();

  const guardar = () => {
    start(async () => {
      const res = await actualizarCorreo(usuarioId, valor.trim() || null);
      if (res.ok) {
        onResultado({ tipo: "ok", msg: "Correo actualizado" });
        setEditar(false);
      } else {
        onResultado({ tipo: "err", msg: res.error ?? "Error" });
      }
    });
  };

  return (
    <Bloque Icon={Mail} titulo="Correo electrónico" descripcion="Para notificaciones y recuperación.">
      {!editar ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground font-mono truncate">
            {correoActual ?? <span className="text-muted-foreground/70">— sin correo —</span>}
          </span>
          <button
            type="button"
            onClick={() => setEditar(true)}
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            Editar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="correo@bomberos.gob.ve"
            disabled={pending}
            autoFocus
            className="flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValor(correoActual ?? "");
              setEditar(false);
            }}
            disabled={pending}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      )}
    </Bloque>
  );
}

function ResetearPassword({
  usuarioId,
  onResultado,
}: {
  usuarioId: number;
  onResultado: (t: { tipo: "ok" | "err"; msg: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pwd, setPwd] = useState("");
  const [forzar, setForzar] = useState(true);
  const [pending, start] = useTransition();

  const aplicar = () => {
    start(async () => {
      const res = await resetearPassword(usuarioId, pwd, forzar);
      if (res.ok) {
        onResultado({ tipo: "ok", msg: "Contraseña actualizada" });
        setPwd("");
        setAbierto(false);
      } else {
        onResultado({ tipo: "err", msg: res.error ?? "Error" });
      }
    });
  };

  return (
    <Bloque
      Icon={KeyRound}
      titulo="Contraseña"
      descripcion="Asignar una nueva contraseña. El usuario será forzado a cambiarla al próximo login si activás la opción."
    >
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          Resetear contraseña
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Mín. 10 caracteres, mayúscula, dígito y especial"
            disabled={pending}
            autoFocus
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={forzar}
              onChange={(e) => setForzar(e.target.checked)}
              disabled={pending}
            />
            Forzar cambio en el próximo login
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={aplicar}
              disabled={pending}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Aplicar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPwd("");
                setAbierto(false);
              }}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </Bloque>
  );
}

function ActivoToggle({
  usuarioId,
  activo,
  onResultado,
}: {
  usuarioId: number;
  activo: boolean;
  onResultado: (t: { tipo: "ok" | "err"; msg: string }) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();
  const accion = activo ? "Desactivar" : "Activar";

  const ejecutar = () => {
    start(async () => {
      const res = await toggleActivo(usuarioId, !activo);
      if (res.ok) {
        onResultado({
          tipo: "ok",
          msg: activo ? "Cuenta desactivada" : "Cuenta activada",
        });
        setConfirmando(false);
      } else {
        onResultado({ tipo: "err", msg: res.error ?? "Error" });
      }
    });
  };

  return (
    <Bloque
      Icon={Power}
      titulo="Cuenta activa"
      descripcion="Una cuenta desactivada no puede iniciar sesión, pero conserva su historial."
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs">
          Estado actual:{" "}
          {activo ? (
            <span className="badge badge-success">Activo</span>
          ) : (
            <span className="badge badge-neutral">Inactivo</span>
          )}
        </span>
        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              activo
                ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            }`}
          >
            {accion}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={ejecutar}
              disabled={pending}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Sí, ${accion.toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </Bloque>
  );
}

function BloqueadoToggle({
  usuarioId,
  bloqueado,
  motivoActual,
  onResultado,
}: {
  usuarioId: number;
  bloqueado: boolean;
  motivoActual: string | null;
  onResultado: (t: { tipo: "ok" | "err"; msg: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  const ejecutar = (nuevo: boolean) => {
    start(async () => {
      const res = await toggleBloqueado(
        usuarioId,
        nuevo,
        nuevo ? motivo : null,
      );
      if (res.ok) {
        onResultado({
          tipo: "ok",
          msg: nuevo ? "Cuenta bloqueada" : "Cuenta desbloqueada",
        });
        setMotivo("");
        setAbierto(false);
      } else {
        onResultado({ tipo: "err", msg: res.error ?? "Error" });
      }
    });
  };

  return (
    <Bloque
      Icon={Lock}
      titulo="Bloqueo de seguridad"
      descripcion="Bloqueo manual con motivo. Desbloquear también resetea el contador de intentos fallidos."
    >
      {bloqueado ? (
        <div className="space-y-2">
          <div className="text-xs">
            <span className="badge badge-danger">Bloqueado</span>
            {motivoActual && (
              <span className="ml-2 text-muted-foreground italic">
                — {motivoActual}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => ejecutar(false)}
            disabled={pending}
            className="rounded-md border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500/10 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Desbloquear"}
          </button>
        </div>
      ) : !abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/10"
        >
          Bloquear
        </button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo del bloqueo (obligatorio)"
            rows={2}
            disabled={pending}
            autoFocus
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => ejecutar(true)}
              disabled={pending || !motivo.trim()}
              className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar bloqueo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMotivo("");
                setAbierto(false);
              }}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </Bloque>
  );
}
