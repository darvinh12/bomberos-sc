import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

/**
 * Proxy BFF genérico: los componentes cliente no tienen acceso al token
 * (cookie HttpOnly) y el backend solo acepta Authorization: Bearer. Este
 * handler reenvía la petición con el token de la sesión. La autorización
 * real (roles, scopes) la sigue haciendo el backend con ese token.
 */
async function proxy(
  req: Request,
  { params }: { params: { path: string[] } },
) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "No autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const target = `${BASE}/${params.path.join("/")}${url.search}`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      init.body = await req.formData();
    } else {
      headers.set("Content-Type", "application/json");
      init.body = await req.text();
    }
  }

  const res = await fetch(target, init);
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
