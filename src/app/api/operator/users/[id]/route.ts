import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  active: z.boolean().optional(), // disable access (Doc 3 §2)
  clinicId: z.string().nullable().optional(), // reassign VA/doctor to a clinic
});

// Operator-only: disable/enable a user or reassign them to a clinic.
// Disabling takes effect on the user's NEXT request — the guard re-reads
// the user from the DB every time (see src/server/auth.ts).
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

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.role === "operator" && body.data.active === false && user.id === caller.id) {
      return NextResponse.json(
        { error: "You cannot disable your own operator account" },
        { status: 422 },
      );
    }
    if (body.data.clinicId !== undefined) {
      if (user.role === "operator" && body.data.clinicId !== null) {
        return NextResponse.json(
          { error: "operator has no clinic (Doc 0)" },
          { status: 422 },
        );
      }
      if (body.data.clinicId) {
        const clinic = await prisma.clinic.findUnique({ where: { id: body.data.clinicId } });
        if (!clinic) {
          return NextResponse.json({ error: "Clinic not found" }, { status: 400 });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: body.data });
      await audit(tx, {
        userId: caller.id,
        action:
          body.data.active === undefined
            ? "user.reassigned"
            : body.data.active
              ? "user.enabled"
              : "user.disabled",
        entityType: "User",
        entityId: id,
        meta: { ...body.data },
      });
      return updated;
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      role: updated.role,
      active: updated.active,
      clinicId: updated.clinicId,
    });
  } catch (e) {
    return guardResponse(e);
  }
}
