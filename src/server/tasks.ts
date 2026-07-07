import type { Prisma, Task, TaskState } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { publish } from "./events";

// The task state machine (Doc 1 §3). The backend is the referee — it moves
// tasks along fixed arrows and forbids skipping. A booking cannot be
// "confirmed" before it was "answered" because no arrow allows it.
//
//   waiting   -> answered | timed_out
//   answered  -> confirmed | done
//   confirmed -> done
//   timed_out -> reopened | closed
//   reopened  -> answered | timed_out   (a reopened card behaves like waiting)
const ALLOWED: Record<TaskState, TaskState[]> = {
  waiting: ["answered", "timed_out"],
  answered: ["confirmed", "done"],
  confirmed: ["done"],
  timed_out: ["reopened", "closed"],
  reopened: ["answered", "timed_out"],
  done: [],
  closed: [],
};

// How long the AI waits for the VA before offering a callback (Rule 4).
export const TASK_TIMEOUT_SECONDS = Number(
  process.env.TASK_TIMEOUT_SECONDS ?? 45,
);

export class TransitionError extends Error {
  constructor(from: TaskState, to: TaskState) {
    super(`Illegal task transition ${from} -> ${to}`);
  }
}

const STATE_TIMESTAMP: Partial<Record<TaskState, keyof Task>> = {
  answered: "answeredAt",
  confirmed: "confirmedAt",
  done: "closedAt",
  closed: "closedAt",
};

/**
 * Move a task along an allowed arrow, inside the given transaction.
 * Writes the state timestamp, merges any payload patch (e.g. the VA's
 * response), audit-logs the move, and returns the updated task.
 * NOTE: publish AFTER the transaction commits — use notifyTask().
 */
export async function transitionTask(
  tx: Prisma.TransactionClient,
  task: Task,
  to: TaskState,
  opts: {
    byUserId?: string | null; // null = system (e.g. timeout sweep)
    vaUserId?: string; // set on answer: the VA who handled it
    payloadPatch?: Record<string, unknown>;
  } = {},
): Promise<Task> {
  if (!ALLOWED[task.state].includes(to)) {
    throw new TransitionError(task.state, to);
  }

  const data: Prisma.TaskUpdateInput = { state: to };
  const tsField = STATE_TIMESTAMP[to];
  if (tsField) (data as Record<string, unknown>)[tsField] = new Date();
  if (opts.vaUserId) data.vaUser = { connect: { id: opts.vaUserId } };
  if (opts.payloadPatch) {
    data.payload = {
      ...(task.payload as Record<string, unknown>),
      ...opts.payloadPatch,
    } as Prisma.InputJsonValue;
  }

  const updated = await tx.task.update({ where: { id: task.id }, data });

  await audit(tx, {
    userId: opts.byUserId ?? null,
    action: `task.${to}`,
    entityType: "Task",
    entityId: task.id,
    meta: { from: task.state, to, type: task.type },
  });

  return updated;
}

/** Ding the rail. Call after the transaction that changed the task commits. */
export function notifyTask(
  clinicId: string,
  kind: "task.created" | "task.updated",
  task: Task,
) {
  publish(clinicId, {
    type: kind,
    data: {
      id: task.id,
      callId: task.callId,
      type: task.type,
      state: task.state,
      payload: task.payload,
      createdAt: task.createdAt,
    },
  });
}

/**
 * Lazy timeout (Rule 4): called whenever the AI polls a task. If it is still
 * unanswered past the deadline, mark it timed_out and set the call outcome
 * to callback — the poll response tells the AI to offer a callback/text.
 */
export async function timeoutIfExpired(task: Task): Promise<Task> {
  const expirable = task.state === "waiting" || task.state === "reopened";
  if (!expirable) return task;

  const ageSeconds = (Date.now() - task.createdAt.getTime()) / 1000;
  if (ageSeconds < TASK_TIMEOUT_SECONDS) return task;

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
    if (fresh.state !== "waiting" && fresh.state !== "reopened") return fresh;
    const moved = await transitionTask(tx, fresh, "timed_out", {
      byUserId: null,
    });
    await tx.call.update({
      where: { id: task.callId },
      data: { outcome: "callback" },
    });
    return moved;
  });

  if (updated.state === "timed_out") {
    notifyTask(task.clinicId, "task.updated", updated);
  }
  return updated;
}
