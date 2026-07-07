import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { transitionTask, notifyTask, TransitionError } from "@/server/tasks";
import { flipSlot, loadDay, notifyBoard } from "@/server/availability";
import { audit } from "@/server/audit";
import { timeRe } from "@/server/ai";

// The VA's tap (Doc 1 §3: waiting -> answered). Golden Rule 1 is enforced
// here: only responses built from real things (template slots, real
// appointment ids) are accepted — an impossible answer is a 400/422, not a
// message to the AI.
//
// Tasks WITHOUT a confirm step (availability, find, callback) complete here:
// answered -> done in the same transaction; the AI reads payload.response.
// Tasks WITH a real-world action (book, cancel, move) stay "answered" until
// the CONFIRM endpoint (Golden Rule 3) — except a book answered "slot gone"
// (B1), which ends the task and voids the requested appointment.

const availabilityAnswer = z.object({
  openSlots: z.array(z.string().regex(timeRe)).optional(),
  fullyBooked: z.boolean().optional(),
});
const findAnswer = z.object({
  appointmentId: z.string().optional(),
  notFound: z.boolean().optional(), // C1
  multipleMatches: z.boolean().optional(), // C2
  nothingActive: z.boolean().optional(), // C11
});
const bookAnswer = z.object({
  slotGone: z.boolean(), // B1 — the only non-CONFIRM answer for a booking
});
const callbackAnswer = z.object({
  handled: z.boolean(), // VA called/texted the patient back
});

export async function POST(
  req: Request,
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
        { error: `Task is ${task.state}, not answerable` },
        { status: 409 },
      );
    }

    const body = (await req.json()) as { response?: unknown };
    const raw = body.response ?? {};
    const clinicId = task.clinicId;
    const payload = task.payload as Record<string, unknown>;

    let boardDate: string | null = null;

    const updated = await prisma.$transaction(
      async (tx) => {
      switch (task.type) {
        case "availability": {
          const r = availabilityAnswer.parse(raw);
          const date = payload.date as string;
          const template = await tx.slotTemplateEntry.findMany({
            where: { clinicId },
            select: { time: true },
          });
          const templateTimes = new Set(template.map((t) => t.time));
          const open = r.fullyBooked ? [] : (r.openSlots ?? []);
          // Golden Rule 1: only real template slots are acceptable.
          for (const t of open) {
            if (!templateTimes.has(t)) {
              throw new z.ZodError([
                { code: "custom", message: `${t} is not on the slot menu`, path: [], input: t },
              ]);
            }
          }
          // Persist: the day is now loaded — future AI asks answer instantly.
          await loadDay(tx, clinicId, date, [...templateTimes], open, "morning");
          boardDate = date;
          const answered = await transitionTask(tx, task, "answered", {
            byUserId: caller.id,
            vaUserId: caller.id,
            payloadPatch: { response: r.fullyBooked ? { fullyBooked: true } : { openSlots: open } },
          });
          return transitionTask(tx, answered, "done", { byUserId: caller.id });
        }

        case "find": {
          const r = findAnswer.parse(raw);
          let response: Record<string, unknown>;
          if (r.appointmentId) {
            // Golden Rule 1: must be a real, active appointment of THIS clinic.
            const appt = await tx.appointmentRecord.findFirst({
              where: {
                id: r.appointmentId,
                clinicId,
                status: { in: ["requested", "confirmed"] },
              },
            });
            if (!appt) {
              throw new z.ZodError([
                { code: "custom", message: "Not an active appointment of this clinic", path: [], input: r.appointmentId },
              ]);
            }
            response = {
              appointmentId: appt.id,
              date: appt.date.toISOString().slice(0, 10),
              time: appt.time,
              type: appt.type,
            };
          } else if (r.notFound) response = { notFound: true };
          else if (r.multipleMatches) response = { multipleMatches: true };
          else if (r.nothingActive) response = { nothingActive: true };
          else {
            throw new z.ZodError([
              { code: "custom", message: "Empty find answer", path: [], input: r },
            ]);
          }
          const answered = await transitionTask(tx, task, "answered", {
            byUserId: caller.id,
            vaUserId: caller.id,
            payloadPatch: { response },
          });
          return transitionTask(tx, answered, "done", { byUserId: caller.id });
        }

        case "book": {
          const r = bookAnswer.parse(raw);
          if (!r.slotGone) {
            throw new z.ZodError([
              { code: "custom", message: "A booking is completed via CONFIRM, not answer", path: [], input: r },
            ]);
          }
          // B1: the slot was taken when the VA looked in Rev. Void the
          // requested appointment, mark the slot taken, tell the AI.
          const appointmentId = payload.appointmentId as string;
          await tx.appointmentRecord.update({
            where: { id: appointmentId },
            data: { status: "cancelled" },
          });
          await audit(tx, {
            userId: caller.id,
            action: "appointment.slot_gone",
            entityType: "AppointmentRecord",
            entityId: appointmentId,
          });
          await flipSlot(tx, clinicId, payload.date as string, payload.time as string, "taken", "reconcile");
          boardDate = payload.date as string;
          const answered = await transitionTask(tx, task, "answered", {
            byUserId: caller.id,
            vaUserId: caller.id,
            payloadPatch: { response: { slotGone: true } },
          });
          return transitionTask(tx, answered, "done", { byUserId: caller.id });
        }

        case "callback": {
          callbackAnswer.parse(raw);
          const answered = await transitionTask(tx, task, "answered", {
            byUserId: caller.id,
            vaUserId: caller.id,
            payloadPatch: { response: { handled: true } },
          });
          return transitionTask(tx, answered, "done", { byUserId: caller.id });
        }

        // cancel / move have no partial answer — only CONFIRM.
        default:
          throw new z.ZodError([
            { code: "custom", message: `${task.type} is completed via CONFIRM`, path: [], input: task.type },
          ]);
      }
      },
      { timeout: 15_000 }, // remote Postgres: allow for network latency
    );

    notifyTask(clinicId, "task.updated", updated);
    if (boardDate) notifyBoard(clinicId, boardDate);
    return NextResponse.json({ id: updated.id, state: updated.state });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? "Invalid answer" },
        { status: 422 },
      );
    }
    if (e instanceof TransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return guardResponse(e);
  }
}
