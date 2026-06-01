"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { rolExiste } from "@/lib/roles-runtime";

const DEMO_ROLE_COOKIE = "bcd_demo_role";

export async function switchDemoRole(formData: FormData): Promise<void> {
  const rol = String(formData.get("rol") ?? "ADMIN");
  if (!(await rolExiste(rol))) return;
  cookies().set(DEMO_ROLE_COOKIE, rol, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}

export async function readDemoRole(): Promise<string> {
  return cookies().get(DEMO_ROLE_COOKIE)?.value ?? "ADMIN";
}
