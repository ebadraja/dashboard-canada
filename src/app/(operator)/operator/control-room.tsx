"use client";

// The control room (Doc 3): every dial, every clinic, every bill, and the
// real profit — the only place both sides of money meet. Onboarding a
// clinic is a form, never code.

import { useCallback, useEffect, useState } from "react";

type Health = {
  clinicId: string; name: string; status: string; vaAvailable: boolean;
  waiting: number; timedOutToday: number; callsToday: number; lastCallAt: string | null;
};
type UserRow = {
  id: string; name: string; email: string; role: string; active: boolean;
  clinicId: string | null; clinic: { name: string } | null;
};
type MoneyRow = {
  clinicId: string; name: string; status: string; planName: string | null; currency: string;
  calls: number; bookings: number; cancellations: number; reschedules: number;
  callbackRate: number | null; revenueCents: number; paidCents: number; costCents: number; marginCents: number;
};
type InvoiceRow = {
  id: string; clinicId: string; periodStart: string; amountCents: number; currency: string;
  status: string; clinic: { name: string };
  lineItems: { label: string; amountCents: number }[];
};
type CostRow = { id: string; clinicId: string; month: string; label: string; amountCents: number; clinic: { name: string } };

const money = (cents: number, cur = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: cur }).format(cents / 100);
const thisMonth = () => new Date().toISOString().slice(0, 7);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export default function ControlRoom({ operatorName }: { operatorName: string }) {
  const [health, setHealth] = useState<Health[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [month, setMonth] = useState(thisMonth());
  const [moneyRows, setMoneyRows] = useState<MoneyRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const refresh = useCallback(async (m: string) => {
    const [h, u, a, inv, c] = await Promise.all([
      api("/api/operator/health"),
      api("/api/operator/users"),
      api(`/api/operator/analytics?month=${m}`),
      api("/api/operator/invoices"),
      api(`/api/operator/costs?month=${m}`),
    ]);
    setHealth(h as Health[]);
    setUsers(u as UserRow[]);
    setMoneyRows((a as { clinics: MoneyRow[] }).clinics);
    setInvoices(inv as InvoiceRow[]);
    setCosts(c as CostRow[]);
  }, []);

  useEffect(() => {
    refresh(month).catch((e) => setFlash(String(e)));
    const t = setInterval(() => refresh(month).catch(() => {}), 15_000); // health auto-refresh
    return () => clearInterval(t);
  }, [month, refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setFlash(null);
    } catch (e) {
      setFlash((e as Error).message);
    }
    refresh(month).catch(() => {});
  };

  return (
    <div style={S.page}>
      <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.3rem" }}>Control room — {operatorName}</h1>
      <p style={{ opacity: 0.6, margin: "0 0 1rem" }}>Clinics · users · health · billing · margin. Only you can open this.</p>
      {flash && <div style={S.flash} onClick={() => setFlash(null)}>⚠ {flash} (tap to dismiss)</div>}
      {newKey && (
        <div style={{ ...S.flash, background: "#27ae60" }} onClick={() => setNewKey(null)}>
          New clinic AI key (copy NOW, shown once): <code>{newKey}</code>
        </div>
      )}

      {/* ---- system health ---- */}
      <Section title="System health (live, refreshes every 15s)">
        <table style={S.table}>
          <thead><tr><Th>Clinic</Th><Th>Status</Th><Th>VA</Th><Th>Waiting</Th><Th>Timed out today</Th><Th>Calls today</Th><Th>Last call</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.clinicId}>
                <Td>{h.name}</Td>
                <Td><Badge color={h.status === "live" ? "#27ae60" : h.status === "paused" ? "#c0392b" : "#e67e22"}>{h.status}</Badge></Td>
                <Td>{h.vaAvailable ? "available" : "busy"}</Td>
                <Td style={{ color: h.waiting > 0 ? "#e67e22" : undefined }}>{h.waiting}</Td>
                <Td style={{ color: h.timedOutToday > 2 ? "#e74c3c" : undefined }}>{h.timedOutToday}</Td>
                <Td>{h.callsToday}</Td>
                <Td>{h.lastCallAt ? new Date(h.lastCallAt).toLocaleTimeString() : "—"}</Td>
                <Td>
                  {h.status !== "live" && <Btn onClick={() => act(() => api(`/api/operator/clinics/${h.clinicId}`, { method: "PATCH", body: JSON.stringify({ status: "live" }) }))}>Go live</Btn>}
                  {h.status === "live" && <Btn onClick={() => act(() => api(`/api/operator/clinics/${h.clinicId}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) }))}>Pause</Btn>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ---- add clinic ---- */}
      <Section title="Add a clinic (a form, never code)">
        <form
          style={S.formRow}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            act(async () => {
              const r = (await api("/api/operator/clinics", {
                method: "POST",
                body: JSON.stringify({
                  name: f.get("name"),
                  timezone: f.get("timezone"),
                  planName: f.get("planName") || undefined,
                  monthlyPriceCents: f.get("price") ? Math.round(Number(f.get("price")) * 100) : undefined,
                  slotTemplate: String(f.get("slots") || "")
                    .split(",").map((s) => s.trim()).filter(Boolean)
                    .map((time) => ({
                      block: time < "12:00" ? "morning" : time < "17:00" ? "afternoon" : "evening",
                      time,
                    })),
                }),
              })) as { apiKey: string };
              setNewKey(r.apiKey);
              form.reset();
            });
          }}
        >
          <input name="name" placeholder="Clinic name" required style={S.input} />
          <input name="timezone" placeholder="Timezone (America/Toronto)" defaultValue="America/Toronto" required style={S.input} />
          <input name="planName" placeholder="Plan (Standard)" style={S.input} />
          <input name="price" type="number" step="0.01" placeholder="Price / month (2200)" style={S.input} />
          <input name="slots" placeholder="Slots: 09:00, 09:30, 13:00, 17:00" style={{ ...S.input, minWidth: 260 }} />
          <Btn primary type="submit">Create clinic</Btn>
        </form>
      </Section>

      {/* ---- users ---- */}
      <Section title="Users across clinics">
        <table style={S.table}>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Clinic</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.45 }}>
                <Td>{u.name}</Td><Td>{u.email}</Td><Td>{u.role}</Td>
                <Td>{u.clinic?.name ?? "—"}</Td>
                <Td>{u.active ? "active" : "disabled"}</Td>
                <Td>
                  <Btn onClick={() => act(() => api(`/api/operator/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) }))}>
                    {u.active ? "Disable" : "Enable"}
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          style={{ ...S.formRow, marginTop: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            act(async () => {
              await api("/api/operator/users", {
                method: "POST",
                body: JSON.stringify({
                  name: f.get("name"), email: f.get("email"), password: f.get("password"),
                  role: f.get("role"),
                  clinicId: f.get("role") === "operator" ? undefined : f.get("clinicId") || undefined,
                }),
              });
              form.reset();
            });
          }}
        >
          <input name="name" placeholder="Name" required style={S.input} />
          <input name="email" type="email" placeholder="Email" required style={S.input} />
          <input name="password" placeholder="Password (10+ chars)" required minLength={10} style={S.input} />
          <select name="role" required style={S.input}>
            <option value="va">va</option><option value="doctor">doctor</option><option value="operator">operator</option>
          </select>
          <select name="clinicId" style={S.input}>
            <option value="">— clinic —</option>
            {health.map((h) => <option key={h.clinicId} value={h.clinicId}>{h.name}</option>)}
          </select>
          <Btn primary type="submit">Create user</Btn>
        </form>
      </Section>

      {/* ---- money ---- */}
      <Section
        title="The two sides of money — only you see this"
        right={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={S.input} />}
      >
        <table style={S.table}>
          <thead><tr><Th>Clinic</Th><Th>Calls</Th><Th>Bookings</Th><Th>Cxl/Move</Th><Th>Callback %</Th><Th>Revenue (plan)</Th><Th>Collected</Th><Th>Cost</Th><Th>Margin</Th></tr></thead>
          <tbody>
            {moneyRows.map((m) => (
              <tr key={m.clinicId}>
                <Td>{m.name}</Td><Td>{m.calls}</Td><Td>{m.bookings}</Td>
                <Td>{m.cancellations + m.reschedules}</Td>
                <Td>{m.callbackRate === null ? "—" : `${Math.round(m.callbackRate * 100)}%`}</Td>
                <Td>{money(m.revenueCents, m.currency)}</Td>
                <Td>{money(m.paidCents, m.currency)}</Td>
                <Td>{money(m.costCents, m.currency)}</Td>
                <Td style={{ color: m.marginCents >= 0 ? "#27ae60" : "#e74c3c", fontWeight: 700 }}>
                  {money(m.marginCents, m.currency)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={S.h3}>Record a cost for {month}</h3>
        <form
          style={S.formRow}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            act(async () => {
              await api("/api/operator/costs", {
                method: "POST",
                body: JSON.stringify({
                  clinicId: f.get("clinicId"), month,
                  label: f.get("label"), amountCents: Math.round(Number(f.get("amount")) * 100),
                }),
              });
              form.reset();
            });
          }}
        >
          <select name="clinicId" required style={S.input}>
            <option value="">— clinic —</option>
            {health.map((h) => <option key={h.clinicId} value={h.clinicId}>{h.name}</option>)}
          </select>
          <input name="label" placeholder="Label (VA pay, AI minutes, hosting)" required style={{ ...S.input, minWidth: 220 }} />
          <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required style={S.input} />
          <Btn primary type="submit">Record cost</Btn>
        </form>
        {costs.length > 0 && (
          <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>
            {month} costs: {costs.map((c) => `${c.clinic.name} — ${c.label} ${money(c.amountCents)}`).join(" · ")}
          </p>
        )}

        <h3 style={S.h3}>Invoices</h3>
        <div style={S.formRow}>
          {health.map((h) => (
            <Btn key={h.clinicId} onClick={() => act(() => api("/api/operator/invoices", { method: "POST", body: JSON.stringify({ clinicId: h.clinicId, month }) }))}>
              Generate {month} — {h.name}
            </Btn>
          ))}
        </div>
        <table style={S.table}>
          <thead><tr><Th>Clinic</Th><Th>Period</Th><Th>Amount</Th><Th>Status</Th><Th>Lines</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <Td>{inv.clinic.name}</Td>
                <Td>{String(inv.periodStart).slice(0, 7)}</Td>
                <Td>{money(inv.amountCents, inv.currency)}</Td>
                <Td><Badge color={inv.status === "paid" ? "#27ae60" : inv.status === "sent" ? "#2980b9" : inv.status === "overdue" ? "#e74c3c" : "#7f8c8d"}>{inv.status}</Badge></Td>
                <Td style={{ fontSize: "0.8rem", opacity: 0.7 }}>{inv.lineItems.map((l) => l.label).join(" · ")}</Td>
                <Td>
                  {inv.status === "draft" && <Btn onClick={() => act(() => api(`/api/operator/invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) }))}>Mark sent</Btn>}
                  {(inv.status === "sent" || inv.status === "overdue") && <Btn onClick={() => act(() => api(`/api/operator/invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) }))}>Mark paid</Btn>}
                  {inv.status === "sent" && <Btn onClick={() => act(() => api(`/api/operator/invoices/${inv.id}`, { method: "PATCH", body: JSON.stringify({ status: "overdue" }) }))}>Overdue</Btn>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={S.section}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{title}</h2>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
      {children}
    </section>
  );
}
function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: "0.35rem 0.7rem", color: "#8a91a3", fontWeight: 600, fontSize: "0.8rem", borderBottom: "1px solid #323848" }}>{children}</th>;
}
function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "0.45rem 0.7rem", borderBottom: "1px solid #2a3040", ...style }}>{children}</td>;
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ background: color, color: "white", padding: "0.1rem 0.55rem", borderRadius: 999, fontSize: "0.78rem" }}>{children}</span>;
}
function Btn({ children, onClick, primary, type }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; type?: "submit" | "button" }) {
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      style={{
        background: primary ? "#2980b9" : "#2e3440", color: "#eceff4",
        border: primary ? "none" : "1px solid #4c566a", borderRadius: 8,
        padding: "0.45rem 0.8rem", cursor: "pointer", fontSize: "0.88rem", marginRight: "0.35rem",
      }}
    >
      {children}
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#1b1f2a", color: "#eceff4", padding: "1.25rem", fontSize: "0.95rem" },
  section: { background: "#232837", borderRadius: 10, padding: "1rem", marginBottom: "1rem", overflowX: "auto" },
  table: { borderCollapse: "collapse", width: "100%" },
  formRow: { display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" },
  input: { background: "#2e3440", color: "#eceff4", border: "1px solid #4c566a", borderRadius: 8, padding: "0.45rem 0.7rem", fontSize: "0.9rem" },
  flash: { background: "#c0392b", color: "white", padding: "0.6rem 1rem", borderRadius: 8, marginBottom: "1rem", cursor: "pointer", wordBreak: "break-all" },
  h3: { margin: "1rem 0 0.5rem", fontSize: "0.95rem", opacity: 0.8 },
};
