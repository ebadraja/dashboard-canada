"use client";

// Overview (DESIGN.md §5.4): live health per clinic + this month's margin
// summary. Auto-refreshes every 15s.

import { PauseCircle, PlayCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { useToast } from "@/components/ui/toast";
import { api, money, thisMonth, type Health } from "./lib";

type MoneyRow = {
  clinicId: string;
  name: string;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  currency: string;
};

export default function Overview() {
  const toast = useToast();
  const [health, setHealth] = useState<Health[] | null>(null);
  const [moneyRows, setMoneyRows] = useState<MoneyRow[]>([]);

  const refresh = useCallback(async () => {
    const [h, a] = await Promise.all([
      api("/api/operator/health"),
      api(`/api/operator/analytics?month=${thisMonth()}`),
    ]);
    setHealth(h as Health[]);
    setMoneyRows((a as { clinics: MoneyRow[] }).clinics);
  }, []);

  useEffect(() => {
    refresh().catch((e) => toast("error", (e as Error).message));
    const t = setInterval(() => refresh().catch(() => {}), 15_000);
    return () => clearInterval(t);
  }, [refresh, toast]);

  const setStatus = (clinicId: string, status: "live" | "paused") =>
    api(`/api/operator/clinics/${clinicId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
      .then(() => refresh())
      .catch((e) => toast("error", (e as Error).message));

  const totals = moneyRows.reduce(
    (acc, r) => ({
      rev: acc.rev + r.revenueCents,
      cost: acc.cost + r.costCents,
      margin: acc.margin + r.marginCents,
    }),
    { rev: 0, cost: 0, margin: 0 },
  );

  if (!health) return <SkeletonTiles count={3} />;

  return (
    <>
      {/* month money summary */}
      <Card>
        <CardHeader title="This month across all clinics" subtitle={thisMonth()} />
        <div className="grid grid-cols-3 divide-x divide-line/60">
          <StatTile value={money(totals.rev)} label="Revenue (plans)" />
          <StatTile value={money(totals.cost)} label="Cost" />
          <StatTile value={money(totals.margin)} label="Margin" />
        </div>
      </Card>

      {/* per-clinic health */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {health.map((h) => (
          <Card key={h.clinicId}>
            <CardHeader
              title={h.name}
              right={
                <Badge tone={h.status === "live" ? "success" : h.status === "paused" ? "danger" : "warning"}>
                  {h.status}
                </Badge>
              }
            />
            <CardBody className="grid gap-2">
              <dl className="grid grid-cols-2 gap-y-1.5 text-body-sm">
                <dt className="text-ink-3">VA</dt>
                <dd className={h.vaAvailable ? "text-success" : "text-danger"}>
                  {h.vaAvailable ? "available" : "busy"}
                </dd>
                <dt className="text-ink-3">Waiting now</dt>
                <dd className={`tnum ${h.waiting > 0 ? "text-warning font-medium" : ""}`}>{h.waiting}</dd>
                <dt className="text-ink-3">Timed out today</dt>
                <dd className={`tnum ${h.timedOutToday > 2 ? "text-danger font-medium" : ""}`}>{h.timedOutToday}</dd>
                <dt className="text-ink-3">Calls today</dt>
                <dd className="tnum">{h.callsToday}</dd>
                <dt className="text-ink-3">Last call</dt>
                <dd className="tnum">
                  {h.lastCallAt ? new Date(h.lastCallAt).toLocaleTimeString() : "—"}
                </dd>
              </dl>
              <div className="pt-1">
                {h.status === "live" ? (
                  <Button size="sm" icon={<PauseCircle className="size-3.5" />} onClick={() => setStatus(h.clinicId, "paused")}>
                    Pause
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" icon={<PlayCircle className="size-3.5" />} onClick={() => setStatus(h.clinicId, "live")}>
                    Go live
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
