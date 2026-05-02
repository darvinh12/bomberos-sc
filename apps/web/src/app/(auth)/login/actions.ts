"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { setSessionCookies } from "@/lib/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const usuario = String(formData.get("usuario") || "").trim();
  const password = String(formData.get("password") || "");
  if (!usuario || !password) return { error: "Usuario y contraseña son obligatorios" };

  try {
    const res = await api.loginForm(usuario, password);
    await setSessionCookies(res.access_token, res.refresh_token, res.expires_in);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error de autenticación";
    return { error: msg };
  }
  redirect("/dashboard");
}
