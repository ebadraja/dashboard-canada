import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { timeoutIfExpired } from "@/server/tasks";
import { isVaAvailable } from "@/server/va-status";

// The AI polls its task here while the caller holds ("one moment, let me
// check…"). The timeout net (Golden Rule 4) lives on this path: if the VA
// hasn't answered in time, the task flips to timed_out and this response
// tells the AI to offer a callback — silence is never allowed.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { clinicId } = await requireAiClinic(req);
    const { id } = await params;

    let task = await prisma.task.findFirst({
      where: { id, clinicId }, // fenced to the key's clinic
    });
    if (!task) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }

    task = await timeoutIfExpired(task);

    const payload = task.payload as Record<string, unknown>;
    return NextResponse.json({
      id: task.id,
      state: task.state,
      // The VA's answer (open slots, picked appointment, slot_gone, …) —
      // written by the rail endpoints into payload.response.
      response: payload.response ?? null,
      offerCallback: task.state === "timed_out", // Rule 4, explicit
      vaAvailable: isVaAvailable(clinicId),
    });
  } catch (e) {
    return guardResponse(e);
  }
}
