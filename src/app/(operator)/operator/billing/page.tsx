"use client";

// Billing (DESIGN.md §5.4 / Doc 3 §3): derived, not typed. The money table
// is the only place revenue and cost meet; margin is colored by sign.

import { FilePlus2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, money, thisMonth, type Clinic } from "./../lib";

type MoneyRow = {
  clinicId: string; name: string; status: string; planName: string | null; currency: string;
  calls: number; bookings: number; cancellations: number; reschedules: number;
  callbackRate: number | null;
  revenueCents: number; paidCents: number; costCents: number; marginCents: number;
};
type InvoiceRow = {
  id: string; clinicId: string; periodStart: string; amountCents: number; currency: string;
  status: "draft" | "sent" | "paid" | "overdue";
  clinic: { name: string };
  lineItems: { label: string; amountCents: number }[];
};
type CostRow = {
  id: string; month: string; label: string; amountCents: number; clinic: { name: string };
};

const STATUS_TONE = {
  draft: "neutral",
  sent: "accent",
  paid: "success",
  overdue: "danger",
} as const;

export default function BillingPage() {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<MoneyRow[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (m: string) => {
    const [a, inv, c, cl] = await Promise.all([
      api(`/api/operator/analytics?month=${m}`),
      api("/api/operator/invoices"),
      api(`/api/operator/costs?month=${m}`),
      api("/api/operator/clinics"),
    ]);
    setRows((a as { clinics: MoneyRow[] }).clinics);
    setInvoices(inv as InvoiceRow[]);
    setCosts(c as CostRow[]);
    setClinics(cl as Clinic[]);
  }, []);

  useEffect(() => {
    refresh(month).catch((e) => toast("error", (e as Error).message));
  }, [month, refresh, toast]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast("success", ok);
      await refresh(month);
    } catch (e) {
      toast("error", (e as Error).message);
    }
    setBusy(false);
  };

  const addCost = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    act(
      () =>
        api("/api/operator/costs", {
          method: "POST",
          body: JSON.stringify({
            clinicId: f.get("clinicId"),
            month,
            label: f.get("label"),
            amountCents: Math.round(Number(f.get("amount")) * 100),
          }),
        }).then(() => form.reset()),
      "Cost recorded.",
    );
  };

  return (
    <>
      {/* money table */}
      <Card>
        <CardHeader
          title="The two sides of money"
          subtitle="Revenue vs cost vs margin — only your login can see this."
          right={
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 px-2 rounded-lg bg-surface border border-line text-body-sm
                focus:border-accent focus:outline-none"
              aria-label="Month"
            />
          }
        />
        <CardBody>
          {!rows ? (
            <SkeletonRows />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Clinic</Th><Th>Calls</Th><Th>Bookings</Th><Th>Cxl / Move</Th>
                  <Th>Callback</Th><Th>Revenue</Th><Th>Collected</Th><Th>Cost</Th><Th>Margin</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.clinicId}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="tnum">{r.calls}</Td>
                    <Td className="tnum">{r.bookings}</Td>
                    <Td className="tnum">{r.cancellations + r.reschedules}</Td>
                    <Td className="tnum">{r.callbackRate === null ? "—" : `${Math.round(r.callbackRate * 100)}%`}</Td>
                    <Td className="tnum">{money(r.revenueCents, r.currency)}</Td>
                    <Td className="tnum">{money(r.paidCents, r.currency)}</Td>
                    <Td className="tnum">{money(r.costCents, r.currency)}</Td>
                    <Td className={`tnum font-semibold ${r.marginCents >= 0 ? "text-success" : "text-danger"}`}>
                      {money(r.marginCents, r.currency)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* costs */}
      <Card>
        <CardHeader title={`Costs — ${month}`} subtitle="VA pay, AI/voice usage, messaging, hosting." />
        <CardBody>
          <form onSubmit={addCost} className="grid sm:grid-cols-[1fr_1.4fr_120px_auto] gap-2 items-end mb-3">
            <Select name="clinicId" label="Clinic" required>
              <option value="">—</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input name="label" label="Label" placeholder="VA pay" required />
            <Input name="amount" label="Amount" type="number" step="0.01" min="0.01" required />
            <Button type="submit" variant="primary" loading={busy}>Record</Button>
          </form>
          {costs.length > 0 ? (
            <ul className="grid gap-1 text-body-sm text-ink-2">
              {costs.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="text-ink-3">{c.clinic.name}</span>
                  <span>{c.label}</span>
                  <span className="ml-auto tnum">{money(c.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-3">No costs recorded for {month} yet.</p>
          )}
        </CardBody>
      </Card>

      {/* invoices */}
      <Card>
        <CardHeader
          title="Invoices"
          subtitle="Generated from plan + usage. Draft → sent → paid (or overdue)."
        />
        <CardBody>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {clinics.map((c) => (
              <Button
                key={c.id}
                size="sm"
                icon={<FilePlus2 className="size-3.5" />}
                loading={busy}
                onClick={() =>
                  act(
                    () =>
                      api("/api/operator/invoices", {
                        method: "POST",
                        body: JSON.stringify({ clinicId: c.id, month }),
                      }),
                    `Invoice generated for ${c.name}.`,
                  )
                }
              >
                Generate {month} — {c.name}
              </Button>
            ))}
          </div>
          <Table>
            <THead>
              <tr>
                <Th>Clinic</Th><Th>Period</Th><Th>Amount</Th><Th>Status</Th><Th>Lines</Th><Th />
              </tr>
            </THead>
            <tbody>
              {invoices.map((inv) => (
                <Tr key={inv.id}>
                  <Td className="font-medium">{inv.clinic.name}</Td>
                  <Td className="tnum">{String(inv.periodStart).slice(0, 7)}</Td>
                  <Td className="tnum">{money(inv.amountCents, inv.currency)}</Td>
                  <Td><Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge></Td>
                  <Td className="text-caption text-ink-3 max-w-72">
                    {inv.lineItems.map((l) => l.label).join(" · ")}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {inv.status === "draft" && (
                      <Button size="sm" onClick={() => act(() => api(`/api/operator/invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) }), "Marked sent.")}>
                        Mark sent
                      </Button>
                    )}
                    {(inv.status === "sent" || inv.status === "overdue") && (
                      <Button size="sm" variant="success" onClick={() => act(() => api(`/api/operator/invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) }), "Marked paid.")}>
                        Mark paid
                      </Button>
                    )}
                    {inv.status === "sent" && (
                      <Button size="sm" className="ml-1" onClick={() => act(() => api(`/api/operator/invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "overdue" }) }), "Marked overdue.")}>
                        Overdue
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </>
  );
}
