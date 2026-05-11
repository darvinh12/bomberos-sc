import { NextResponse } from "next/server";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

interface Func {
  id: number;
  nacionalidad: string;
  cedula: number;
  apellidos: string;
  nombres: string;
  nombre_completo: string | null;
  estatus: string;
  jerarquia_id: number | null;
  zona_id: number | null;
  estacion_id: number | null;
  fecha_primer_ingreso: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
  pages: number;
}

interface Cat {
  id: number;
  nombre: string;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const url = new URL(req.url);
  const incoming = url.searchParams;
  const params = new URLSearchParams();
  for (const k of ["q", "estatus", "zona_id", "estacion_id", "jerarquia_id"]) {
    const v = incoming.get(k);
    if (v) params.set(k, v);
  }
  params.set("page", "1");
  params.set("page_size", "200");

  const allItems: Func[] = [];
  let pageNum = 1;
  let pages = 1;
  do {
    params.set("page", String(pageNum));
    const data = await api.get<Page<Func>>(`/funcionarios?${params}`, token).catch(() => null);
    if (!data) break;
    allItems.push(...data.items);
    pages = data.pages;
    pageNum++;
    if (pageNum > 50) break;
  } while (pageNum <= pages);

  const [jer, zonas, estaciones] = await Promise.all([
    api.get<Cat[]>("/catalogos/jerarquias", token).catch(() => [] as Cat[]),
    api.get<Cat[]>("/catalogos/zonas", token).catch(() => [] as Cat[]),
    api.get<Cat[]>("/catalogos/estaciones", token).catch(() => [] as Cat[]),
  ]);
  const jerMap = new Map(jer.map((j) => [j.id, j.nombre]));
  const zonaMap = new Map(zonas.map((z) => [z.id, z.nombre]));
  const estMap = new Map(estaciones.map((e) => [e.id, e.nombre]));

  const header = [
    "id",
    "nacionalidad",
    "cedula",
    "nombre_completo",
    "estatus",
    "jerarquia",
    "zona",
    "estacion",
    "fecha_primer_ingreso",
  ];
  const rows = allItems.map((f) => [
    f.id,
    f.nacionalidad,
    f.cedula,
    f.nombre_completo ?? `${f.apellidos}, ${f.nombres}`,
    f.estatus,
    f.jerarquia_id ? jerMap.get(f.jerarquia_id) ?? "" : "",
    f.zona_id ? zonaMap.get(f.zona_id) ?? "" : "",
    f.estacion_id ? estMap.get(f.estacion_id) ?? "" : "",
    f.fecha_primer_ingreso ?? "",
  ]);

  const csv =
    "﻿" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="funcionarios-${date}.csv"`,
    },
  });
}
