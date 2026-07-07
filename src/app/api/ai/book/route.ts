import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAiClinic, guardResponse } from "@/server/guard";
import { createAiTask, dateRe, timeRe, isTemplateTime } from "@/server/ai";
import { audit } from "@/server/audit";

const schema = z.object({
  date: z.string().regex(dateRe),
  time: z.string().regex(timeRe),
  patientName: z.string().min(1),
  patientDob: z.string().regex(dateRe, "patientDob must be YYYY-MM-DD"),
  appointmentType: z.string().default("eye exam"),
  note: z.string().optional(), // e.g. "booking for son" (B5)
  newPatient: z.boolean().default(false), // B6
  callId: z.string().optional(),
});

// AI: "Book <slot> for <patient>" (Doc 1 §6). Creates a requested
// appointment + a booking task; the VA books it for real in Rev and taps
// CONFIRM (Golden Rule 3). Nothing counts until then (B10).
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
    const p = body.data;

    // B3: a time the clinic never offers is rejected at the door.
    if (!(await isTemplateTime(clinicId, p.time))) {
      return NextResponse.json(
        { error: "impossible_time", detail: "Not on this clinic's slot menu" },
        { status: 422 },
      );
    }

    // B1/B9 pre-check: if the day is loaded and the slot is not open, say so
    // now. (Final truth remains the VA's CONFIRM against Rev.)
    const entry = await prisma.availabilityEntry.findUnique({
      where: { clinicId_date_time: { clinicId, date: new Date(p.date), time: p.time } },
    });
    if (entry && entry.state !== "open") {
      return NextResponse.json({ error: "slot_taken" }, { status: 409 });
    }

    const appointment = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointmentRecord.create({
        data: {
          clinicId,
          patientName: p.patientName,
          patientDob: new Date(p.patientDob),
          date: new Date(p.date),
          time: p.time,
          type: p.appointmentType,
          status: "requested",
        },
      });
      await audit(tx, {
        userId: null,
        action: "appointment.requested",
        entityType: "AppointmentRecord",
        entityId: appointment.id,
        meta: { date: p.date, time: p.time },
      });
      return appointment;
    });

    const { call, task, vaAvailable } = await createAiTask({
      clinicId,
      callId: p.callId,
      callType: "book",
      taskType: "book",
      payload: {
        appointmentId: appointment.id,
        date: p.date,
        time: p.time,
        patientName: p.patientName,
        patientDob: p.patientDob,
        appointmentType: p.appointmentType,
        note: p.note,
        newPatient: p.newPatient,
      },
    });

    // Link the appointment to the call that created it (Doc 0 relationship).
    await prisma.appointmentRecord.update({
      where: { id: appointment.id },
      data: { createdByCallId: call.id },
    });

    return NextResponse.json(
      {
        callId: call.id,
        taskId: task.id,
        appointmentId: appointment.id,
        vaAvailable,
      },
      { status: 202 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}
