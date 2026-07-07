-- CreateEnum
CREATE TYPE "Role" AS ENUM ('va', 'doctor', 'operator');

-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('setup', 'live', 'paused');

-- CreateEnum
CREATE TYPE "SlotBlock" AS ENUM ('morning', 'afternoon', 'evening');

-- CreateEnum
CREATE TYPE "AvailabilityState" AS ENUM ('open', 'taken', 'held');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('morning', 'booking', 'cancel', 'reconcile');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('requested', 'confirmed', 'cancelled', 'moved');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('book', 'cancel', 'move', 'availability', 'callback');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('completed', 'callback', 'timed_out', 'abandoned');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('availability', 'book', 'find', 'cancel', 'move', 'callback');

-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('waiting', 'answered', 'confirmed', 'done', 'timed_out', 'reopened', 'closed');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "ClinicStatus" NOT NULL DEFAULT 'setup',
    "hours" JSONB,
    "planName" TEXT,
    "monthlyPriceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "apiKeyHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "clinicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotTemplateEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "block" "SlotBlock" NOT NULL,
    "time" TEXT NOT NULL,

    CONSTRAINT "SlotTemplateEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "state" "AvailabilityState" NOT NULL,
    "source" "AvailabilitySource" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientDob" DATE NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'requested',
    "createdByCallId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "outcome" "CallOutcome",
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSeconds" INTEGER,
    "vaUserId" TEXT,
    "appointmentId" TEXT,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "state" "TaskState" NOT NULL DEFAULT 'waiting',
    "payload" JSONB NOT NULL,
    "vaUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "lineItems" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_apiKeyHash_key" ON "Clinic"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- CreateIndex
CREATE INDEX "SlotTemplateEntry_clinicId_block_idx" ON "SlotTemplateEntry"("clinicId", "block");

-- CreateIndex
CREATE UNIQUE INDEX "SlotTemplateEntry_clinicId_time_key" ON "SlotTemplateEntry"("clinicId", "time");

-- CreateIndex
CREATE INDEX "AvailabilityEntry_clinicId_date_idx" ON "AvailabilityEntry"("clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityEntry_clinicId_date_time_key" ON "AvailabilityEntry"("clinicId", "date", "time");

-- CreateIndex
CREATE INDEX "AppointmentRecord_clinicId_date_idx" ON "AppointmentRecord"("clinicId", "date");

-- CreateIndex
CREATE INDEX "AppointmentRecord_clinicId_patientName_patientDob_idx" ON "AppointmentRecord"("clinicId", "patientName", "patientDob");

-- CreateIndex
CREATE INDEX "Call_clinicId_startedAt_idx" ON "Call"("clinicId", "startedAt");

-- CreateIndex
CREATE INDEX "Call_vaUserId_idx" ON "Call"("vaUserId");

-- CreateIndex
CREATE INDEX "Task_clinicId_state_idx" ON "Task"("clinicId", "state");

-- CreateIndex
CREATE INDEX "Task_callId_idx" ON "Task"("callId");

-- CreateIndex
CREATE INDEX "Invoice_clinicId_periodStart_idx" ON "Invoice"("clinicId", "periodStart");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplateEntry" ADD CONSTRAINT "SlotTemplateEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityEntry" ADD CONSTRAINT "AvailabilityEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRecord" ADD CONSTRAINT "AppointmentRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRecord" ADD CONSTRAINT "AppointmentRecord_createdByCallId_fkey" FOREIGN KEY ("createdByCallId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_vaUserId_fkey" FOREIGN KEY ("vaUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "AppointmentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_vaUserId_fkey" FOREIGN KEY ("vaUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
