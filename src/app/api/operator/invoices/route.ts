import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { audit } from "@/server/audit";

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

// Operator-only: list invoices (optionally per clinic).
export async function GET(req: Request) {
  try {
    await requireUser(["operator"]);
    const clinicId = new URL(req.url).searchParams.get("clinicId") ?? undefined;
    const invoices = await prisma.invoice.findMany({
      where: clinicId ? { clinicId } : {},
      orderBy: { periodStart: "desc" },
      select: {
        id: true,
        clinicId: true,
        periodStart: true,
        periodEnd: true,
        lineItems: true,
        amountCents: true,
        currency: true,
        status: true,
        sentAt: true,
        paidAt: true,
        clinic: { select: { name: true } },
      },
    });
    return NextResponse.json(invoices);
  } catch (e) {
    return guardResponse(e);
  }
}

const generateSchema = z.object({
  clinicId: z.string(),
  month: z.string().regex(monthRe, "month must be YYYY-MM"),
});

// Billing is DERIVED, not typed (Doc 3 §3): the invoice is written by the
// system from the recorded plan + the month's recorded usage. The clinic
// pays one clean subscription; usage appears as informational lines.
export async function POST(req: Request) {
  try {
    const caller = await requireUser(["operator"]);
    const body = generateSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message },
        { status: 400 },
      );
    }
    const { clinicId, month } = body.data;

    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 400 });
    }
    if (!clinic.planName || !clinic.monthlyPriceCents) {
      return NextResponse.json(
        { error: "Clinic has no plan/price set — configure it first" },
        { status: 422 },
      );
    }

    const periodStart = new Date(`${month}-01T00:00:00Z`);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    periodEnd.setUTCDate(0); // last day of the month

    // One invoice per clinic per period.
    const existing = await prisma.invoice.findFirst({
      where: { clinicId, periodStart },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An invoice for this clinic and month already exists" },
        { status: 409 },
      );
    }

    // Usage for the period — derived from the same Call rows as everything else.
    const rangeEnd = new Date(periodStart);
    rangeEnd.setUTCMonth(rangeEnd.getUTCMonth() + 1);
    const inRange = { gte: periodStart, lt: rangeEnd };
    const [calls, bookings] = await Promise.all([
      prisma.call.count({ where: { clinicId, startedAt: inRange } }),
      prisma.call.count({
        where: {
          clinicId,
          startedAt: inRange,
          type: "book",
          createdAppointments: { some: { status: "confirmed" } },
        },
      }),
    ]);

    const lineItems = [
      {
        label: `${clinic.planName} plan — ${month}`,
        amountCents: clinic.monthlyPriceCents,
      },
      // Informational usage lines (pilot: flat plan, no overage charges).
      { label: `Usage: ${calls} calls handled`, amountCents: 0 },
      { label: `Usage: ${bookings} bookings made`, amountCents: 0 },
    ];

    const invoice = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          clinicId,
          periodStart,
          periodEnd,
          lineItems,
          amountCents: clinic.monthlyPriceCents!,
          currency: clinic.currency,
          status: "draft",
        },
      });
      await audit(tx, {
        userId: caller.id,
        action: "invoice.generated",
        entityType: "Invoice",
        entityId: invoice.id,
        meta: { clinicId, month, amountCents: invoice.amountCents },
      });
      return invoice;
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    return guardResponse(e);
  }
}
