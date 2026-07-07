import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, clinicScope, guardResponse } from "@/server/guard";

// The caller's own clinic. For va/doctor, clinicScope() pins this to THEIR
// clinic — any ?clinicId= in the URL is ignored, so another clinic's data is
// structurally unreachable (Doc 0 §3). The operator must name a clinic.
export async function GET(req: Request) {
  try {
    const caller = await requireUser(["va", "doctor", "operator"]);
    const requested = new URL(req.url).searchParams.get("clinicId");
    const clinicId = clinicScope(caller, requested);

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        timezone: true,
        status: true,
        hours: true,
        slotTemplate: {
          select: { block: true, time: true },
          orderBy: { time: "asc" },
        },
        // Note: planName/monthlyPriceCents are deliberately NOT selected here.
        // Price is shown to the doctor only on their billing surface (Doc 3),
        // and cost/margin never leave the operator view.
      },
    });
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }
    return NextResponse.json(clinic);
  } catch (e) {
    return guardResponse(e);
  }
}
