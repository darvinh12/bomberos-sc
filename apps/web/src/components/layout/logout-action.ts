"use server";

import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { clearSession, getAccessToken } from "@/lib/session";

export async function logoutAction() {
  const token = await getAccessToken();
  if (token) {
    try {
      await api.post("/auth/logout", undefined, token);
    } catch {
      /* best-effort */
    }
  }
  await clearSession();
  redirect("/login");
}
