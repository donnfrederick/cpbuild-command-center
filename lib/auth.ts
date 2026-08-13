import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validations/auth";
import { findUserByEmailForAuth } from "@/lib/user-email";

/** When NEXTAUTH_URL is https (ngrok, Railway), emit Secure cookies even if Node sees http:// from the proxy. */
function secureCookiesFromAuthUrl(): boolean {
  const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return base.startsWith("https://");
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      /**
       * Special permission codes granted to this user beyond their role.
       * Not stored in the JWT (to avoid stale/bloated tokens).
       * API routes that need authoritative checks should call
       * `hasPermissionWithOverrides()` which queries the DB directly.
       */
      specialPermissions?: string[];
    };
  }
  interface User {
    role: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  useSecureCookies: secureCookiesFromAuthUrl(),
  // Trust the incoming Host header when AUTH_TRUST_HOST is set (e.g. Railway/Vercel proxies, localhost).
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  // Cast needed due to @auth/core patch version mismatch between next-auth and @auth/prisma-adapter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(db) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await findUserByEmailForAuth(email);
        if (!user?.passwordHash) return null;

        if (user.status !== 'ACTIVE') return null;

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role.code,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token["id"] = user.id as string;
        token["role"] = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (!session?.user) {
        return session;
      }

      const id = token["id"];
      const role = token["role"];

      if (typeof id !== "string" || id.length === 0 || typeof role !== "string" || role.length === 0) {
        // Missing or invalid token fields — return session unmodified
        return session;
      }

      session.user.id = id;
      session.user.role = role;
      return session;
    },
  },
});
