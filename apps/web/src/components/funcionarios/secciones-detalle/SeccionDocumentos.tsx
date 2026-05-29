"use client";

import { useEffect, useState } from "react";
import { Trash2, User } from "lucide-react";
import { api } from "@/lib/api";
import { isDemoMode } from "@/lib/demo-fixtures";
import { formatDate } from "@/lib/utils";
import ConfirmarBorrado from "../ConfirmarBorrado";
import DocumentoUpload from "../DocumentoUpload";
import { borrarCarnet } from "./actions";
import { SectionShell, Card, EmptyState } from "./_shared";
import type { NivelAcceso } from "@/lib/permisos-funcionario";

interface Page<T> {
  items: T[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
}

interface Carnet {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  brigadista: boolean | null;
  observaciones: string | null;
}

interface CarnetHistorico {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  motivo_cambio: string | null;
}

interface Datos {
  carnets: Carnet[];
  historico: CarnetHistorico[];
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  funcionario: any;
  userRoles: string[];
  nivelAcceso: NivelAcceso;
}

type EstadoVigencia = "VIGENTE" | "POR_VENCER" | "VENCIDO" | "SIN_FECHA";

function calcularVigencia(fechaIso: string | null): EstadoVigencia {
  if (!fechaIso) return "SIN_FECHA";
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return "SIN_FECHA";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = fecha.getTime() - hoy.getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "POR_VENCER";
  return "VIGENTE";
}

function BadgeVigencia({ fecha }: { fecha: string | null }) {
  const estado = calcularVigencia(fecha);
  if (estado === "SIN_FECHA") {
    return <span className="badge badge-neutral">SIN FECHA</span>;
  }
  if (estado === "VENCIDO") {
    return <span className="badge badge-danger">VENCIDO</span>;
  }
  if (estado === "POR_VENCER") {
    return <span className="badge badge-warning">PRÓXIMO A VENCER</span>;
  }
  return <span className="badge badge-success">VIGENTE</span>;
}

type TipoBiometrico = "huella" | "firma";

async function subirDocumento(
  funcionarioId: number,
  tipo: TipoBiometrico,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/funcionarios/${funcionarioId}/${tipo}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    let detalle = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detalle = body.detail;
    } catch {
      // respuesta sin JSON; conservar mensaje genérico
    }
    throw new Error(detalle);
  }
  const body = (await res.json()) as Record<string, string>;
  return body[`${tipo}_url`] ?? "";
}

