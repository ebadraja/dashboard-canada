"use client";

// The rail (Doc 1, redesigned per DESIGN.md §5.2): a calm kitchen display.
// Loud where it matters (new-card ding, big CONFIRM tap targets), quiet
// everywhere else. The VA only taps real things (Golden Rule 1).

import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  CalendarCheck2,
  CalendarX2,
  ArrowLeftRight,
  Search,
  Clock3,
  PhoneCall,
  Volume2,
  Inbox,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type TaskCard = {
  id: string;
  callId: string;
  type: "availability" | "book" | "find" | "cancel" | "move" | "callback";
  state: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type BoardSlot = {
  block: "morning" | "afternoon" | "evening";
  time: string;
  state: "open" | "taken" | "held" | null;
  source: string | null;
};

type FoundAppt = {
  id: string;
  patientName: string;
  date: string;
  time: string;
  type: string;
  status: string;
};

const today = () => new Date().toISOString().slice(0, 10);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

// Type → visual identity (edge color, icon, label).
const TYPE_META: Record<
  TaskCard["type"],
  { edge: string; icon: ReactNode; label: string }
> = {
  book: { edge: "bg-accent", icon: <CalendarCheck2 className="size-4" />, label: "Booking" },
  cancel: { edge: "bg-danger", icon: <CalendarX2 className="size-4" />, label: "Cancellation" },
  move: { edge: "bg-violet", icon: <ArrowLeftRight className="size-4" />, label: "Reschedule" },
  find: { edge: "bg-accent", icon: <Search className="size-4" />, label: "Find patient" },
  availability: { edge: "bg-ink-3", icon: <Clock3 className="size-4" />, label: "Availability" },
  callback: { edge: "bg-warning", icon: <PhoneCall className="size-4" />, label: "Callback" },
};

export default function Rail({ vaName }: { vaName: string }) {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [status, setStatus] = useState({ available: true, waiting: 0 });
  const [connected, setConnected] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [boardDate, setBoardDate] = useState(today());
  const [board, setBoard] = useState<{ loaded: boolean; slots: BoardSlot[] } | null>(null);
  const [boardPick, setBoardPick] = useState<Set<string>>(new Set());
  const [savingBoard, setSavingBoard] = useState(false);
  const [, setTick] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);

  // --- sound (needs one user gesture — DESIGN.md §5.0) ----------------------
  const ding = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain).connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, []);

  const enableSound = useCallback(() => {
    try {
      audioRef.current ??= new AudioContext();
      audioRef.current.resume();
      setSoundOn(true);
      localStorage.setItem("railSound", "1");
      // Confirmation blip so the VA knows it worked.
      setTimeout(ding, 50);
    } catch {
      toast("error", "This browser blocked audio.");
    }
  }, [ding, toast]);

  useEffect(() => {
    // Re-arm silently on revisit if previously enabled (still needs a gesture
    // in some browsers; the chip stays until the context actually runs).
    if (localStorage.getItem("railSound") === "1") {
      try {
        audioRef.current ??= new AudioContext();
        if (audioRef.current.state === "running") setSoundOn(true);
      } catch {}
    }
  }, []);

  // --- data ------------------------------------------------------------------
  const refreshTasks = useCallback(async () => {
    setTasks((await api("/api/rail/tasks")) as TaskCard[]);
  }, []);
  const refreshStatus = useCallback(async () => {
    setStatus((await api("/api/rail/status")) as { available: boolean; waiting: number });
  }, []);
  const refreshBoard = useCallback(async (date: string) => {
    const b = (await api(`/api/rail/board?date=${date}`)) as {
      loaded: boolean;
      slots: BoardSlot[];
    };
    setBoard(b);
    setBoardPick(new Set(b.slots.filter((s) => s.state === "open").map((s) => s.time)));
  }, []);

  useEffect(() => {
    refreshTasks().catch(() => {});
    refreshStatus().catch(() => {});
  }, [refreshTasks, refreshStatus]);

  useEffect(() => {
    refreshBoard(boardDate).catch(() => {});
  }, [boardDate, refreshBoard]);

  // --- live stream -------------------------------------------------------------
  useEffect(() => {
    const es = new EventSource("/api/rail/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("task.created", (e) => {
      const t = JSON.parse((e as MessageEvent).data) as TaskCard;
      setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
      ding();
      refreshStatus().catch(() => {});
    });
    es.addEventListener("task.updated", (e) => {
      const t = JSON.parse((e as MessageEvent).data) as TaskCard;
      setTasks((prev) =>
        ["done", "closed"].includes(t.state)
          ? prev.filter((x) => x.id !== t.id)
          : prev.map((x) => (x.id === t.id ? { ...x, ...t } : x)),
      );
      refreshStatus().catch(() => {});
    });
    es.addEventListener("availability.changed", (e) => {
      const { date } = JSON.parse((e as MessageEvent).data) as { date: string };
      setBoardDate((cur) => {
        if (date === cur) refreshBoard(cur).catch(() => {});
        return cur;
      });
    });
    return () => es.close();
  }, [ding, refreshBoard, refreshStatus]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // --- actions ------------------------------------------------------------------
  const act = useCallback(
    async (fn: () => Promise<unknown>, okMsg?: string) => {
      try {
        await fn();
        if (okMsg) toast("success", okMsg);
      } catch (e) {
        toast("error", (e as Error).message);
      }
      refreshTasks().catch(() => {});
      refreshStatus().catch(() => {});
    },
    [refreshTasks, refreshStatus, toast],
  );

  const answer = (id: string, response: Record<string, unknown>, okMsg?: string) =>
    act(() => api(`/api/rail/tasks/${id}/answer`, { method: "POST", body: JSON.stringify({ response }) }), okMsg);
  const confirm = (id: string) =>
    act(() => api(`/api/rail/tasks/${id}/confirm`, { method: "POST", body: "{}" }), "Confirmed.");
  const reopen = (id: string, close: boolean) =>
    act(() => api(`/api/rail/tasks/${id}/reopen`, { method: "POST", body: JSON.stringify({ close }) }));

  const toggleAvailable = () =>
    act(async () =>
      api("/api/rail/status", { method: "POST", body: JSON.stringify({ available: !status.available }) }),
    );

  const saveBoard = async () => {
    setSavingBoard(true);
    await act(
      () =>
        api("/api/rail/availability/load", {
          method: "POST",
          body: JSON.stringify({ date: boardDate, openTimes: [...boardPick] }),
        }).then(() => refreshBoard(boardDate)),
      "Day saved.",
    );
    setSavingBoard(false);
  };

  return (
    <AppShell
      title="Rail"
      userName={vaName}
      userRole="va"
      live={connected}
      right={
        <div className="flex items-center gap-2">
          {!soundOn && (
            <Button size="sm" variant="secondary" icon={<Volume2 className="size-3.5" />} onClick={enableSound}>
              Enable sound
            </Button>
          )}
          {status.waiting > 0 && (
            <Badge tone="danger" icon={<BellRing className="size-3" />}>
              {status.waiting} waiting
            </Badge>
          )}
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button
              onClick={() => !status.available && toggleAvailable()}
              className={`px-3 h-8 text-body-sm font-medium transition-colors duration-120
                ${status.available ? "bg-success-soft text-success" : "text-ink-3 hover:bg-surface-2"}`}
            >
              Available
            </button>
            <button
              onClick={() => status.available && toggleAvailable()}
              className={`px-3 h-8 text-body-sm font-medium transition-colors duration-120
                ${!status.available ? "bg-danger-soft text-danger" : "text-ink-3 hover:bg-surface-2"}`}
            >
              Busy
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* ------------- the rail ------------- */}
        <section aria-label="Requests" className="grid gap-3 max-w-[720px]">
          <AnimatePresence initial={false}>
            {tasks.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="bg-surface border border-line rounded-xl">
                  <EmptyState
                    icon={<Inbox />}
                    title="No open requests"
                    hint="New requests from the AI will slide in here with a ding."
                  />
                </div>
              </motion.div>
            )}
            {tasks.map((t) => (
              <RailCard
                key={t.id}
                task={t}
                onAnswer={answer}
                onConfirm={confirm}
                onReopen={reopen}
              />
            ))}
          </AnimatePresence>
        </section>

        {/* ------------- slot board ------------- */}
        <aside className="bg-surface border border-line rounded-xl p-4 lg:sticky lg:top-16">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-h3 font-semibold">Slot board</h2>
            <input
              type="date"
              value={boardDate}
              onChange={(e) => setBoardDate(e.target.value)}
              className="ml-auto h-8 px-2 rounded-lg bg-surface border border-line text-body-sm
                focus:border-accent focus:outline-none"
              aria-label="Board date"
            />
            {board && !board.loaded && <Badge tone="warning">not loaded</Badge>}
          </div>

          {board &&
            (["morning", "afternoon", "evening"] as const).map((block) => {
              const slots = board.slots.filter((s) => s.block === block);
              if (slots.length === 0) return null;
              return (
                <div key={block} className="mb-3">
                  <p className="overline mb-1.5">{block}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((s) => (
                      <SlotChip
                        key={s.time}
                        time={s.time}
                        picked={boardPick.has(s.time)}
                        onToggle={() =>
                          setBoardPick((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.time)) next.delete(s.time);
                            else next.add(s.time);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}

          <Button variant="primary" size="lg" className="w-full mt-1" loading={savingBoard} onClick={saveBoard}>
            Save day
          </Button>
          <p className="text-caption text-ink-3 mt-2 leading-relaxed">
            Morning load & midday re-check: tap what is genuinely open in Rev
            (filled = open), then save.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------

function SlotChip({
  time,
  picked,
  onToggle,
  size = "md",
}: {
  time: string;
  picked: boolean;
  onToggle: () => void;
  size?: "md" | "sm";
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={picked}
      className={`rounded-lg font-medium tnum transition-all duration-120 active:scale-95 border
        ${size === "md" ? "h-10 px-3 text-body" : "h-8 px-2.5 text-body-sm"}
        ${picked
          ? "bg-accent text-on-accent border-transparent"
          : "bg-surface text-ink-2 border-line hover:border-ink-3"}`}
    >
      {time}
    </button>
  );
}

function AgeTimer({ createdAt, state }: { createdAt: string; state: string }) {
  const age = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  const urgent = age > 30 && (state === "waiting" || state === "reopened");
  const label = age < 60 ? `${age}s` : `${Math.floor(age / 60)}m ${age % 60}s`;
  return (
    <span className={`ml-auto text-body-sm tnum ${urgent ? "text-danger font-medium" : "text-ink-3"}`}>
      {label}
    </span>
  );
}

function RailCard({
  task,
  onAnswer,
  onConfirm,
  onReopen,
}: {
  task: TaskCard;
  onAnswer: (id: string, response: Record<string, unknown>, okMsg?: string) => void;
  onConfirm: (id: string) => void;
  onReopen: (id: string, close: boolean) => void;
}) {
  const meta = TYPE_META[task.type];
  const p = task.payload;
  const age = Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 1000);
  const urgent = age > 30 && (task.state === "waiting" || task.state === "reopened");
  const timedOut = task.state === "timed_out";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: -12, overflow: "hidden" }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={`relative bg-surface border border-line rounded-xl shadow-sm pl-4 pr-4 py-3.5
        ${timedOut ? "opacity-70" : ""} ${urgent ? "pulse-urgent border-danger/40" : ""}`}
    >
      <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${meta.edge}`} aria-hidden />
      <header className="flex items-center gap-2 mb-2">
        <span className="text-ink-2">{meta.icon}</span>
        <span className="overline">{meta.label}</span>
        <Badge tone={timedOut ? "warning" : task.state === "waiting" || task.state === "reopened" ? "accent" : "neutral"}>
          {task.state.replace("_", " ")}
        </Badge>
        <AgeTimer createdAt={task.createdAt} state={task.state} />
      </header>

      {timedOut ? (
        <div className="flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" onClick={() => onReopen(task.id, false)}>
            Reopen
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onReopen(task.id, true)}>
            Close
          </Button>
        </div>
      ) : task.type === "availability" ? (
        <AvailabilityBody task={task} onAnswer={onAnswer} />
      ) : task.type === "book" ? (
        <>
          <p className="text-body leading-6 mb-3">
            Book <b className="font-semibold tnum">{String(p.time)}</b> on{" "}
            <b className="font-semibold tnum">{String(p.date)}</b> —{" "}
            <span className="text-h3 font-semibold">{String(p.patientName)}</span>{" "}
            <span className="text-ink-2">(DOB {String(p.patientDob)})</span>
            {!!p.newPatient && <Badge tone="violet" className="ml-1.5">new patient</Badge>}
            {!!p.note && <span className="block text-body-sm text-ink-2 mt-0.5">{String(p.note)}</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="success" size="lg" className="flex-[2]" onClick={() => onConfirm(task.id)}>
              Confirm — booked in Rev
            </Button>
            <Button variant="danger" size="lg" className="flex-1" onClick={() => onAnswer(task.id, { slotGone: true }, "Marked slot gone — AI will re-offer.")}>
              Slot gone
            </Button>
          </div>
        </>
      ) : task.type === "find" ? (
        <FindBody task={task} onAnswer={onAnswer} />
      ) : task.type === "cancel" ? (
        <>
          <p className="text-body leading-6 mb-3">
            Cancel <b className="font-semibold tnum">{String(p.time)}</b> on{" "}
            <b className="font-semibold tnum">{String(p.date)}</b> —{" "}
            <span className="text-h3 font-semibold">{String(p.patientName)}</span>
          </p>
          <Button variant="danger" size="lg" className="w-full" onClick={() => onConfirm(task.id)}>
            Confirm — cancelled in Rev
          </Button>
        </>
      ) : task.type === "move" ? (
        <>
          <p className="text-body leading-6 mb-3">
            Move <span className="text-h3 font-semibold">{String(p.patientName)}</span>:{" "}
            <b className="font-semibold tnum">{String(p.oldDate)} {String(p.oldTime)}</b>
            <span className="text-ink-3 mx-1.5">→</span>
            <b className="font-semibold tnum">{String(p.newDate)} {String(p.newTime)}</b>
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={() => onConfirm(task.id)}>
            Confirm both — moved in Rev
          </Button>
        </>
      ) : (
        <>
          <p className="text-body leading-6 mb-3">
            Call back <b className="font-semibold tnum">{String(p.phone)}</b>
            {!!p.note && <span className="block text-body-sm text-ink-2 mt-0.5">{String(p.note)}</span>}
          </p>
          <Button variant="success" size="lg" className="w-full" onClick={() => onAnswer(task.id, { handled: true }, "Callback handled.")}>
            Handled
          </Button>
        </>
      )}
    </motion.article>
  );
}

function AvailabilityBody({
  task,
  onAnswer,
}: {
  task: TaskCard;
  onAnswer: (id: string, response: Record<string, unknown>, okMsg?: string) => void;
}) {
  const date = String(task.payload.date);
  const [slots, setSlots] = useState<BoardSlot[] | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());

  useEffect(() => {
    api(`/api/rail/board?date=${date}`)
      .then((b) => {
        const bb = b as { slots: BoardSlot[] };
        setSlots(bb.slots);
        setPick(new Set(bb.slots.filter((s) => s.state === "open").map((s) => s.time)));
      })
      .catch(() => setSlots([]));
  }, [date]);

  return (
    <>
      <p className="text-body leading-6 mb-2.5">
        What&apos;s open on <b className="font-semibold tnum">{date}</b>? Tap the open slots, then send.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(slots ?? []).map((s) => (
          <SlotChip
            key={s.time}
            time={s.time}
            size="sm"
            picked={pick.has(s.time)}
            onToggle={() =>
              setPick((prev) => {
                const next = new Set(prev);
                if (next.has(s.time)) next.delete(s.time);
                else next.add(s.time);
                return next;
              })
            }
          />
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="success" size="lg" className="flex-[2]" onClick={() => onAnswer(task.id, { openSlots: [...pick] }, "Sent to the AI.")}>
          Send
        </Button>
        <Button variant="danger" size="lg" className="flex-1" onClick={() => onAnswer(task.id, { fullyBooked: true }, "Sent: fully booked.")}>
          Fully booked
        </Button>
      </div>
    </>
  );
}

function FindBody({
  task,
  onAnswer,
}: {
  task: TaskCard;
  onAnswer: (id: string, response: Record<string, unknown>, okMsg?: string) => void;
}) {
  const p = task.payload;
  const [found, setFound] = useState<FoundAppt[] | null>(null);

  const search = () =>
    api(`/api/rail/appointments?name=${encodeURIComponent(String(p.patientName))}&dob=${String(p.patientDob)}`)
      .then((r) => setFound(r as FoundAppt[]))
      .catch(() => setFound([]));

  return (
    <>
      <p className="text-body leading-6 mb-2.5">
        Find for <Badge tone="violet">{String(p.intent)}</Badge>:{" "}
        <span className="text-h3 font-semibold">{String(p.patientName)}</span>{" "}
        <span className="text-ink-2">(DOB {String(p.patientDob)})</span>
        <span className="block text-body-sm text-ink-3 mt-0.5">
          Check Rev, then tap the matching appointment.
        </span>
      </p>
      {found === null ? (
        <Button variant="primary" size="lg" className="w-full mb-2" onClick={search}>
          Show our records
        </Button>
      ) : (
        <div className="grid gap-1.5 mb-2.5">
          {found.map((a) => (
            <Button
              key={a.id}
              variant="secondary"
              size="lg"
              className="justify-start tnum"
              onClick={() => onAnswer(task.id, { appointmentId: a.id }, "Appointment sent to the AI.")}
            >
              {a.date} {a.time} — {a.type} <Badge tone="neutral" className="ml-1.5">{a.status}</Badge>
            </Button>
          ))}
          {found.length === 0 && (
            <p className="text-body-sm text-ink-3 py-1">No records here — check Rev directly.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => onAnswer(task.id, { notFound: true }, "Sent: not found.")}>Not found</Button>
        <Button size="sm" onClick={() => onAnswer(task.id, { multipleMatches: true }, "Sent: multiple matches.")}>Multiple matches</Button>
        <Button size="sm" onClick={() => onAnswer(task.id, { nothingActive: true }, "Sent: nothing active.")}>Nothing active</Button>
      </div>
    </>
  );
}
