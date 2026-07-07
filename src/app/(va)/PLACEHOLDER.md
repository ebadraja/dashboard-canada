# VA View (Doc 1) — PLACEHOLDER

**Build order: 2nd, after the Foundation is done.**

Empty on purpose. This is the heart of the product — the live rail the VA lives
in all day: loud alerts, big buttons, near-zero typing, sub-10-second responses.

Will contain (later, not now):

- The **live request rail** (SSE-pushed task cards that ding within ~1s).
- The **slot board** built from the clinic's fixed `SlotTemplate`, so only valid
  options are tappable (Golden Rule 1).
- The **find-patient panel** for cancel/move (name + DOB lookup surfaced as
  buttons; "not found" / "multiple matches" are first-class outcomes).
- The **status strip** (available/busy toggle + queue depth) and midday
  **reconciliation** view.
- The three operations — **booking, cancellation, reschedule** — with reschedule's
  "both halves or nothing" guarantee owned by the backend.
- The five AI-phone API requests (what's open, book, find, cancel/move, callback).

**Definition of done (Doc 1 §7):** live rail dings in real time; morning load
persists; booking flips availability + records a confirmed appointment; cancel
reopens the freed slot; reschedule handles both halves safely; timeouts produce
a callback path; the five AI requests work; every interaction leaves a clean Call
record.
