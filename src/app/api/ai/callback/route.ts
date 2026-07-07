import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { createAiTask } from "@/server/ai";

const schema = z.object({
  callId: z.string().optional(),
  phone: z.string().min(5),
  note: z.string().optional(), // e.g. "wanted Tuesday evening, VA was busy"
});

// AI: "Caller wants a callback" (Doc 1 §6, Golden Rule 4). Records the
// promise against the call so the VA follows up — a delay becomes a promise,
// never a dead line.
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
    const { callId, phone, note } = body.data;

    const { call, task } = await createAiTask({
      clinicId,
      callId,
      callType: "callback",
      taskType: "callback",
      payload: { phone, note },
    });

    await prisma.call.update({
      where: { id: call.id },
      data: { outcome: "callback" },
    });

    return NextResponse.json(
      { callId: call.id, taskId: task.id },
      { status: 202 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}
