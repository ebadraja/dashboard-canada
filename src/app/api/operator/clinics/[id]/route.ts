import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { audit } from "@/server/audit";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  status: z.enum(["setup", "live", "paused"]).optional(),
  hours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))).optional(),
  planName: z.string().optional(),
  monthlyPriceCents: z.number().int().positive().optional(),
  // Replaces the whole template if present (the fixed daily menu).
  slotTemplate: z
    .array(
      z.object({
        block: z.enum(["morning", "afternoon", "evening"]),
        time: z.string().regex(timeRe),
      }),
    )
    .optional(),
});

// Operator-only: configure a clinic by form, not code (Doc 3 §2) — set
// hours, slot template, plan, and go live. Every change audit-logged.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireUser(["operator"]);
    const { id } = await params;

    const body = patchSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const { slotTemplate, ...fields } = body.data;

    const clinic = await prisma.clinic.findUnique({ where: { id } });
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(
      async (tx) => {
        if (slotTemplate) {
          await tx.slotTemplateEntry.deleteMany({ where: { clinicId: id } });
          await tx.slotTemplateEntry.createMany({
            data: slotTemplate.map((s) => ({ ...s, clinicId: id })),
          });
        }
        const updated = await tx.clinic.update({ where: { id }, data: fields });
        await audit(tx, {
          userId: caller.id,
          action: "clinic.updated",
          entityType: "Clinic",
          entityId: id,
          meta: { ...fields, slotTemplateReplaced: !!slotTemplate },
        });
        return updated;
      },
      { timeout: 15_000 },
    );

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      status: updated.status,
      planName: updated.planName,
      monthlyPriceCents: updated.monthlyPriceCents,
    });
  } catch (e) {
    return guardResponse(e);
  }
}

// Operator-only: full clinic detail (including plan/price — operator sees all).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["operator"]);
    const { id } = await params;
    const clinic = await prisma.clinic.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        timezone: true,
        status: true,
        hours: true,
        planName: true,
        monthlyPriceCents: true,
        currency: true,
        createdAt: true,
        slotTemplate: { select: { block: true, time: true }, orderBy: { time: "asc" } },
      },
    });
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }
    return NextResponse.json(clinic);
  } catch (e) {
    return guardResponse(e);
  }
}
