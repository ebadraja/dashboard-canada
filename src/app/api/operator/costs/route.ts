import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { audit } from "@/server/audit";

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

// The cost side of money (Doc 3 §3.2): VA pay, AI/voice, messaging, hosting.
// ONLY the operator role can reach these handlers — a doctor or VA request
// is rejected by the guard before any query runs.
export async function GET(req: Request) {
  try {
    await requireUser(["operator"]);
    const url = new URL(req.url);
    const clinicId = url.searchParams.get("clinicId") ?? undefined;
    const month = url.searchParams.get("month") ?? undefined;
    const costs = await prisma.costEntry.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        ...(month ? { month } : {}),
      },
      orderBy: [{ month: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        clinicId: true,
        month: true,
        label: true,
        amountCents: true,
        clinic: { select: { name: true } },
      },
    });
    return NextResponse.json(costs);
  } catch (e) {
    return guardResponse(e);
  }
}

const createSchema = z.object({
  clinicId: z.string(),
  month: z.string().regex(monthRe, "month must be YYYY-MM"),
  label: z.string().min(1),
  amountCents: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const caller = await requireUser(["operator"]);
    const body = createSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const clinic = await prisma.clinic.findUnique({ where: { id: body.data.clinicId } });
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 400 });
    }

    const cost = await prisma.$transaction(async (tx) => {
      const cost = await tx.costEntry.create({ data: body.data });
      await audit(tx, {
        userId: caller.id,
        action: "cost.recorded",
        entityType: "CostEntry",
        entityId: cost.id,
        meta: { ...body.data },
      });
      return cost;
    });

    return NextResponse.json(cost, { status: 201 });
  } catch (e) {
    return guardResponse(e);
  }
}
