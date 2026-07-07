# STACK.md — The one, fixed technology decision

> **This is an architecture decision record (ADR). It is FIXED.**
> Every future session reads this file first and builds within it.
> Do not introduce alternative frameworks, ORMs, auth libraries, or
> real-time mechanisms without an explicit instruction to change this file.

The AI Receptionist system is one full-stack TypeScript application: a single
long-running Node service that serves the web screens, exposes the API the AI
phone system calls, holds the database connection, and pushes the live "ding"
to the VA's rail. One language, one repo, one deploy, one bill.

---

## The decision at a glance

| Layer            | Choice                                                        |
|------------------|---------------------------------------------------------------|
| Language         | TypeScript (front to back)                                    |
| Frontend         | Next.js (App Router) + React                                  |
| Backend / API    | Next.js Route Handlers (`/api/*`) on a long-running Node server|
| Database         | PostgreSQL (managed)                                          |
| ORM / data layer | Prisma                                                        |
| Auth & sessions  | Auth.js (NextAuth v5), credentials + database-backed sessions |
| Real-time push   | Server-Sent Events (SSE) over the authenticated session       |
| Hosting          | One container on Railway / Render / Fly.io + managed Postgres |

---

## Why each choice — one line against the Doc 0 §1 requirements

### Frontend — Next.js (App Router) + React + TypeScript
The VA rail needs a fast, interactive, big-button screen; React gives that, and
Next.js lets the same app also hold the backend, so there is no second service
to run or deploy.

### Backend / API — Next.js Route Handlers on a long-running Node server
> *Requirement: "easy to expose a small API" that both the screens and an
> external AI phone system call.*
One set of `/api/*` endpoints is the single menu every caller speaks — the web
screens (browser session cookie) and the AI phone system (per-clinic API key).
We run it as a **persistent Node process** (not serverless functions) so that
SSE connections can stay open — this is a deliberate hosting choice, see below.

### Database — PostgreSQL (managed)
> *Requirement: "solid relational data with clear relationships."*
The nine entities (Clinic → Users/Slots/Calls/Invoices; Call → Appointment/Tasks;
AuditLog → any record) are highly relational; Postgres gives real foreign keys,
transactions, and constraints — essential for the reschedule "both halves or
nothing" guarantee.

### ORM — Prisma
Typed models make the relationships explicit and safe, and its migration system
keeps the schema versioned and reproducible across every future session.

### Auth & sessions — Auth.js (NextAuth v5), credentials + DB sessions
> *Requirement: "straightforward auth & sessions," every action tied to a real
> person.*
Mature, well-documented session auth with a credentials provider; sessions live
in Postgres and expire, so no shared logins and every request carries a real
user identity that the backend guard reads.

### Role-based access + per-clinic isolation — enforced in the backend
> *Requirement: "role-based access enforced server-side," strict clinic
> isolation.*
A single shared guard wraps **every** Route Handler: it resolves the session
user, checks the role (`va` / `doctor` / `operator`), and scopes every query to
that user's `clinicId` (operator excepted). The frontend is assumed bypassable;
a doctor request is structurally unable to return VA-cost or another clinic's
data. The AI phone caller authenticates with a per-clinic API key that resolves
to exactly one clinic.

### Real-time push — Server-Sent Events (SSE)
> *Requirement: "real-time push to the browser," a ding within ~1 second.*
The rail only needs the **server → browser** direction (new tasks ding in); the
VA's taps go back as ordinary API POSTs. SSE is exactly that one-directional
push, runs over plain authenticated HTTP, needs no extra service or protocol,
and is far simpler and cheaper than WebSockets. The persistent Node server keeps
each VA's SSE stream open and writes an event the instant a Task is created.
*(WebSockets were considered and rejected: bidirectional complexity we don't
need, since the client→server path is already covered by the REST API.)*

### Hosting — one container + managed Postgres (Railway / Render / Fly.io)
> *Requirement: "reasonable hosting & cost for a solo operator."*
A single always-on container (required for SSE) plus one managed Postgres is the
leanest thing that keeps a live push open: one service to watch, one predictable
bill, trivial to scale to a few clinics before the resale phase.

---

## Consequences / notes for future sessions
- **Not serverless.** We deploy the Next.js app as a long-running server so SSE
  streams persist. Do not refactor the API into stateless serverless functions
  without revisiting real-time.
- **Two kinds of caller, one API.** Humans authenticate by session cookie; the
  AI phone system authenticates by a per-clinic API key/bearer token. Both hit
  the same endpoints; the backend guard normalizes them to `{ user|clinic, role }`.
- **Isolation is a backend invariant, never a frontend filter.**
- **Patient data stays minimal:** name + DOB only. The real record lives in
  RevolutionEHR.
