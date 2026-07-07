"use client";

// Clinics (DESIGN.md §5.4): onboarding is data entry, never code. The slot
// template is picked on a visual chip grid — no comma-separated typing.

import { Copy, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, type Clinic } from "./../lib";

// Candidate menu: every half hour 08:00–19:30; block by time of day.
const CANDIDATES = Array.from({ length: 24 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const time = `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  const block = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return { time, block } as { time: string; block: "morning" | "afternoon" | "evening" };
});

export default function ClinicsPage() {
  const toast = useToast();
  const [clinics, setClinics] = useState<Clinic[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setClinics((await api("/api/operator/clinics")) as Clinic[]);
  }, []);

  useEffect(() => {
    refresh().catch((e) => toast("error", (e as Error).message));
  }, [refresh, toast]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = (await api("/api/operator/clinics", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          timezone: f.get("timezone"),
          planName: f.get("planName") || undefined,
          monthlyPriceCents: f.get("price")
            ? Math.round(Number(f.get("price")) * 100)
            : undefined,
          slotTemplate: CANDIDATES.filter((c) => picked.has(c.time)),
        }),
      })) as { apiKey: string };
      setCreating(false);
      setPicked(new Set());
      setIssuedKey(r.apiKey);
      refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Clinics"
          subtitle="Onboarding a clinic is a form, never code."
          right={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Add clinic
            </Button>
          }
        />
        <CardBody>
          {!clinics ? (
            <SkeletonRows />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Timezone</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <tbody>
                {clinics.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="text-ink-2">{c.timezone}</Td>
                    <Td>
                      <Badge tone={c.status === "live" ? "success" : c.status === "paused" ? "danger" : "warning"}>
                        {c.status}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Add a clinic" width={560}>
        <form onSubmit={create} className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input name="name" label="Clinic name" placeholder="Lakeside Eye Clinic" required />
            <Input name="timezone" label="Timezone (IANA)" defaultValue="America/Toronto" required />
            <Input name="planName" label="Plan" placeholder="Standard" />
            <Input name="price" label="Price / month (CAD)" type="number" step="0.01" placeholder="2200" />
          </div>

          <div>
            <p className="text-body-sm font-medium text-ink-2 mb-1.5">
              Slot template <span className="text-ink-3 font-normal">— tap every time this clinic could ever offer</span>
            </p>
            {(["morning", "afternoon", "evening"] as const).map((block) => (
              <div key={block} className="mb-2">
                <p className="overline mb-1">{block}</p>
                <div className="flex flex-wrap gap-1.5">
                  {CANDIDATES.filter((c) => c.block === block).map((c) => {
                    const on = picked.has(c.time);
                    return (
                      <button
                        type="button"
                        key={c.time}
                        aria-pressed={on}
                        onClick={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.time)) next.delete(c.time);
                            else next.add(c.time);
                            return next;
                          })
                        }
                        className={`h-8 px-2.5 rounded-lg text-body-sm font-medium tnum border
                          transition-all duration-120 active:scale-95
                          ${on ? "bg-accent text-on-accent border-transparent" : "bg-surface text-ink-2 border-line hover:border-ink-3"}`}
                      >
                        {c.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Create clinic</Button>
          </div>
        </form>
      </Modal>

      {/* one-time key modal */}
      <Modal open={!!issuedKey} onClose={() => setIssuedKey(null)} title="Clinic created — AI phone key" width={560}>
        <p className="text-body-sm text-ink-2 mb-3">
          This key authenticates the AI phone system for this clinic. It is shown
          <b> once</b> — copy it into the voice platform now.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-body-sm break-all">
            {issuedKey}
          </code>
          <Button
            icon={<Copy className="size-4" />}
            onClick={() => {
              navigator.clipboard.writeText(issuedKey ?? "");
              toast("success", "Key copied.");
            }}
          >
            Copy
          </Button>
        </div>
      </Modal>
    </>
  );
}
