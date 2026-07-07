import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse, hashApiKey } from "@/server/guard";
import { audit } from "@/server/audit";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const createClinicSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1), // IANA, e.g. "America/Toronto"
  hours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))).optional(),
  planName: z.string().optional(),
  monthlyPriceCents: z.number().int().positive().optional(),
  // The fixed daily menu (plan §3): every slot the clinic could ever offer.
  slotTemplate: z
    .array(
      z.object({
        block: z.enum(["morning", "afternoon", "evening"]),
        time: z.string().regex(timeRe, "time must be HH:MM 24h"),
      }),
    )
    .optional(),
});

// Operator-only: create a clinic by data entry, never code (Doc 3 §2).
export async function POST(req: Request) {
  try {
    const caller = await requireUser(["operator"]);

    const body = createClinicSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { name, timezone, hours, planName, monthlyPriceCents, slotTemplate } =
      body.data;

    // Per-clinic API key for the AI phone system. Returned ONCE in plain
    // text; only the hash is stored.
    const apiKey = `clinic_${randomBytes(24).toString("hex")}`;

    const clinic = await prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name,
          timezone,
          hours,
          planName,
          monthlyPriceCents,
          apiKeyHash: hashApiKey(apiKey),
          slotTemplate: slotTemplate
            ? { create: slotTemplate }
            : undefined,
        },
      });
      await audit(tx, {
        userId: caller.id,
        action: "clinic.created",
        entityType: "Clinic",
        entityId: clinic.id,
        meta: { name, timezone, planName, monthlyPriceCents },
      });
      return clinic;
    });

    return NextResponse.json(
      {
        id: clinic.id,
        name: clinic.name,
        status: clinic.status,
        apiKey, // shown once — store it in the AI phone system now
      },
      { status: 201 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}

// Operator-only: list clinics (minimal, for verification).
export async function GET() {
  try {
    await requireUser(["operator"]);
    const clinics = await prisma.clinic.findMany({
      select: { id: true, name: true, timezone: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(clinics);
  } catch (e) {
    return guardResponse(e);
  }
}
