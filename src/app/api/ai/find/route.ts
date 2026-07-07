import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { createAiTask, dateRe } from "@/server/ai";

const schema = z.object({
  patientName: z.string().min(1),
  patientDob: z.string().regex(dateRe, "patientDob must be YYYY-MM-DD"),
  intent: z.enum(["cancel", "move"]), // what the caller wants to do with it
  callId: z.string().optional(),
});

// AI: "Find appointments for <patient>" (Doc 1 §6). Anything touching an
// existing appointment always needs the VA (Golden Rule 5) — the VA searches
// Rev and taps the right appointment; its id comes back via the task result.
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
    const { patientName, patientDob, intent, callId } = body.data;

    const { call, task, vaAvailable } = await createAiTask({
      clinicId,
      callId,
      callType: intent,
      taskType: "find",
      payload: { patientName, patientDob, intent },
    });

    return NextResponse.json(
      { callId: call.id, taskId: task.id, vaAvailable },
      { status: 202 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}
