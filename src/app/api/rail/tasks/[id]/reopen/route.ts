import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { transitionTask, notifyTask, TransitionError } from "@/server/tasks";

// Doc 1 §3: timed_out -> reopened. The VA picks a missed card back up
// (e.g. to finish an unconfirmed booking, B10) — or taps close instead.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireUser(["va"]);
    const { id } = await params;
    const { close } = (await req.json().catch(() => ({}))) as {
      close?: boolean;
    };

    const task = await prisma.task.findFirst({
      where: { id, clinicId: caller.clinicId ?? "__none__" },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction((tx) =>
      transitionTask(tx, task, close ? "closed" : "reopened", {
        byUserId: caller.id,
        vaUserId: caller.id,
      }),
    );

    notifyTask(task.clinicId, "task.updated", updated);
    return NextResponse.json({ id: updated.id, state: updated.state });
  } catch (e) {
    if (e instanceof TransitionError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return guardResponse(e);
  }
}
