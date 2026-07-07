import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash } from "crypto";

// Bootstrap seed (Doc 0 DoD: "operator can create one clinic and one VA user
// (even via a minimal screen or seed)"). Creates:
//   - one operator login (no clinic — Doc 0)
//   - one clinic, status live, with the plan §3 example slot template
//   - one VA login in that clinic
// Idempotent: skips anything that already exists. Prints generated
// credentials ONCE — save them.

const prisma = new PrismaClient();

const pw = () => randomBytes(9).toString("base64url"); // ~12 chars
const hashApiKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");

// The fixed daily menu — example from the plan §3 (single doctor).
const SLOT_TEMPLATE: { block: "morning" | "afternoon" | "evening"; time: string }[] = [
  ...["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"].map((time) => ({ block: "morning" as const, time })),
  ...["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"].map((time) => ({ block: "afternoon" as const, time })),
  ...["17:00", "17:30", "18:00", "18:30", "19:00"].map((time) => ({ block: "evening" as const, time })),
];

async function main() {
  const out: string[] = [];

  // 1. Operator
  const operatorEmail = "operator@example.com";
  let operator = await prisma.user.findUnique({ where: { email: operatorEmail } });
  if (!operator) {
    const password = pw();
    operator = await prisma.user.create({
      data: {
        name: "Operator",
        email: operatorEmail,
        passwordHash: await hash(password, 12),
        role: "operator",
        clinicId: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: operator.id,
        action: "user.created",
        entityType: "User",
        entityId: operator.id,
        meta: { email: operatorEmail, role: "operator", via: "seed" },
      },
    });
    out.push(`operator login  : ${operatorEmail} / ${password}`);
  } else {
    out.push(`operator login  : ${operatorEmail} (already exists, password unchanged)`);
  }

  // 2. Clinic
  const clinicName = "Pilot Eye Clinic";
  let clinic = await prisma.clinic.findFirst({ where: { name: clinicName } });
  if (!clinic) {
    const apiKey = `clinic_${randomBytes(24).toString("hex")}`;
    clinic = await prisma.clinic.create({
      data: {
        name: clinicName,
        timezone: "America/Toronto",
        status: "live",
        planName: "Standard",
        monthlyPriceCents: 220_000, // $2,200/mo — the plan's example price
        apiKeyHash: hashApiKey(apiKey),
        slotTemplate: { create: SLOT_TEMPLATE },
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: operator.id,
        action: "clinic.created",
        entityType: "Clinic",
        entityId: clinic.id,
        meta: { name: clinicName, via: "seed" },
      },
    });
    out.push(`clinic          : ${clinicName} (${clinic.id})`);
    out.push(`clinic AI key   : ${apiKey}`);
  } else {
    out.push(`clinic          : ${clinicName} (already exists)`);
  }

  // 3. VA
  const vaEmail = "va@example.com";
  const existingVa = await prisma.user.findUnique({ where: { email: vaEmail } });
  if (!existingVa) {
    const password = pw();
    const va = await prisma.user.create({
      data: {
        name: "Pilot VA",
        email: vaEmail,
        passwordHash: await hash(password, 12),
        role: "va",
        clinicId: clinic.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: operator.id,
        action: "user.created",
        entityType: "User",
        entityId: va.id,
        meta: { email: vaEmail, role: "va", clinicId: clinic.id, via: "seed" },
      },
    });
    out.push(`va login        : ${vaEmail} / ${password}`);
  } else {
    out.push(`va login        : ${vaEmail} (already exists, password unchanged)`);
  }

  console.log("\n=== Seed complete — save these credentials ===");
  for (const line of out) console.log("  " + line);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
