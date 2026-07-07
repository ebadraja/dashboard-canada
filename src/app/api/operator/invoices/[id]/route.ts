import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { audit } from "@/server/audit";

// Invoice lifecycle (Doc 3 §3.1): draft -> sent -> paid (or overdue).
// Payments are recorded by hand in the pilot; a provider can come later.
const ALLOWED: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["paid", "overdue"],
  overdue: ["paid"],
  paid: [],
};

const patchSchema = z.object({
  status: z.enum(["sent", "paid", "overdue"]),
});

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

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (!ALLOWED[invoice.status].includes(body.data.status)) {
      return NextResponse.json(
        { error: `Cannot move an invoice from ${invoice.status} to ${body.data.status}` },
        { status: 409 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: body.data.status,
          ...(body.data.status === "sent" ? { sentAt: new Date() } : {}),
          ...(body.data.status === "paid" ? { paidAt: new Date() } : {}),
        },
      });
      await audit(tx, {
        userId: caller.id,
        action: `invoice.${body.data.status}`,
        entityType: "Invoice",
        entityId: id,
        meta: { from: invoice.status },
      });
      return updated;
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      sentAt: updated.sentAt,
      paidAt: updated.paidAt,
    });
  } catch (e) {
    return guardResponse(e);
  }
}
