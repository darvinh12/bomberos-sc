/**
 * Cliente HTTP para la API. En el server lee cookie HttpOnly.
 * En el cliente delega los cookies via fetch credentials: include.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, {
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
  del: <T>(p: string, token?: string) => request<T>(p, { method: "DELETE" }, token),
  loginForm: async (usuario: string, password: string) => {
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
