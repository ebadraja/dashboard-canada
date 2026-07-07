"use client";

import { useEffect, useRef, useState } from "react";

// Stat tile (DESIGN.md §4/§5.3): 28px semibold value with a one-time count-up,
// quiet muted label. Non-numeric values render as-is.
export function StatTile({
  value,
  label,
  hint,
}: {
  value: number | string;
  label: string;
  hint?: string;
}) {
  const numeric = typeof value === "number";
  const [shown, setShown] = useState<number>(numeric ? 0 : 0);
  const done = useRef(false);

  useEffect(() => {
    if (!numeric || done.current) return;
    done.current = true;
    const target = value as number;
    if (
      target === 0 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(target);
      return;
    }
    const t0 = performance.now();
    const dur = 400;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setShown(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [numeric, value]);

  return (
    <div className="px-4 py-3">
      <div className="text-display font-semibold leading-9 tnum">
        {numeric ? shown : value}
      </div>
      <div className="text-body-sm text-ink-3 mt-0.5">{label}</div>
      {hint && <div className="text-caption text-ink-3 mt-0.5">{hint}</div>}
    </div>
  );
}
