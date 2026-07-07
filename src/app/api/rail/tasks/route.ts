import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";

// The rail's cards (Doc 1 §2): everything the VA can still act on, oldest
// first. Fenced to the VA's own clinic by the guard.
export async function GET() {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }

    const tasks = await prisma.task.findMany({
      where: {
        clinicId: caller.clinicId,
        state: { in: ["waiting", "reopened", "answered", "timed_out"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        callId: true,
        type: true,
        state: true,
        payload: true,
        createdAt: true,
      },
    });

    return NextResponse.json(tasks);
  } catch (e) {
    return guardResponse(e);
  }
}
