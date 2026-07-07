// In-process event bus for the live rail (see STACK.md: one long-running
// Node server, so a process-local bus is correct — no extra infrastructure).
// The SSE route subscribes per clinic; task/availability changes publish here
// and reach the VA's screen within milliseconds (Doc 1 §5: ding within ~1s).

export type RailEvent = {
  type:
    | "task.created" // a new card — this is the ding
    | "task.updated" // state change (answered/confirmed/timed_out/...)
    | "availability.changed"; // slot flipped open/taken
  data: unknown;
};

type Listener = (event: RailEvent) => void;

// Survive dev hot-reload with a global stash (same trick as db.ts).
const globalForBus = globalThis as unknown as {
  railBus?: Map<string, Set<Listener>>;
};
const bus: Map<string, Set<Listener>> = (globalForBus.railBus ??= new Map());

export function subscribe(clinicId: string, listener: Listener): () => void {
  let set = bus.get(clinicId);
  if (!set) {
    set = new Set();
    bus.set(clinicId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) bus.delete(clinicId);
  };
}

export function publish(clinicId: string, event: RailEvent): void {
  const set = bus.get(clinicId);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // one broken subscriber must never block the others
    }
  }
}
