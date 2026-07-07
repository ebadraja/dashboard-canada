import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { dateRe } from "@/server/ai";

// The doctor's report card (Doc 2). Strictly read-only; every metric is a
// count or average over Call/Task rows the VA view already recorded —
// nothing new is measured here (Doc 2 §4).
//
// Structural exclusions (Doc 2 §3): the query is pinned to the caller's own
// clinic; the response contains no VA identity, no costs, no prices, no
// other clinic — those fields are simply never selected.
export async function GET(req: Request) {
  try {
    const caller = await requireUser(["doctor"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }
    const clinicId = caller.clinicId; // the fence — never from the request

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!dateRe.test(from) || !dateRe.test(to)) {
      return NextResponse.json(
        { error: "from and to (YYYY-MM-DD) are required" },
        { status: 400 },
      );
    }
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1); // inclusive range
    const inRange = { gte: start, lt: end };

    const clinic = await prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
      select: { name: true, timezone: true },
    });

    const [
      callsHandled,
      bookingsMade,
      cancellations,
      reschedules,
      callbacks,
      calls,
      answeredTasks,
    ] = await Promise.all([
      // "Count Call rows for this clinic in the period."
      prisma.call.count({ where: { clinicId, startedAt: inRange } }),
      // "Count Calls of type book with a confirmed appointment."
      prisma.call.count({
        where: {
          clinicId,
          startedAt: inRange,
          type: "book",
          createdAppointments: { some: { status: "confirmed" } },
        },
      }),
      // "Count Calls of type cancel and move." (completed ones)
      prisma.call.count({
        where: { clinicId, startedAt: inRange, type: "cancel", outcome: "completed" },
      }),
      prisma.call.count({
        where: { clinicId, startedAt: inRange, type: "move", outcome: "completed" },
      }),
      // "Share of Calls that ended in a callback / timeout."
      prisma.call.count({
        where: {
          clinicId,
          startedAt: inRange,
          outcome: { in: ["callback", "timed_out"] },
        },
      }),
      // For busiest times: hour buckets in the clinic's timezone.
      prisma.call.findMany({
        where: { clinicId, startedAt: inRange },
        select: { startedAt: true },
      }),
      // "Average of the time between a task waiting and answered."
      prisma.task.findMany({
        where: { clinicId, createdAt: inRange, answeredAt: { not: null } },
        select: { createdAt: true, answeredAt: true },
      }),
    ]);

    // Busiest times: group calls by local hour (clinic timezone).
    const hourFmt = new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      hour12: false,
      timeZone: clinic.timezone,
    });
    const byHour = new Array<number>(24).fill(0);
    for (const c of calls) {
      const h = Number(hourFmt.format(c.startedAt)) % 24;
      byHour[h] += 1;
    }

    const avgResponseSeconds =
      answeredTasks.length === 0
        ? null
        : Math.round(
            answeredTasks.reduce(
              (sum, t) => sum + (t.answeredAt!.getTime() - t.createdAt.getTime()) / 1000,
              0,
            ) / answeredTasks.length,
          );

    return NextResponse.json({
      clinicName: clinic.name,
      from,
      to,
      callsHandled,
      bookingsMade,
      cancellations,
      reschedules,
      callbackRate: callsHandled === 0 ? null : callbacks / callsHandled,
      avgResponseSeconds,
      busiestHours: byHour.map((count, hour) => ({ hour, count })),
    });
  } catch (e) {
    return guardResponse(e);
  }
}
