"use server";

import { signOut } from "@/server/auth";

// The shell's Sign out (DESIGN.md §5.0 — previously there was no way out).
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
