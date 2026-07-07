import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { isVaAvailable } from "@/server/va-status";

// System health (Doc 3 §2): live status across clinics — are requests being
// answered, is any clinic timing out a lot, is anything down.
export async function GET() {
  try {
    await requireUser(["operator"]);

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "asc" },
    });

    const health = await Promise.all(
      clinics.map(async (c) => {
        const [waiting, timedOutToday, callsToday, lastCall] = await Promise.all([
          prisma.task.count({
            where: { clinicId: c.id, state: { in: ["waiting", "reopened"] } },
          }),
          prisma.task.count({
            where: { clinicId: c.id, state: "timed_out", createdAt: { gte: dayStart } },
          }),
          prisma.call.count({
            where: { clinicId: c.id, startedAt: { gte: dayStart } },
          }),
          prisma.call.findFirst({
            where: { clinicId: c.id },
            orderBy: { startedAt: "desc" },
            select: { startedAt: true },
          }),
        ]);
        return {
          clinicId: c.id,
          name: c.name,
          status: c.status,
          vaAvailable: isVaAvailable(c.id),
          waiting,
          timedOutToday,
          callsToday,
          lastCallAt: lastCall?.startedAt ?? null,
        };
      }),
    );

    return NextResponse.json(health);
  } catch (e) {
    return guardResponse(e);
  }
}
