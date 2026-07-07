// Shared client helpers for the operator section.

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data;
}

export const money = (cents: number, cur = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: cur }).format(
    cents / 100,
  );

export const thisMonth = () => new Date().toISOString().slice(0, 7);

export type Clinic = {
  id: string;
  name: string;
  timezone: string;
  status: "setup" | "live" | "paused";
};

export type Health = {
  clinicId: string;
  name: string;
  status: string;
  vaAvailable: boolean;
  waiting: number;
  timedOutToday: number;
  callsToday: number;
  lastCallAt: string | null;
};
