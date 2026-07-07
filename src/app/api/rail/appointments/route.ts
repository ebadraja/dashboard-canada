import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { dateRe } from "@/server/ai";

// The find-patient panel's data (Doc 1 §2): this patient's appointments as
// buttons. Shows OUR records (the ones this system created) — the VA
// cross-checks against Rev, which stays the source of truth. Fenced to the
// VA's clinic.
export async function GET(req: Request) {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }

    const url = new URL(req.url);
    const name = url.searchParams.get("name")?.trim() ?? "";
    const dob = url.searchParams.get("dob") ?? "";
    if (!name || !dateRe.test(dob)) {
      return NextResponse.json(
        { error: "name and dob (YYYY-MM-DD) are required" },
        { status: 400 },
      );
    }

    const appointments = await prisma.appointmentRecord.findMany({
      where: {
        clinicId: caller.clinicId,
        patientDob: new Date(dob),
        patientName: { contains: name, mode: "insensitive" },
        status: { in: ["requested", "confirmed"] },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      select: {
        id: true,
        patientName: true,
        date: true,
        time: true,
        type: true,
        status: true,
      },
    });

    return NextResponse.json(
      appointments.map((a) => ({
        ...a,
        date: a.date.toISOString().slice(0, 10),
      })),
    );
  } catch (e) {
    return guardResponse(e);
  }
}
