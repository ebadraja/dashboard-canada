import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { createAiTask, dateRe, timeRe, isTemplateTime } from "@/server/ai";

const schema = z.object({
  callId: z.string(),
  appointmentId: z.string(), // the old appointment (from the find step)
  newDate: z.string().regex(dateRe),
  newTime: z.string().regex(timeRe),
});

// AI: "Move <appointment>" (Doc 1 §6). A cancellation glued to a booking.
// The critical rule (plan §6.2): the old appointment is only cancelled when
// the new one is secured — both halves happen in the VA's single CONFIRM,
// in one transaction. If anything fails, the old one stays untouched (R1/R7).
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
    const { callId, appointmentId, newDate, newTime } = body.data;

    const appointment = await prisma.appointmentRecord.findFirst({
      where: { id: appointmentId, clinicId },
    });
    if (!appointment) {
      return NextResponse.json({ error: "appointment_not_found" }, { status: 404 });
    }
    if (appointment.status === "cancelled" || appointment.status === "moved") {
      return NextResponse.json({ error: "nothing_active" }, { status: 409 });
    }

    // B3 applies to the new half too.
    if (!(await isTemplateTime(clinicId, newTime))) {
      return NextResponse.json({ error: "impossible_time" }, { status: 422 });
    }
    // R1 pre-check: if the new slot is loaded and not open, re-offer now.
    const entry = await prisma.availabilityEntry.findUnique({
      where: {
        clinicId_date_time: { clinicId, date: new Date(newDate), time: newTime },
      },
    });
    if (entry && entry.state !== "open") {
      return NextResponse.json({ error: "slot_taken" }, { status: 409 });
    }

    const { call, task, vaAvailable } = await createAiTask({
      clinicId,
      callId,
      callType: "move",
      taskType: "move",
      payload: {
        appointmentId,
        patientName: appointment.patientName,
        oldDate: appointment.date.toISOString().slice(0, 10),
        oldTime: appointment.time,
        newDate,
        newTime,
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
