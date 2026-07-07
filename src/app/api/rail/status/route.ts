import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { isVaAvailable, setVaAvailable } from "@/server/va-status";

// The status strip (Doc 1 §2): available/busy toggle + how many requests
// are waiting. The traffic light that tells the AI to route or offer a
// callback.
export async function GET() {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }
    const waiting = await prisma.task.count({
      where: { clinicId: caller.clinicId, state: { in: ["waiting", "reopened"] } },
    });
    return NextResponse.json({
      available: isVaAvailable(caller.clinicId),
      waiting,
    });
  } catch (e) {
    return guardResponse(e);
  }
}

const schema = z.object({ available: z.boolean() });

export async function POST(req: Request) {
  try {
    const caller = await requireUser(["va"]);
    if (!caller.clinicId) {
      return NextResponse.json({ error: "No clinic assigned" }, { status: 403 });
    }
    const body = schema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "available must be boolean" }, { status: 400 });
    }
    setVaAvailable(caller.clinicId, body.data.available);
    return NextResponse.json({ available: body.data.available });
  } catch (e) {
    return guardResponse(e);
  }
}
