"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ACCESS_COOKIE = "bcd_access";
const REFRESH_COOKIE = "bcd_refresh";

export async function setSessionCookies(access: string, refresh: string, accessMaxAge: number) {
  const c = cookies();
  c.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: accessMaxAge,
  });
  c.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });
}

export async function getAccessToken(): Promise<string | null> {
  return cookies().get(ACCESS_COOKIE)?.value ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return cookies().get(REFRESH_COOKIE)?.value ?? null;
}

export async function clearSession() {
  const c = cookies();
  c.delete(ACCESS_COOKIE);
  c.delete(REFRESH_COOKIE);
}

export async function requireAuth(): Promise<string> {
  const token = await getAccessToken();
  if (!token) redirect("/login");
  return token;
}
