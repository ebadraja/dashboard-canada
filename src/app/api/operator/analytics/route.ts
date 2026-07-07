import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

// Cross-clinic analytics + the two sides of money meeting (Doc 3 §3.2):
// revenue (plan / invoices), cost (CostEntry), margin — per clinic, for a
// month. ONLY the operator role reaches this handler.
export async function GET(req: Request) {
  try {
    await requireUser(["operator"]);
    const month = new URL(req.url).searchParams.get("month") ?? "";
    if (!monthRe.test(month)) {
      return NextResponse.json({ error: "month (YYYY-MM) is required" }, { status: 400 });
    }
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const inRange = { gte: start, lt: end };

    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true, status: true, planName: true, monthlyPriceCents: true, currency: true },
      orderBy: { createdAt: "asc" },
    });

    const rows = await Promise.all(
      clinics.map(async (c) => {
        const [calls, bookings, cancels, moves, callbacks, costAgg, paidAgg] =
          await Promise.all([
            prisma.call.count({ where: { clinicId: c.id, startedAt: inRange } }),
            prisma.call.count({
              where: {
                clinicId: c.id,
                startedAt: inRange,
                type: "book",
                createdAppointments: { some: { status: "confirmed" } },
              },
            }),
            prisma.call.count({
              where: { clinicId: c.id, startedAt: inRange, type: "cancel", outcome: "completed" },
            }),
            prisma.call.count({
              where: { clinicId: c.id, startedAt: inRange, type: "move", outcome: "completed" },
            }),
            prisma.call.count({
              where: { clinicId: c.id, startedAt: inRange, outcome: { in: ["callback", "timed_out"] } },
            }),
            prisma.costEntry.aggregate({
              where: { clinicId: c.id, month },
              _sum: { amountCents: true },
            }),
            prisma.invoice.aggregate({
              where: { clinicId: c.id, periodStart: start, status: "paid" },
              _sum: { amountCents: true },
            }),
          ]);

        const revenueCents = c.monthlyPriceCents ?? 0; // plan price for the month
        const paidCents = paidAgg._sum.amountCents ?? 0; // actually collected
        const costCents = costAgg._sum.amountCents ?? 0;
        return {
          clinicId: c.id,
          name: c.name,
          status: c.status,
          planName: c.planName,
          currency: c.currency,
          calls,
          bookings,
          cancellations: cancels,
          reschedules: moves,
          callbackRate: calls === 0 ? null : callbacks / calls,
          revenueCents,
          paidCents,
          costCents,
          marginCents: revenueCents - costCents,
        };
      }),
    );

    return NextResponse.json({ month, clinics: rows });
  } catch (e) {
    return guardResponse(e);
  }
}
