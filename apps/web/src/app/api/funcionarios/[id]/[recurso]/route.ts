import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const BASE = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RECURSOS = new Set(["foto", "huella", "firma"]);

/**
 * Proxy hacia el backend para recursos binarios del funcionario.
 * Necesario porque el backend exige Authorization: Bearer y un <img src>
 * o un fetch de cliente no tiene acceso al token (cookie HttpOnly).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; recurso: string } },
) {
  if (!RECURSOS.has(params.recurso)) {
    return NextResponse.json({ detail: "Recurso inválido" }, { status: 404 });
  }
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ detail: "No autenticado" }, { status: 401 });

  const res = await fetch(`${BASE}/funcionarios/${params.id}/${params.recurso}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json(
      { detail: `Backend HTTP ${res.status}` },
      { status: res.status },
    );
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string; recurso: string } },
) {
  if (!RECURSOS.has(params.recurso)) {
    return NextResponse.json({ detail: "Recurso inválido" }, { status: 404 });
  }
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ detail: "No autenticado" }, { status: 401 });

  const formData = await req.formData();
  const res = await fetch(`${BASE}/funcionarios/${params.id}/${params.recurso}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
