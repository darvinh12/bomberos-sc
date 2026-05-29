"use client";

import { useEffect, useRef, useState } from "react";
import { User, Upload, RefreshCw, Trash2 } from "lucide-react";

interface FotoUploadProps {
  fotoUrl: string | null;
  funcionarioId?: number;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}

const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;

function resolverSrc(fotoUrl: string | null, funcionarioId?: number): string | null {
  if (!fotoUrl) return null;
  if (fotoUrl.startsWith("/") || fotoUrl.startsWith("http://") || fotoUrl.startsWith("https://")) {
    return fotoUrl;
  }
  if (funcionarioId != null) {
    return `/api/funcionarios/${funcionarioId}/foto`;
  }
  return null;
}

export default function FotoUpload({
  fotoUrl,
  funcionarioId,
  onChange,
  disabled = false,
}: FotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [eliminada, setEliminada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const srcRemoto = resolverSrc(fotoUrl, funcionarioId);
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
      setError("La imagen excede el límite de 5 MB.");
      return;
    }

    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
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
            <img
              src={srcFinal}
              alt="Foto del funcionario"
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
            <User className="w-10 h-10 opacity-60" aria-hidden="true" strokeWidth={1.5} />
            <span className="text-[10px] uppercase tracking-wide opacity-70">Sin foto</span>
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
          Subir foto
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={manejarArchivo}
        disabled={disabled}
        className="sr-only"
        aria-label="Seleccionar archivo de foto"
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
