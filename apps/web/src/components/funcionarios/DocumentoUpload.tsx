"use client";

import { useEffect, useRef, useState } from "react";
import {
  Fingerprint,
  PenLine,
  RefreshCw,
  Trash2,
  Upload,
  User,
} from "lucide-react";

type TipoDocumento = "foto" | "huella" | "firma";

interface DocumentoUploadProps {
  tipo: TipoDocumento;
  url: string | null;
  funcionarioId?: number;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;

const ETIQUETAS: Record<
  TipoDocumento,
  {
    singular: string;
    subir: string;
    sinDoc: string;
    altImg: string;
    ariaInput: string;
  }
> = {
  foto: {
    singular: "foto",
    subir: "Subir foto",
    sinDoc: "Sin foto",
    altImg: "Foto del funcionario",
    ariaInput: "Seleccionar archivo de foto",
  },
  huella: {
    singular: "huella",
    subir: "Subir huella",
    sinDoc: "Sin huella",
    altImg: "Huella del funcionario",
    ariaInput: "Seleccionar archivo de huella",
  },
  firma: {
    singular: "firma",
    subir: "Subir firma",
    sinDoc: "Sin firma",
    altImg: "Firma del funcionario",
    ariaInput: "Seleccionar archivo de firma",
  },
};

function IconoPlaceholder({ tipo }: { tipo: TipoDocumento }) {
  const props = {
    className: "w-10 h-10 opacity-60",
    "aria-hidden": true as const,
    strokeWidth: 1.5,
  };
  if (tipo === "huella") return <Fingerprint {...props} />;
  if (tipo === "firma") return <PenLine {...props} />;
  return <User {...props} />;
}

function resolverSrc(
  url: string | null,
  tipo: TipoDocumento,
  funcionarioId?: number,
): string | null {
  if (!url) return null;
  if (
    url.startsWith("/") ||
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  if (funcionarioId != null) {
    return `/api/funcionarios/${funcionarioId}/${tipo}`;
  }
  return null;
}

export default function DocumentoUpload({
  tipo,
  url,
  funcionarioId,
  onChange,
  disabled = false,
}: DocumentoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [eliminada, setEliminada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = ETIQUETAS[tipo];

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Si la URL remota cambia (p. ej. tras un upload exitoso), descartamos el
  // preview local para que el componente refleje el estado del backend.
  useEffect(() => {
    setEliminada(false);
  }, [url]);

  const srcRemoto = resolverSrc(url, tipo, funcionarioId);
  const srcFinal = previewUrl ?? (eliminada ? null : srcRemoto);
  const hayImagen = Boolean(srcFinal);

  function abrirSelector() {
    if (disabled) return;
    setError(null);
    inputRef.current?.click();
  }

  function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";

    if (!file) return;

    if (!TIPOS_ACEPTADOS.includes(file.type)) {
      setError("Formato no permitido. Use JPG, PNG o WEBP.");
      return;
    }
    if (file.size > TAMANO_MAX_BYTES) {
      setError(`La ${labels.singular} excede el límite de 5 MB.`);
      return;
    }

    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setEliminada(false);
    onChange(file);
  }

  function eliminar() {
    if (disabled) return;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setEliminada(true);
    setError(null);
    onChange(null);
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div
        className={[
          "group relative w-32 h-40 rounded-md border border-border bg-muted overflow-hidden shrink-0",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        ].join(" ")}
      >
        {hayImagen && srcFinal ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={srcFinal}
              alt={labels.altImg}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            {!disabled && (
              <div
                className={[
                  "absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm",
                  "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
                  "transition-opacity duration-150 ease-out motion-reduce:transition-none",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={abrirSelector}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-opacity motion-reduce:transition-none"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={eliminar}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors motion-reduce:transition-none"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                  Eliminar
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <IconoPlaceholder tipo={tipo} />
            <span className="text-[10px] uppercase tracking-wide opacity-70">
              {labels.sinDoc}
            </span>
          </div>
        )}
      </div>

      {!hayImagen && !disabled && (
        <button
          type="button"
          onClick={abrirSelector}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-opacity motion-reduce:transition-none"
        >
          <Upload className="w-3 h-3" aria-hidden="true" />
          {labels.subir}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={manejarArchivo}
        disabled={disabled}
        className="sr-only"
        aria-label={labels.ariaInput}
      />

      {error && (
        <p
          role="alert"
          className="max-w-[8rem] text-[11px] leading-tight text-destructive"
        >
          {error}
        </p>
      )}

      {!error && (
        <p className="max-w-[8rem] text-[10px] leading-tight text-muted-foreground">
          JPG, PNG o WEBP · máx 5 MB
        </p>
      )}
    </div>
  );
}
