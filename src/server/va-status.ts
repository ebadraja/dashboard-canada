// VA available/busy toggle (Doc 1 §2 status strip): "a traffic light telling
// the system whether to route or offer a callback". In-memory is fine — it is
// live presence, not a fact worth persisting (one long-running server).

const globalForStatus = globalThis as unknown as {
  vaStatus?: Map<string, boolean>;
};
const status: Map<string, boolean> = (globalForStatus.vaStatus ??= new Map());

/** Default is available — the timeout net (Rule 4) still catches silence. */
export function isVaAvailable(clinicId: string): boolean {
  return status.get(clinicId) ?? true;
}

export function setVaAvailable(clinicId: string, available: boolean): void {
  status.set(clinicId, available);
}
