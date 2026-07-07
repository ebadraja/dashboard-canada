"use client";

// The clinic's report card (Doc 2): outcomes only, nothing technical,
// strictly read-only. Stat tiles for the headline numbers; one single-series
// bar chart for busiest times (hue validated for both surfaces); a table
// view of the same data for accessibility.

import { useCallback, useEffect, useState } from "react";

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

export default function Dashboard() {
  const [from, setFrom] = useState(iso(daysAgo(29)));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ hour: number; count: number; x: number } | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setError(null);
    const res = await fetch(`/api/doctor/metrics?from=${f}&to=${t}`);
    const body = await res.json();
    if (!res.ok) setError(body.error ?? `HTTP ${res.status}`);
    else setData(body as Metrics);
  }, []);

  useEffect(() => {
    load(from, to).catch((e) => setError(String(e)));
  }, [from, to, load]);

  const preset = (days: number) => {
    setFrom(iso(daysAgo(days - 1)));
    setTo(iso(new Date()));
  };

  // Trim leading/trailing empty hours, keep a sensible 8:00–20:00 minimum.
  const hours = data?.busiestHours ?? [];
  const active = hours.filter((h) => h.count > 0).map((h) => h.hour);
  const lo = Math.min(8, ...(active.length ? [Math.min(...active)] : [8]));
  const hi = Math.max(20, ...(active.length ? [Math.max(...active)] : [20]));
  const shown = hours.slice(lo, hi + 1);
  const max = Math.max(1, ...shown.map((h) => h.count));
  const peak = shown.reduce((a, b) => (b.count > a.count ? b : a), shown[0] ?? { hour: 0, count: 0 });

  return (
    <div className="doc-root">
      <style>{`
        .doc-root {
          --surface: #fcfcfb; --panel: #f1f1ee;
          --ink: #0b0b0b; --ink-2: #52514e; --ink-3: #8a887f;
          --bar: #2a78d6; --grid: #e3e2dd;
          min-height: 100vh; background: var(--surface); color: var(--ink);
          padding: 1.25rem; font-size: 1rem;
        }
        @media (prefers-color-scheme: dark) {
          .doc-root {
            --surface: #1b1f2a; --panel: #232837;
            --ink: #eceff4; --ink-2: #c3c2b7; --ink-3: #8a91a3;
            --bar: #3987e5; --grid: #323848;
          }
        }
        .doc-root .filters { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
        .doc-root .filters input, .doc-root .filters button {
          background: var(--panel); color: var(--ink); border: 1px solid var(--grid);
          border-radius: 8px; padding: .45rem .7rem; font-size: .95rem; cursor: pointer;
        }
        .doc-root .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
        .doc-root .tile { background: var(--panel); border-radius: 10px; padding: .9rem 1rem; }
        .doc-root .tile .v { font-size: 1.9rem; font-weight: 700; line-height: 1.2; }
        .doc-root .tile .l { color: var(--ink-2); font-size: .85rem; margin-top: .15rem; }
        .doc-root .panel { background: var(--panel); border-radius: 10px; padding: 1rem; max-width: 900px; }
        .doc-root table { border-collapse: collapse; margin-top: .5rem; }
        .doc-root td, .doc-root th { padding: .25rem .8rem; text-align: right; border-bottom: 1px solid var(--grid); color: var(--ink-2); }
      `}</style>

      <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.3rem" }}>
        {data?.clinicName ?? "…"} — reception report
      </h1>
      <p style={{ color: "var(--ink-2)", margin: "0 0 1rem" }}>
        How your phone line performed. Read-only.
      </p>

      <div className="filters">
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span style={{ color: "var(--ink-3)" }}>to</span>
        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <button onClick={() => preset(7)}>Last 7 days</button>
        <button onClick={() => preset(30)}>Last 30 days</button>
        <button onClick={() => preset(90)}>Last 90 days</button>
      </div>

      {error && <p style={{ color: "#e34948" }}>⚠ {error}</p>}

      {data && (
        <>
          <div className="tiles">
            <Tile v={data.callsHandled} l="Calls handled" />
            <Tile v={data.bookingsMade} l="Bookings made" />
            <Tile v={data.cancellations + data.reschedules} l={`Cancellations & reschedules (${data.cancellations} + ${data.reschedules})`} />
            <Tile v={data.callbackRate === null ? "—" : `${Math.round(data.callbackRate * 100)}%`} l="Missed / callback rate" />
            <Tile v={data.avgResponseSeconds === null ? "—" : `${data.avgResponseSeconds}s`} l="Average response time" />
          </div>

          <div className="panel">
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem" }}>Busiest times (calls per hour)</h2>
            <div
              style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 160, position: "relative" }}
              onMouseLeave={() => setHover(null)}
            >
              {shown.map((h, i) => (
                <div
                  key={h.hour}
                  onMouseEnter={() => setHover({ ...h, x: i })}
                  style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", cursor: "default" }}
                >
                  {h.hour === peak.hour && h.count > 0 && (
                    <div style={{ textAlign: "center", fontSize: ".75rem", color: "var(--ink-2)", marginBottom: 2 }}>{h.count}</div>
                  )}
                  <div
                    style={{
                      height: `${Math.max(h.count === 0 ? 0 : 6, (h.count / max) * 130)}px`,
                      background: "var(--bar)",
                      borderRadius: "4px 4px 0 0",
                      opacity: hover && hover.hour !== h.hour ? 0.55 : 1,
                    }}
                  />
                </div>
              ))}
              {hover && (
                <div
                  style={{
                    position: "absolute", bottom: "100%", left: `${((hover.x + 0.5) / shown.length) * 100}%`,
                    transform: "translateX(-50%)", background: "var(--ink)", color: "var(--surface)",
                    padding: ".25rem .6rem", borderRadius: 6, fontSize: ".8rem", whiteSpace: "nowrap", pointerEvents: "none",
                  }}
                >
                  {String(hover.hour).padStart(2, "0")}:00 — {hover.count} call{hover.count === 1 ? "" : "s"}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
              {shown.map((h) => (
                <div key={h.hour} style={{ flex: 1, textAlign: "center", fontSize: ".7rem", color: "var(--ink-3)" }}>
                  {h.hour % 3 === 0 ? `${String(h.hour).padStart(2, "0")}` : ""}
                </div>
              ))}
            </div>
            <details style={{ marginTop: ".75rem" }}>
              <summary style={{ color: "var(--ink-2)", cursor: "pointer" }}>View as table</summary>
              <table>
                <thead><tr><th>Hour</th><th>Calls</th></tr></thead>
                <tbody>
                  {shown.filter((h) => h.count > 0).map((h) => (
                    <tr key={h.hour}><td>{String(h.hour).padStart(2, "0")}:00</td><td>{h.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ v, l }: { v: number | string; l: string }) {
  return (
    <div className="tile">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
