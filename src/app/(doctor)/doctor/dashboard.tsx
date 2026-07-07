"use client";

// The clinic's report card (Doc 2, redesigned per DESIGN.md §5.3):
// quiet stat tiles with a one-time count-up, a single-series busiest-times
// bar chart (validated hue), skeletons while loading, a table fallback.
// Strictly read-only.

import { BarChart3 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Skeleton, SkeletonTiles } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type Metrics = {
  clinicName: string;
  from: string;
  to: string;
  callsHandled: number;
  bookingsMade: number;
  cancellations: number;
  reschedules: number;
  callbackRate: number | null;
  avgResponseSeconds: number | null;
  busiestHours: { hour: number; count: number }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function Dashboard({ doctorName }: { doctorName: string }) {
  const toast = useToast();
  const [from, setFrom] = useState(iso(daysAgo(29)));
  const [to, setTo] = useState(iso(new Date()));
  const [preset, setPreset] = useState<number | null>(30);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ hour: number; count: number; x: number } | null>(null);

  const load = useCallback(
    async (f: string, t: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/doctor/metrics?from=${f}&to=${t}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body as Metrics);
      } catch (e) {
        toast("error", (e as Error).message);
      }
      setLoading(false);
    },
    [toast],
  );

  useEffect(() => {
    load(from, to);
  }, [from, to, load]);

  const applyPreset = (days: number) => {
    setPreset(days);
    setFrom(iso(daysAgo(days - 1)));
    setTo(iso(new Date()));
  };

  // Trim to the active span but always show at least 08:00–20:00.
  const hours = data?.busiestHours ?? [];
  const active = hours.filter((h) => h.count > 0).map((h) => h.hour);
  const lo = Math.min(8, ...(active.length ? [Math.min(...active)] : [8]));
  const hi = Math.max(20, ...(active.length ? [Math.max(...active)] : [20]));
  const shown = hours.slice(lo, hi + 1);
  const max = Math.max(1, ...shown.map((h) => h.count));
  const peak = shown.reduce((a, b) => (b.count > a.count ? b : a), shown[0] ?? { hour: 0, count: 0 });
  const hasData = (data?.callsHandled ?? 0) > 0;

  return (
    <AppShell
      title={data ? `${data.clinicName} — reception report` : "Reception report"}
      userName={doctorName}
      userRole="doctor"
      right={
        <div className="hidden md:flex items-center gap-1.5">
          <div className="flex rounded-lg border border-line overflow-hidden">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className={`px-3 h-8 text-body-sm font-medium transition-colors duration-120
                  ${preset === p.days ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid gap-4 max-w-[1000px]">
        {/* custom range */}
        <div className="flex items-center gap-2 text-body-sm text-ink-2">
          <span>Range</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset(null);
            }}
            className="h-8 px-2 rounded-lg bg-surface border border-line focus:border-accent focus:outline-none"
            aria-label="From"
          />
          <span className="text-ink-3">to</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset(null);
            }}
            className="h-8 px-2 rounded-lg bg-surface border border-line focus:border-accent focus:outline-none"
            aria-label="To"
          />
          <div className="md:hidden flex rounded-lg border border-line overflow-hidden ml-auto">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => applyPreset(p.days)}
                className={`px-2 h-8 text-caption font-medium
                  ${preset === p.days ? "bg-accent-soft text-accent" : "text-ink-3"}`}
              >
                {p.days}d
              </button>
            ))}
          </div>
        </div>

        {/* stat tiles */}
        {loading && !data ? (
          <SkeletonTiles count={5} />
        ) : data ? (
          <Card>
            <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-line/60">
              <StatTile value={data.callsHandled} label="Calls handled" />
              <StatTile value={data.bookingsMade} label="Bookings made" />
              <StatTile
                value={data.cancellations + data.reschedules}
                label="Cancellations & reschedules"
                hint={`${data.cancellations} cancelled · ${data.reschedules} moved`}
              />
              <StatTile
                value={data.callbackRate === null ? "—" : `${Math.round(data.callbackRate * 100)}%`}
                label="Missed / callback rate"
              />
              <StatTile
                value={data.avgResponseSeconds === null ? "—" : `${data.avgResponseSeconds}s`}
                label="Avg response time"
              />
            </div>
          </Card>
        ) : null}

        {/* busiest times */}
        <Card>
          <CardHeader
            title="Busiest times"
            subtitle="Calls per hour, in your clinic's local time"
          />
          <CardBody>
            {loading && !data ? (
              <Skeleton className="h-44" />
            ) : !hasData ? (
              <EmptyState
                icon={<BarChart3 />}
                title="No calls in this range yet"
                hint="Once your line takes calls, the pattern shows up here."
              />
            ) : (
              <>
                <div
                  className="relative flex items-end gap-[2px] h-44"
                  onMouseLeave={() => setHover(null)}
                >
                  {shown.map((h, i) => (
                    <div
                      key={h.hour}
                      className="flex-1 h-full flex flex-col justify-end"
                      onMouseEnter={() => setHover({ ...h, x: i })}
                    >
                      {h.hour === peak.hour && h.count > 0 && (
                        <div className="text-center text-caption text-ink-2 tnum mb-0.5">{h.count}</div>
                      )}
                      <div
                        className="rounded-t-[4px] bg-accent origin-bottom animate-[grow_0.2s_var(--ease-standard)]"
                        style={{
                          height: `${Math.max(h.count === 0 ? 0 : 5, (h.count / max) * 140)}px`,
                          opacity: hover && hover.hour !== h.hour ? 0.5 : 1,
                          transition: "opacity 120ms",
                        }}
                      />
                    </div>
                  ))}
                  <style>{`@keyframes grow { from { transform: scaleY(0); } }`}</style>
                  {hover && (
                    <div
                      className="absolute bottom-full mb-1 -translate-x-1/2 bg-ink text-bg
                        px-2.5 py-1 rounded-md text-caption tnum whitespace-nowrap pointer-events-none"
                      style={{ left: `${((hover.x + 0.5) / shown.length) * 100}%` }}
                      role="status"
                    >
                      {String(hover.hour).padStart(2, "0")}:00 — {hover.count} call{hover.count === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <div className="flex gap-[2px] mt-1.5">
                  {shown.map((h) => (
                    <div key={h.hour} className="flex-1 text-center text-caption text-ink-3 tnum">
                      {h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
                    </div>
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="text-body-sm text-ink-2 cursor-pointer select-none">
                    View as table
                  </summary>
                  <table className="mt-2 text-body-sm tnum">
                    <thead>
                      <tr>
                        <th className="text-left pr-6 py-1 overline">Hour</th>
                        <th className="text-right py-1 overline">Calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown
                        .filter((h) => h.count > 0)
                        .map((h) => (
                          <tr key={h.hour} className="border-t border-line/60">
                            <td className="pr-6 py-1">{String(h.hour).padStart(2, "0")}:00</td>
                            <td className="text-right py-1">{h.count}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </CardBody>
        </Card>

        <p className="text-caption text-ink-3">
          Read-only. Every number is counted from your clinic&apos;s own call records.
        </p>
      </div>
    </AppShell>
  );
}
