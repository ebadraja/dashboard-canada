import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { createAiTask, dateRe } from "@/server/ai";

const schema = z.object({
  date: z.string().regex(dateRe, "date must be YYYY-MM-DD"),
  callId: z.string().optional(),
});

// AI: "What's open on <day>?" (Doc 1 §6)
// Fast layer: if the day is loaded, answer instantly from AvailabilityEntry.
// Live layer: otherwise create a waiting task and ding the VA.
export async function POST(req: Request) {
  try {
    const { clinicId } = await requireAiClinic(req);
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const { date, callId } = body.data;

    const entries = await prisma.availabilityEntry.findMany({
      where: { clinicId, date: new Date(date) },
      select: { time: true, state: true },
      orderBy: { time: "asc" },
    });

    if (entries.length > 0) {
      // Day is loaded — instant answer, no human needed.
      const call = await prisma.call.create({
        data: { clinicId, type: "availability", outcome: "completed" },
      });
      return NextResponse.json({
        loaded: true,
        callId: call.id,
        openSlots: entries.filter((e) => e.state === "open").map((e) => e.time),
      });
    }

    // Day not loaded — ding the VA (plan §4.2).
    const { call, task, vaAvailable } = await createAiTask({
      clinicId,
      callId,
      callType: "availability",
      taskType: "availability",
      payload: { date },
    });
    return NextResponse.json(
      { loaded: false, callId: call.id, taskId: task.id, vaAvailable },
      { status: 202 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}
