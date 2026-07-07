import type { Call, CallType, Prisma, Task, TaskType } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { notifyTask } from "./tasks";
import { isVaAvailable } from "./va-status";

// Shared plumbing for the AI phone endpoints (Doc 1 §6): every request the
// AI makes either answers instantly from AvailabilityEntry (fast layer) or
// creates a Call + Task and dings the VA (live layer).

/** Reuse the phone call's Call row if the AI passed one, else create it.
 *  A call that started as "availability" and became a booking is re-typed —
 *  Doc 2 counts bookings as calls of type book. */
export async function resolveCall(
  tx: Prisma.TransactionClient,
  clinicId: string,
  callId: string | undefined,
  type: CallType,
): Promise<Call> {
  if (callId) {
    const call = await tx.call.findFirst({
      where: { id: callId, clinicId }, // fenced: must be this clinic's call
    });
    if (call) {
      if (call.type !== type && type !== "availability") {
        return tx.call.update({ where: { id: call.id }, data: { type } });
      }
      return call;
    }
  }
  return tx.call.create({ data: { clinicId, type } });
}

/** Create the rail card and ding the VA. Returns call + task. */
export async function createAiTask(opts: {
  clinicId: string;
  callId?: string;
  callType: CallType;
  taskType: TaskType;
  payload: Record<string, unknown>;
}): Promise<{ call: Call; task: Task; vaAvailable: boolean }> {
  const { call, task } = await prisma.$transaction(async (tx) => {
    const call = await resolveCall(tx, opts.clinicId, opts.callId, opts.callType);
    const task = await tx.task.create({
      data: {
        clinicId: opts.clinicId,
        callId: call.id,
        type: opts.taskType,
        payload: opts.payload as Prisma.InputJsonValue,
      },
    });
    await audit(tx, {
      userId: null, // AI-initiated
      action: "task.created",
      entityType: "Task",
      entityId: task.id,
      meta: { type: opts.taskType, callId: call.id },
    });
    return { call, task };
  });

  notifyTask(opts.clinicId, "task.created", task); // the ding
  return { call, task, vaAvailable: isVaAvailable(opts.clinicId) };
}

export const dateRe = /^\d{4}-\d{2}-\d{2}$/;
export const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Golden Rule 1 support: a time the clinic never offers is rejected at the
 *  door — impossible answers cannot even enter the system. */
export async function isTemplateTime(
  clinicId: string,
  time: string,
): Promise<boolean> {
  const hit = await prisma.slotTemplateEntry.findUnique({
    where: { clinicId_time: { clinicId, time } },
  });
  return !!hit;
}
