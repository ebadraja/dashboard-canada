import type {
  AvailabilitySource,
  AvailabilityState,
  Prisma,
} from "@prisma/client";
import { publish } from "./events";

// Slot flips (plan §7): booked -> taken, cancelled -> open, morning load and
// midday reconciliation set the whole day. Always inside the caller's
// transaction so the flip commits together with the change that caused it.

export async function flipSlot(
  tx: Prisma.TransactionClient,
  clinicId: string,
  date: string, // YYYY-MM-DD
  time: string, // HH:MM
  state: AvailabilityState,
  source: AvailabilitySource,
) {
  await tx.availabilityEntry.upsert({
    where: { clinicId_date_time: { clinicId, date: new Date(date), time } },
    create: { clinicId, date: new Date(date), time, state, source },
    update: { state, source },
  });
}

/**
 * Load a whole day in ONE batch (morning load / availability answer).
 * A loop of upserts would be one network round-trip per slot — against a
 * remote Postgres that overruns the transaction window (P2028). Delete +
 * createMany is two round-trips regardless of slot count.
 */
export async function loadDay(
  tx: Prisma.TransactionClient,
  clinicId: string,
  date: string,
  templateTimes: string[],
  openTimes: string[],
  source: AvailabilitySource,
) {
  await tx.availabilityEntry.deleteMany({
    where: { clinicId, date: new Date(date) },
  });
  await tx.availabilityEntry.createMany({
    data: templateTimes.map((time) => ({
      clinicId,
      date: new Date(date),
      time,
      state: openTimes.includes(time) ? ("open" as const) : ("taken" as const),
      source,
    })),
  });
}

/** Tell the rail the board changed. Call AFTER the transaction commits. */
export function notifyBoard(clinicId: string, date: string) {
  publish(clinicId, { type: "availability.changed", data: { date } });
}
