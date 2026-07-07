import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { loadDay, notifyBoard } from "@/server/availability";
import { audit } from "@/server/audit";
import { dateRe, timeRe } from "@/server/ai";

const schema = z.object({
  date: z.string().regex(dateRe),
  openTimes: z.array(z.string().regex(timeRe)),
});

// Morning load / midday reconciliation (plan §7): the VA marks which of the
// fixed template slots are genuinely open for a date. Every template slot
// gets a row — tapped = open, untapped = taken — so the day counts as
// "loaded" and the AI answers availability instantly from then on.
export async function POST(req: Request) {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }
    const clinicId = caller.clinicId;

    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const { date, openTimes } = body.data;

    const template = await prisma.slotTemplateEntry.findMany({
      where: { clinicId },
      select: { time: true },
    });
    const templateTimes = template.map((t) => t.time);
    // Golden Rule 1: only real template slots can be marked open.
    const invalid = openTimes.filter((t) => !templateTimes.includes(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Not on the slot menu: ${invalid.join(", ")}` },
        { status: 422 },
      );
    }

    await prisma.$transaction(
      async (tx) => {
        await loadDay(tx, clinicId, date, templateTimes, openTimes, "morning");
        await audit(tx, {
          userId: caller.id,
          action: "availability.loaded",
          entityType: "Clinic",
          entityId: clinicId,
          meta: { date, openCount: openTimes.length, total: templateTimes.length },
        });
      },
      { timeout: 15_000 }, // remote Postgres: allow for network latency
    );

    notifyBoard(clinicId, date);
    return NextResponse.json({ date, loaded: templateTimes.length, open: openTimes.length });
  } catch (e) {
    return guardResponse(e);
  }
}
