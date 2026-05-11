import { NextResponse } from "next/server";
import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

interface FuncionarioListItem {
  id: number;
  nacionalidad: string;
  cedula: number;
  apellidos: string;
  nombres: string;
  nombre_completo: string | null;
  estatus: string;
  jerarquia_id: number | null;
}

interface Page<T> {
  items: T[];
  total: number;
}

export async function GET(req: Request) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ items: [] }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ items: [] });

  const params = new URLSearchParams({ q, page_size: "10", estatus: "" });

  try {
    const data = await api.get<Page<FuncionarioListItem>>(
      `/funcionarios?${params}`,
      token,
    );
    return NextResponse.json({ items: data.items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
