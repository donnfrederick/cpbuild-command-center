"use server";

import { redirect } from "next/navigation";
import { CredentialsSignin } from "next-auth";
import { signIn } from "@/lib/auth";
import { postLoginRedirectPath } from "@/lib/post-login-redirect";
import { loginSchema } from "@/lib/validations/auth";

export type CredentialsLoginState =
  | undefined
  | { ok: false; error: "invalidCredentials" | "validation" };

/** Turn Auth.js redirect target into a path Next.js `redirect()` accepts (always same-origin path). */
function toAppRedirectPath(resultUrl: string): string {
  if (resultUrl.startsWith("/")) {
    return resultUrl;
  }
  try {
    const u = new URL(resultUrl);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Credentials login via server `signIn` so session cookies are applied with `cookies().set()`.
 * Client `next-auth/react` signIn uses fetch + Set-Cookie, which iOS WebKit often drops (Chrome on iPhone uses WebKit).
 */
export async function credentialsLoginAction(
  _prev: CredentialsLoginState,
  formData: FormData
): Promise<CredentialsLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "validation" };
  }

  const redirectToRaw = String(formData.get("redirectTo") ?? "/");
  const redirectTo = postLoginRedirectPath(
    redirectToRaw === "" || redirectToRaw === "/" ? null : redirectToRaw
  );

  try {
    const resultUrl = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
      redirectTo,
    });
    redirect(toAppRedirectPath(resultUrl));
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      return { ok: false, error: "invalidCredentials" };
    }
    throw e;
  }
}
