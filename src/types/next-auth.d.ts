import { DefaultSession } from "next-auth";

// The session carries ONLY the user id (see src/server/auth.ts) — role and
// clinic are re-read from the DB per request by the guard.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
