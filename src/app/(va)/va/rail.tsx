"use client";

// The rail (Doc 1): a kitchen display, not an office form.
// Loud alert, big buttons, zero typing. The VA only taps real things
// (Golden Rule 1) — every button here was drawn from server truth.

import { useCallback, useEffect, useRef, useState } from "react";

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

// ---------------------------------------------------------------------------

export default function Rail({ vaName }: { vaName: string }) {
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [status, setStatus] = useState({ available: true, waiting: 0 });
  const [boardDate, setBoardDate] = useState(today());
  const [board, setBoard] = useState<{ loaded: boolean; slots: BoardSlot[] } | null>(null);
  const [boardPick, setBoardPick] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [, setTick] = useState(0); // re-render for the age timers
  const audioRef = useRef<AudioContext | null>(null);

  // --- the ding -----------------------------------------------------------
  const ding = useCallback(() => {
    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain).connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      /* no audio permission — the card still appears */
    }
  }, []);

  // --- data loading -------------------------------------------------------
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

  // --- live stream (SSE) ----------------------------------------------------
  useEffect(() => {
    const es = new EventSource("/api/rail/stream");
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

  // age timers tick once a second
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // --- actions --------------------------------------------------------------
  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setFlash(null);
      } catch (e) {
        setFlash((e as Error).message);
      }
      refreshTasks().catch(() => {});
      refreshStatus().catch(() => {});
    },
    [refreshTasks, refreshStatus],
  );

  const answer = (id: string, response: Record<string, unknown>) =>
    act(() => api(`/api/rail/tasks/${id}/answer`, { method: "POST", body: JSON.stringify({ response }) }));
  const confirm = (id: string) =>
    act(() => api(`/api/rail/tasks/${id}/confirm`, { method: "POST", body: "{}" }));
  const reopen = (id: string, close: boolean) =>
    act(() => api(`/api/rail/tasks/${id}/reopen`, { method: "POST", body: JSON.stringify({ close }) }));

  const toggleAvailable = () =>
    act(async () => {
      const next = !status.available;
      await api("/api/rail/status", { method: "POST", body: JSON.stringify({ available: next }) });
    });

  const saveBoard = () =>
    act(() =>
      api("/api/rail/availability/load", {
        method: "POST",
        body: JSON.stringify({ date: boardDate, openTimes: [...boardPick] }),
      }).then(() => refreshBoard(boardDate)),
    );

  // --- render ---------------------------------------------------------------
  return (
    <div style={S.page}>
      {/* status strip */}
      <div style={S.strip}>
        <strong style={{ fontSize: "1.1rem" }}>VA rail — {vaName}</strong>
        <span style={{ ...S.badge, background: status.waiting > 0 ? "#c0392b" : "#2c3e50" }}>
          {status.waiting} waiting
        </span>
        <button
          onClick={toggleAvailable}
          style={{ ...S.bigBtn, marginLeft: "auto", background: status.available ? "#27ae60" : "#c0392b" }}
        >
          {status.available ? "AVAILABLE" : "BUSY"}
        </button>
      </div>

      {flash && (
        <div style={S.flash} onClick={() => setFlash(null)}>
          ⚠ {flash} (tap to dismiss)
        </div>
      )}

      <div style={S.columns}>
        {/* the rail */}
        <section style={S.rail}>
          <h2 style={S.h2}>Requests</h2>
          {tasks.length === 0 && <p style={{ opacity: 0.5 }}>No open requests. They will ding in.</p>}
          {tasks.map((t) => (
            <Card key={t.id} task={t} onAnswer={answer} onConfirm={confirm} onReopen={reopen} />
          ))}
        </section>

        {/* the slot board */}
        <section style={S.boardWrap}>
          <h2 style={S.h2}>
            Slot board{" "}
            <input
              type="date"
              value={boardDate}
              onChange={(e) => setBoardDate(e.target.value)}
              style={S.dateInput}
            />
            {board && !board.loaded && <span style={{ ...S.badge, background: "#e67e22" }}>not loaded</span>}
          </h2>
          {board &&
            (["morning", "afternoon", "evening"] as const).map((block) => {
              const slots = board.slots.filter((s) => s.block === block);
              if (slots.length === 0) return null;
              return (
                <div key={block} style={{ marginBottom: "0.75rem" }}>
                  <div style={{ opacity: 0.6, marginBottom: "0.3rem", textTransform: "capitalize" }}>{block}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {slots.map((s) => {
                      const picked = boardPick.has(s.time);
                      return (
                        <button
                          key={s.time}
                          onClick={() =>
                            setBoardPick((prev) => {
                              const next = new Set(prev);
                              if (next.has(s.time)) next.delete(s.time);
                              else next.add(s.time);
                              return next;
                            })
                          }
                          style={{
                            ...S.chip,
                            background: picked ? "#27ae60" : "#3b4252",
                            outline: s.state === "taken" && picked ? "2px solid #e67e22" : "none",
                          }}
                          title={s.state ? `currently ${s.state} (${s.source})` : "not loaded"}
                        >
                          {s.time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          <button onClick={saveBoard} style={{ ...S.bigBtn, background: "#2980b9", width: "100%" }}>
            SAVE DAY (green = open)
          </button>
          <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>
            Morning load & midday re-check: tap what is genuinely open in Rev, then save.
          </p>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One rail card
// ---------------------------------------------------------------------------

function Card({
  task,
  onAnswer,
  onConfirm,
  onReopen,
}: {
  task: TaskCard;
  onAnswer: (id: string, response: Record<string, unknown>) => void;
  onConfirm: (id: string) => void;
  onReopen: (id: string, close: boolean) => void;
}) {
  const p = task.payload;
  const age = Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 1000);
  const urgent = age > 30 && (task.state === "waiting" || task.state === "reopened");

  return (
    <div style={{ ...S.card, borderColor: urgent ? "#c0392b" : "#3b4252" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
        <strong style={{ textTransform: "uppercase" }}>{task.type}</strong>
        <span style={{ ...S.badge, background: "#3b4252" }}>{task.state}</span>
        <span style={{ marginLeft: "auto", color: urgent ? "#e74c3c" : "#888" }}>{age}s</span>
      </div>

      {task.state === "timed_out" ? (
        <div style={S.row}>
          <button style={{ ...S.bigBtn, background: "#2980b9" }} onClick={() => onReopen(task.id, false)}>
            REOPEN
          </button>
          <button style={{ ...S.bigBtn, background: "#7f8c8d" }} onClick={() => onReopen(task.id, true)}>
            CLOSE
          </button>
        </div>
      ) : task.type === "availability" ? (
        <AvailabilityBody task={task} onAnswer={onAnswer} />
      ) : task.type === "book" ? (
        <>
          <p style={S.line}>
            Book <b>{String(p.time)}</b> on <b>{String(p.date)}</b> — {String(p.patientName)} (DOB{" "}
            {String(p.patientDob)}){p.newPatient ? " — NEW PATIENT" : ""}
            {p.note ? ` — ${String(p.note)}` : ""}
          </p>
          <div style={S.row}>
            <button style={{ ...S.bigBtn, background: "#27ae60" }} onClick={() => onConfirm(task.id)}>
              CONFIRM (booked in Rev)
            </button>
            <button style={{ ...S.bigBtn, background: "#c0392b" }} onClick={() => onAnswer(task.id, { slotGone: true })}>
              SLOT GONE
            </button>
          </div>
        </>
      ) : task.type === "find" ? (
        <FindBody task={task} onAnswer={onAnswer} />
      ) : task.type === "cancel" ? (
        <>
          <p style={S.line}>
            Cancel <b>{String(p.time)}</b> on <b>{String(p.date)}</b> — {String(p.patientName)}
          </p>
          <button style={{ ...S.bigBtn, background: "#c0392b", width: "100%" }} onClick={() => onConfirm(task.id)}>
            CONFIRM (cancelled in Rev)
          </button>
        </>
      ) : task.type === "move" ? (
        <>
          <p style={S.line}>
            Move {String(p.patientName)}: <b>{String(p.oldDate)} {String(p.oldTime)}</b> →{" "}
            <b>{String(p.newDate)} {String(p.newTime)}</b>
          </p>
          <button style={{ ...S.bigBtn, background: "#8e44ad", width: "100%" }} onClick={() => onConfirm(task.id)}>
            CONFIRM BOTH (moved in Rev)
          </button>
        </>
      ) : (
        <>
          <p style={S.line}>
            Call back <b>{String(p.phone)}</b>
            {p.note ? ` — ${String(p.note)}` : ""}
          </p>
          <button style={{ ...S.bigBtn, background: "#27ae60", width: "100%" }} onClick={() => onAnswer(task.id, { handled: true })}>
            HANDLED
          </button>
        </>
      )}
    </div>
  );
}

// Availability card: that day's chips from the board endpoint (Rule 1 —
// buttons are drawn from the template, never typed).
function AvailabilityBody({
  task,
  onAnswer,
}: {
  task: TaskCard;
  onAnswer: (id: string, response: Record<string, unknown>) => void;
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
      <p style={S.line}>
        What&apos;s open on <b>{date}</b>?
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
        {(slots ?? []).map((s) => (
          <button
            key={s.time}
            onClick={() =>
              setPick((prev) => {
                const next = new Set(prev);
                if (next.has(s.time)) next.delete(s.time);
                else next.add(s.time);
                return next;
              })
            }
            style={{ ...S.chip, background: pick.has(s.time) ? "#27ae60" : "#3b4252" }}
          >
            {s.time}
          </button>
        ))}
      </div>
      <div style={S.row}>
        <button
          style={{ ...S.bigBtn, background: "#27ae60" }}
          onClick={() => onAnswer(task.id, { openSlots: [...pick] })}
        >
          SEND
        </button>
        <button style={{ ...S.bigBtn, background: "#c0392b" }} onClick={() => onAnswer(task.id, { fullyBooked: true })}>
          FULLY BOOKED
        </button>
      </div>
    </>
  );
}

// Find card: search our records, tap the right appointment (Rule 5/6 taps).
function FindBody({
  task,
  onAnswer,
}: {
  task: TaskCard;
  onAnswer: (id: string, response: Record<string, unknown>) => void;
}) {
  const p = task.payload;
  const [found, setFound] = useState<FoundAppt[] | null>(null);

  const search = () =>
    api(`/api/rail/appointments?name=${encodeURIComponent(String(p.patientName))}&dob=${String(p.patientDob)}`)
      .then((r) => setFound(r as FoundAppt[]))
      .catch(() => setFound([]));

  return (
    <>
      <p style={S.line}>
        Find ({String(p.intent)}): <b>{String(p.patientName)}</b>, DOB <b>{String(p.patientDob)}</b> — check Rev, then
        tap the right one.
      </p>
      {found === null ? (
        <button style={{ ...S.bigBtn, background: "#2980b9", width: "100%" }} onClick={search}>
          SHOW OUR RECORDS
        </button>
      ) : (
        <div style={{ display: "grid", gap: "0.4rem", marginBottom: "0.5rem" }}>
          {found.map((a) => (
            <button
              key={a.id}
              style={{ ...S.bigBtn, background: "#2980b9", textAlign: "left" }}
              onClick={() => onAnswer(task.id, { appointmentId: a.id })}
            >
              {a.date} {a.time} — {a.type} ({a.status})
            </button>
          ))}
          {found.length === 0 && <p style={{ opacity: 0.6 }}>No records here — check Rev directly.</p>}
        </div>
      )}
      <div style={S.row}>
        <button style={{ ...S.smBtn }} onClick={() => onAnswer(task.id, { notFound: true })}>
          NOT FOUND
        </button>
        <button style={{ ...S.smBtn }} onClick={() => onAnswer(task.id, { multipleMatches: true })}>
          MULTIPLE MATCHES
        </button>
        <button style={{ ...S.smBtn }} onClick={() => onAnswer(task.id, { nothingActive: true })}>
          NOTHING ACTIVE
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#1b1f2a", color: "#eceff4", padding: "1rem", fontSize: "1rem" },
  strip: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "center",
    background: "#232837",
    padding: "0.6rem 1rem",
    borderRadius: 10,
    marginBottom: "1rem",
  },
  columns: { display: "grid", gridTemplateColumns: "1fr 380px", gap: "1rem", alignItems: "start" },
  rail: { display: "grid", gap: "0.75rem", alignContent: "start" },
  boardWrap: { background: "#232837", padding: "1rem", borderRadius: 10 },
  h2: { margin: "0 0 0.75rem", fontSize: "1.05rem", display: "flex", gap: "0.5rem", alignItems: "center" },
  card: { background: "#232837", border: "2px solid #3b4252", borderRadius: 10, padding: "0.9rem", display: "grid", gap: "0.5rem" },
  line: { margin: 0, lineHeight: 1.5 },
  row: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  bigBtn: {
    border: "none",
    color: "white",
    padding: "0.8rem 1.1rem",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    flex: "1 1 auto",
  },
  smBtn: {
    border: "1px solid #4c566a",
    background: "#2e3440",
    color: "#eceff4",
    padding: "0.5rem 0.8rem",
    borderRadius: 8,
    cursor: "pointer",
    flex: "1 1 auto",
  },
  chip: { border: "none", color: "white", padding: "0.55rem 0.8rem", borderRadius: 8, fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" },
  badge: { padding: "0.15rem 0.6rem", borderRadius: 999, fontSize: "0.8rem", color: "white" },
  flash: { background: "#c0392b", color: "white", padding: "0.6rem 1rem", borderRadius: 8, marginBottom: "1rem", cursor: "pointer" },
  dateInput: { background: "#2e3440", color: "#eceff4", border: "1px solid #4c566a", borderRadius: 6, padding: "0.25rem 0.5rem" },
};
