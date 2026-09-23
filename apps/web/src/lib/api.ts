/**
 * Cliente HTTP para la API. En el server lee cookie HttpOnly.
 * En el cliente delega los cookies via fetch credentials: include.
 *
 * Modo DEMO: si NEXT_PUBLIC_DEMO_MODE=1 devuelve fixtures locales
 * en vez de hacer la petición. Eliminar antes de producción.
 */
import { DEMO_LOGIN_RESPONSE, isDemoMode, demoResolve } from "./demo-fixtures";

// Server-side (Node) necesita URL absoluta hacia la API — API_INTERNAL_URL
// apunta al contenedor (http://api:8000). Client-side usa NEXT_PUBLIC_API_URL,
// que puede ser relativa (/sigp-api) cuando Caddy enruta en el mismo origen.
const BASE =
  typeof window === "undefined"
    ? process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8000"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  if (isDemoMode()) {
    if ((init.method ?? "GET") === "GET") {
      // Lee rol demo desde cookie cuando estamos en server-side
      let rol = "ADMIN";
      try {
        const { cookies } = await import("next/headers");
        rol = cookies().get("bcd_demo_role")?.value ?? "ADMIN";
      } catch {
        // En client-side no hay next/headers
      }
      return demoResolve(path, rol) as T;
    }
    return undefined as T;
  }
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // En el navegador no hay token (cookie HttpOnly) y el backend exige
  // Bearer: se enruta por el proxy BFF de Next, que lo adjunta server-side.
  const esCliente = typeof window !== "undefined";
  const url = esCliente && !token ? `/api/backend${path}` : `${BASE}${path}`;

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      /* sin body */
    }
    const detail =
      (body as { detail?: string })?.detail || `HTTP ${res.status}`;
    throw new ApiError(res.status, detail, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(p: string, token?: string) => request<T>(p, { method: "GET" }, token),
  post: <T>(p: string, body?: unknown, token?: string) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }, token),
  patch: <T>(p: string, body?: unknown, token?: string) =>
    request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, token),
  put: <T>(p: string, body?: unknown, token?: string) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, token),
  del: <T>(p: string, token?: string) => request<T>(p, { method: "DELETE" }, token),
  loginForm: async (usuario: string, password: string) => {
    if (isDemoMode()) {
      if (!usuario || !password) {
        throw new ApiError(400, "Usuario y contraseña requeridos");
      }
      return DEMO_LOGIN_RESPONSE;
    }
    const fd = new URLSearchParams();
    fd.set("username", usuario);
    fd.set("password", password);
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      body: fd,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        /* */
      }
      throw new ApiError(
        res.status,
        (body as { detail?: string })?.detail || `HTTP ${res.status}`,
        body,
      );
    }
    return res.json() as Promise<{
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    }>;
  },
};
