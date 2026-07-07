import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./db";

// THE guard (Doc 0 §3). Every Route Handler goes through here — no exceptions.
//
//   - Authentication: who is calling (session cookie for humans, per-clinic
//     API key for the AI phone system).
//   - Authorization: is their role allowed to do this.
//   - Isolation: every query is fenced to the caller's clinic (operator
//     excepted). The frontend is assumed bypassable; this file is the fence.
//
// The user is re-loaded from the DB on EVERY request — role, clinic and
// active status are never trusted from the cookie. Disabling a user locks
// them out on their next request.

export type HumanCaller = {
  kind: "user";
  id: string;
  name: string;
  role: Role;
  clinicId: string | null; // null only for operator
};

export type AiCaller = {
  kind: "ai";
  clinicId: string; // an AI key always resolves to exactly one clinic
};

export class GuardError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export function guardResponse(e: unknown): NextResponse {
  if (e instanceof GuardError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  throw e;
}

// --- Human callers (session cookie) --------------------------------------

/**
 * Resolve the logged-in user, freshly from the DB, and require one of the
 * given roles. Throws GuardError (401/403) otherwise.
 */
export async function requireUser(allowed: Role[]): Promise<HumanCaller> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) throw new GuardError(401, "Not logged in");

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user || !user.active) throw new GuardError(401, "Account disabled");

  if (!allowed.includes(user.role)) {
    throw new GuardError(403, "Your role cannot do this");
  }

  return {
    kind: "user",
    id: user.id,
    name: user.name,
    role: user.role,
    clinicId: user.clinicId,
  };
}

/**
 * The clinic fence. For va/doctor this is ALWAYS their own clinic — any
 * requested clinic id is ignored, so cross-clinic access is structurally
 * impossible, not just forbidden. The operator may address any clinic but
 * must name one explicitly.
 */
export function clinicScope(
  caller: HumanCaller,
  requestedClinicId?: string | null,
): string {
  if (caller.role === "operator") {
    if (!requestedClinicId) {
      throw new GuardError(403, "Operator must specify a clinic");
    }
    return requestedClinicId;
  }
  if (!caller.clinicId) {
    throw new GuardError(403, "User has no clinic assigned");
  }
  return caller.clinicId; // requestedClinicId deliberately ignored
}

// --- AI phone caller (per-clinic API key) ---------------------------------

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolve `Authorization: Bearer <key>` to exactly one live clinic.
 * The key is stored hashed; compare in constant time.
 */
export async function requireAiClinic(req: Request): Promise<AiCaller> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) throw new GuardError(401, "Missing API key");

  const keyHash = hashApiKey(key);
  const clinic = await prisma.clinic.findUnique({
    where: { apiKeyHash: keyHash },
    select: { id: true, status: true, apiKeyHash: true },
  });

  // Constant-time confirmation (lookup already matched, belt and braces).
  if (
    !clinic?.apiKeyHash ||
    !timingSafeEqual(Buffer.from(clinic.apiKeyHash), Buffer.from(keyHash))
  ) {
    throw new GuardError(401, "Invalid API key");
  }
  if (clinic.status !== "live") {
    throw new GuardError(403, "Clinic is not live");
  }

  return { kind: "ai", clinicId: clinic.id };
}
