"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { authenticateUser } from "@/lib/auth/users";
import { safeReturnPath } from "@/lib/auth/safe-return-path";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextValue = formData.get("next");
  const next = safeReturnPath(typeof nextValue === "string" ? nextValue : null);
  const user = await authenticateUser(email, password);

  if (!user) {
    redirect(`/login?${new URLSearchParams({ error: "invalid", next })}`);
  }

  const { token, expiresAt } = await createSessionToken(undefined, undefined, user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  redirect(next);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
