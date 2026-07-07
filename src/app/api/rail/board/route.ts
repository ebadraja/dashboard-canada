import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { dateRe } from "@/server/ai";

// The slot board (Doc 1 §2): the fixed daily menu + today's truth. The grid
// the VA colors in. Built entirely from the clinic's template — nothing
// impossible can even be displayed (Golden Rule 1).
export async function GET(req: Request) {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }
    const clinicId = caller.clinicId;

    const date = new URL(req.url).searchParams.get("date") ?? "";
    if (!dateRe.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const [template, entries] = await Promise.all([
      prisma.slotTemplateEntry.findMany({
        where: { clinicId },
        select: { block: true, time: true },
        orderBy: { time: "asc" },
      }),
      prisma.availabilityEntry.findMany({
        where: { clinicId, date: new Date(date) },
        select: { time: true, state: true, source: true },
      }),
    ]);

    const byTime = new Map(entries.map((e) => [e.time, e]));
    return NextResponse.json({
      date,
      loaded: entries.length > 0,
      slots: template.map((t) => ({
        block: t.block,
        time: t.time,
        state: byTime.get(t.time)?.state ?? null, // null = not loaded yet
        source: byTime.get(t.time)?.source ?? null,
      })),
    });
  } catch (e) {
    return guardResponse(e);
  }
}
