import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { createAiTask } from "@/server/ai";

const schema = z.object({
  callId: z.string(),
  appointmentId: z.string(), // the one the VA tapped in the find step
});

// AI: "Cancel <appointment>" (Doc 1 §6) — after find + read-back (Rule 2).
// The VA cancels in Rev and taps CONFIRM; only then does the slot reopen.
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
    const { callId, appointmentId } = body.data;

    // Fenced: the appointment must belong to this clinic and be active (C11).
    const appointment = await prisma.appointmentRecord.findFirst({
      where: { id: appointmentId, clinicId },
    });
    if (!appointment) {
      return NextResponse.json({ error: "appointment_not_found" }, { status: 404 });
    }
    if (appointment.status === "cancelled" || appointment.status === "moved") {
      return NextResponse.json({ error: "nothing_active" }, { status: 409 });
    }

    const { call, task, vaAvailable } = await createAiTask({
      clinicId,
      callId,
      callType: "cancel",
      taskType: "cancel",
      payload: {
        appointmentId,
        patientName: appointment.patientName,
        date: appointment.date.toISOString().slice(0, 10),
        time: appointment.time,
      },
    });

    return NextResponse.json(
      { callId: call.id, taskId: task.id, vaAvailable },
      { status: 202 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}