export default function SeccionDocumentos({ funcionario: f, nivelAcceso }: Props) {
  const fotoSrc =
    f.foto_url && (f.foto_url.startsWith("/") || f.foto_url.startsWith("http"))
      ? f.foto_url
      : f.foto_url
        ? `/api/funcionarios/${f.id}/foto`
        : null;

  const puedeEditar = nivelAcceso === "edit";
  const soloLectura = nivelAcceso === "view";

  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrandoCarnet, setBorrandoCarnet] = useState<Carnet | null>(null);

  const [huellaUrl, setHuellaUrl] = useState<string | null>(f.huella_url ?? null);
  const [firmaUrl, setFirmaUrl] = useState<string | null>(f.firma_url ?? null);
  const [huellaError, setHuellaError] = useState<string | null>(null);
  const [firmaError, setFirmaError] = useState<string | null>(null);
  const [huellaSubiendo, setHuellaSubiendo] = useState(false);
  const [firmaSubiendo, setFirmaSubiendo] = useState(false);

  async function confirmarBorradoCarnet(
    cnId: number,
    motivo: string,
  ): Promise<void> {
    const res = await borrarCarnet(f.id, cnId, motivo);
    if (!res.ok) throw new Error(res.error);
    setData((prev) =>
      prev === null
        ? prev
        : { ...prev, carnets: prev.carnets.filter((c) => c.id !== cnId) },
    );
  }

  useEffect(() => {
    setHuellaUrl(f.huella_url ?? null);
  }, [f.huella_url]);
  useEffect(() => {
    setFirmaUrl(f.firma_url ?? null);
  }, [f.firma_url]);

  async function manejarUpload(
    tipo: TipoBiometrico,
    file: File | null,
  ): Promise<void> {
    const setUrl = tipo === "huella" ? setHuellaUrl : setFirmaUrl;
    const setErr = tipo === "huella" ? setHuellaError : setFirmaError;
    const setSubiendo =
      tipo === "huella" ? setHuellaSubiendo : setFirmaSubiendo;

    setErr(null);
    if (file === null) {
      // Sin endpoint DELETE en backend para huella/firma — solo limpiamos UI.
      setUrl(null);
      return;
    }

    // Modo demo: no llamar al backend. Conservar preview local (createObjectURL)
    // y forzar la URL como blob para que la <img> siga mostrando algo.
    if (isDemoMode()) {
      setUrl(URL.createObjectURL(file));
      return;
    }

    setSubiendo(true);
    try {
      const nuevaUrl = await subirDocumento(f.id, tipo, file);
      setUrl(nuevaUrl || `/api/funcionarios/${f.id}/${tipo}?t=${Date.now()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir el archivo");
    } finally {
      setSubiendo(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, h] = await Promise.all([
          api
            .get<Page<Carnet>>(`/funcionarios/${f.id}/carnets?page_size=100`)
            .catch(() => ({ items: [] }) as Page<Carnet>),
          api
            .get<Page<CarnetHistorico>>(
              `/funcionarios/${f.id}/historico-carnets?page_size=100`,
            )
            .catch(() => ({ items: [] }) as Page<CarnetHistorico>),
        ]);
        if (!alive) return;
        setData({
          carnets: c.items ?? [],
          historico: h.items ?? [],
        });
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error de carga");
      }
    })();
    return () => {
      alive = false;
    };
  }, [f.id]);

  return (
    <SectionShell
      title="Documentos"
      description="Foto, huella, firma y documentos digitales del funcionario."
      soloLectura={soloLectura}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Foto">
          <div className="w-full aspect-[3/4] bg-muted border border-border rounded overflow-hidden flex items-center justify-center">
            {fotoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoSrc}
                alt="Foto del funcionario"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-12 h-12 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        </Card>
        <Card title="Huella">
          <div className="flex flex-col gap-2">
            <DocumentoUpload
              tipo="huella"
              url={huellaUrl}
              funcionarioId={f.id}
              onChange={(file) => {
                void manejarUpload("huella", file);
              }}
              disabled={!puedeEditar || huellaSubiendo}
            />
            {huellaSubiendo && (
              <p className="text-[11px] text-muted-foreground">Subiendo…</p>
            )}
            {huellaError && (
              <p
                role="alert"
                className="max-w-[12rem] text-[11px] leading-tight text-destructive"
              >
                {huellaError}
              </p>
            )}
          </div>
        </Card>
        <Card title="Firma">
          <div className="flex flex-col gap-2">
            <DocumentoUpload
              tipo="firma"
              url={firmaUrl}
              funcionarioId={f.id}
              onChange={(file) => {
                void manejarUpload("firma", file);
              }}
              disabled={!puedeEditar || firmaSubiendo}
            />
            {firmaSubiendo && (
              <p className="text-[11px] text-muted-foreground">Subiendo…</p>
            )}
            {firmaError && (
              <p
                role="alert"
                className="max-w-[12rem] text-[11px] leading-tight text-destructive"
              >
                {firmaError}
              </p>
            )}
          </div>
        </Card>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <Card title="Carnets activos">
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.carnets.length === 0 ? (
          <EmptyState
            title="Sin carnets registrados"
            hint="No hay carnets activos para este funcionario."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Tipo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Número
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Emisión
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Vencimiento
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Estado
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Brigadista
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Observaciones
                  </th>
                  {puedeEditar && (
                    <th
                      scope="col"
                      className="text-right p-2 font-medium w-1"
                      aria-label="Acciones"
                    />
                  )}
                </tr>
              </thead>
              <tbody>
                {data.carnets.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-2 font-medium">{c.tipo}</td>
                    <td className="p-2 font-mono text-xs">{c.numero ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(c.fecha_emision)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(c.fecha_vencimiento)}
                    </td>
                    <td className="p-2">
                      <BadgeVigencia fecha={c.fecha_vencimiento} />
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {c.brigadista === null
                        ? "—"
                        : c.brigadista
                          ? "Sí"
                          : "No"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {c.observaciones ?? "—"}
                    </td>
                    {puedeEditar && (
                      <td className="p-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setBorrandoCarnet(c)}
                          className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" />
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Histórico de carnets">
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : data.historico.length === 0 ? (
          <EmptyState
            title="Sin historial de carnets"
            hint="No hay cambios o reemplazos de carnets registrados."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="text-left p-2 font-medium">
                    Tipo
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Número
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Emisión
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Vencimiento
                  </th>
                  <th scope="col" className="text-left p-2 font-medium">
                    Motivo cambio
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.historico.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-2 font-medium">{h.tipo}</td>
                    <td className="p-2 font-mono text-xs">{h.numero ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(h.fecha_emision)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {formatDate(h.fecha_vencimiento)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {h.motivo_cambio ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {borrandoCarnet && (
        <ConfirmarBorrado
          titulo="Eliminar carnet"
          descripcion={`Vas a marcar como eliminado el carnet ${borrandoCarnet.tipo}${
            borrandoCarnet.numero ? ` Nº ${borrandoCarnet.numero}` : ""
          }.`}
          onConfirm={(motivo) =>
            confirmarBorradoCarnet(borrandoCarnet.id, motivo)
          }
          onClose={() => setBorrandoCarnet(null)}
        />
      )}
    </SectionShell>
  );
}
