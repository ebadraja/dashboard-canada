import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";

// Auth.js v5, credentials login (Doc 0 §3: no shared logins, sessions expire).
//
// Session mechanics — deliberate, recorded in STACK.md:
// The Credentials provider only supports JWT session cookies (an Auth.js
// limitation). So the cookie is a short-lived signed JWT carrying ONLY the
// user id — role, clinic, and active status are re-read from the database on
// every request by the guard (src/server/guard.ts). Disabling a user takes
// effect on their next request; nothing security-relevant is trusted from
// the cookie.

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // We self-host (one long-running container, STACK.md) — the host header is
  // ours, not a platform's. Without this Auth.js throws UntrustedHost.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours — a work shift, then log in again
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        // Only the id goes into the token; everything else is read fresh
        // from the DB per request.
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
