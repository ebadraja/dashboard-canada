import { NextResponse } from "next/server";
import { requireUser, guardResponse } from "@/server/guard";

// Doc 0 DoD: "A person can log in and is recognised as va, doctor, or
// operator." This endpoint is that proof — it returns the caller's identity
// as the backend sees it (fresh from the DB, never from the cookie).
export async function GET() {
  try {
    const caller = await requireUser(["va", "doctor", "operator"]);
    return NextResponse.json({
      id: caller.id,
      name: caller.name,
      role: caller.role,
      clinicId: caller.clinicId,
    });
  } catch (e) {
    return guardResponse(e);
  }
}
