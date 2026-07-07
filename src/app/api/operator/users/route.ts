import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser, guardResponse } from "@/server/guard";
import { audit } from "@/server/audit";

const createUserSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(10, "password must be at least 10 characters"),
    role: z.enum(["va", "doctor", "operator"]),
    clinicId: z.string().optional(),
  })
  .refine((u) => u.role === "operator" || !!u.clinicId, {
    message: "va and doctor users must belong to a clinic",
  })
  .refine((u) => u.role !== "operator" || !u.clinicId, {
    message: "operator has no clinic (Doc 0)",
  });

// Operator-only: list all users across clinics (Doc 3 §2).
export async function GET() {
  try {
    await requireUser(["operator"]);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        clinicId: true,
        clinic: { select: { name: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(users);
  } catch (e) {
    return guardResponse(e);
  }
}

// Operator-only: create VA / doctor / operator logins (Doc 3 §2).
export async function POST(req: Request) {
  try {
    const caller = await requireUser(["operator"]);

    const body = createUserSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: body.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { name, email, password, role, clinicId } = body.data;

    if (clinicId) {
      const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
      if (!clinic) {
        return NextResponse.json({ error: "Clinic not found" }, { status: 400 });
      }
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with that email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role, clinicId: clinicId ?? null },
      });
      await audit(tx, {
        userId: caller.id,
        action: "user.created",
        entityType: "User",
        entityId: user.id,
        meta: { email, role, clinicId: clinicId ?? null },
      });
      return user;
    });

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId,
      },
      { status: 201 },
    );
  } catch (e) {
    return guardResponse(e);
  }
}
