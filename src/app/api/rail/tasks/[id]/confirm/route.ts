import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { transitionTask, notifyTask, TransitionError } from "@/server/tasks";
import { flipSlot, notifyBoard } from "@/server/availability";
import { audit } from "@/server/audit";

// CONFIRM (Golden Rule 3): the VA taps this only AFTER doing the real action
// inside RevolutionEHR. The backend records it as fact and flips availability
// — appointment status, slot state, call outcome and task state all commit in
// ONE transaction, or none of them do.
//
// For a move (plan §6.2): both halves — cancel old, book new — happen inside
// this single transaction. If the new slot is gone, the whole thing aborts
// and the old appointment stays untouched (R1/R7: no one is ever left with
// nothing).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireUser(["va"]);
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: { id, clinicId: caller.clinicId ?? "__none__" }, // fenced
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (task.state !== "waiting" && task.state !== "reopened") {
      return NextResponse.json(
        { error: `Task is ${task.state}, not confirmable` },
        { status: 409 },
      );
    }
    if (!["book", "cancel", "move"].includes(task.type)) {
      return NextResponse.json(
        { error: `${task.type} tasks have no CONFIRM step` },
        { status: 422 },
      );
    }

    const clinicId = task.clinicId;
    const payload = task.payload as Record<string, unknown>;
    const boardDates: string[] = [];

    const updated = await prisma.$transaction(
      async (tx) => {
      // The tap is both the answer and the confirmation (Doc 1 §2: booking
      // confirm = 1 tap) — walk the arrows, never skip them.
      let t = await transitionTask(tx, task, "answered", {
        byUserId: caller.id,
        vaUserId: caller.id,
      });
      t = await transitionTask(tx, t, "confirmed", { byUserId: caller.id });

      switch (task.type) {
        case "book": {
          const appointmentId = payload.appointmentId as string;
          const date = payload.date as string;
          const time = payload.time as string;
          await tx.appointmentRecord.update({
            where: { id: appointmentId },
            data: { status: "confirmed" },
          });
          await audit(tx, {
            userId: caller.id,
            action: "appointment.confirmed",
            entityType: "AppointmentRecord",
            entityId: appointmentId,
            meta: { date, time },
          });
          await flipSlot(tx, clinicId, date, time, "taken", "booking");
          boardDates.push(date);
          break;
        }

        case "cancel": {
          const appointmentId = payload.appointmentId as string;
          const appt = await tx.appointmentRecord.update({
            where: { id: appointmentId },
            data: { status: "cancelled" },
          });
          await audit(tx, {
            userId: caller.id,
            action: "appointment.cancelled",
            entityType: "AppointmentRecord",
            entityId: appointmentId,
          });
          const date = appt.date.toISOString().slice(0, 10);
          await flipSlot(tx, clinicId, date, appt.time, "open", "cancel");
          boardDates.push(date);
          break;
        }

        case "move": {
          const oldId = payload.appointmentId as string;
          const newDate = payload.newDate as string;
          const newTime = payload.newTime as string;

          // Last-line R1 check inside the transaction: if a loaded entry says
          // the new slot is taken, abort — the old appointment stays intact.
          const entry = await tx.availabilityEntry.findUnique({
            where: {
              clinicId_date_time: { clinicId, date: new Date(newDate), time: newTime },
            },
          });
          if (entry && entry.state !== "open") {
            throw new SlotGoneError();
          }

          const oldAppt = await tx.appointmentRecord.update({
            where: { id: oldId },
            data: { status: "moved" },
          });
          const newAppt = await tx.appointmentRecord.create({
            data: {
              clinicId,
              patientName: oldAppt.patientName,
              patientDob: oldAppt.patientDob,
              date: new Date(newDate),
              time: newTime,
              type: oldAppt.type,
              status: "confirmed",
              createdByCallId: task.callId,
            },
          });
          await audit(tx, {
            userId: caller.id,
            action: "appointment.moved",
            entityType: "AppointmentRecord",
            entityId: oldId,
            meta: { to: newAppt.id, newDate, newTime },
          });
          const oldDate = oldAppt.date.toISOString().slice(0, 10);
          await flipSlot(tx, clinicId, oldDate, oldAppt.time, "open", "cancel");
          await flipSlot(tx, clinicId, newDate, newTime, "taken", "booking");
          boardDates.push(oldDate, newDate);
          break;
        }
      }

      // The caller got what they asked for.
      await tx.call.update({
        where: { id: task.callId },
        data: { outcome: "completed", vaUserId: caller.id },
      });

      // Card leaves the rail; response readable by the AI poll.
      return transitionTask(tx, t, "done", {
        byUserId: caller.id,
        payloadPatch: { response: { confirmed: true } },
      });
      },
      { timeout: 15_000 }, // remote Postgres: allow for network latency
    );

    notifyTask(clinicId, "task.updated", updated);
    for (const d of new Set(boardDates)) notifyBoard(clinicId, d);
    return NextResponse.json({ id: updated.id, state: updated.state });
  } catch (e) {
    if (e instanceof SlotGoneError) {
      return NextResponse.json(
        { error: "slot_gone", detail: "New slot is no longer open — nothing was changed. Re-offer a time." },
        { status: 409 },
      );
    }
    if (e instanceof TransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return guardResponse(e);
  }
}

class SlotGoneError extends Error {}
