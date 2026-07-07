# AI Receptionist

An AI-receptionist operations system for medical clinics. A neutral-accent AI
answers the phone; a human VA does the real bookings inside RevolutionEHR; they
pass short notes through a fast "rail" dashboard. See `docs/` for the full plan
and `STACK.md` for the fixed technology decision.

> **Status: all four slices built and verified** —
> **Foundation (Doc 0) ✓ → VA view (Doc 1) ✓ → Doctor view (Doc 2) ✓ → Operator view (Doc 3) ✓** —
> each against its document's Definition of Done. Core product complete for
> one clinic; onboarding the next clinic is a form in the operator view.
>
> Screens: `/login` · `/va` (the rail) · `/doctor` (report card) · `/operator`
> (control room). The AI phone system talks to `/api/ai/*` with a per-clinic
> Bearer key.

## Stack (see `STACK.md`)

Next.js (App Router) + React · PostgreSQL + Prisma · Auth.js sessions ·
Server-Sent Events for the live rail · one long-running Node container +
managed Postgres.

## Prerequisites

- Node.js 20+ (developed on 22)
- A PostgreSQL database (only needed once the Foundation slice adds the data
  model — not required just to start the skeleton)

## Run it

```bash
npm install

# copy env template (values only matter once features land)
cp .env.example .env

# development (hot reload)
npm run dev

# production build + long-running server
npm run build
npm start
```

Then open <http://localhost:3000> — you should see the blank "AI Receptionist"
page. Confirm the server is healthy:

```bash
curl http://localhost:3000/api/health
# -> {"status":"ok","service":"ai-receptionist","time":"..."}
```

## Project layout

```
docs/                     The five planning documents (source of truth)
prisma/schema.prisma      DB schema — datasource/generator only, NO models yet
src/
  app/
    layout.tsx            Root layout
    page.tsx              Blank running page
    globals.css           Minimal styles
    api/health/route.ts   Health check
    (va)/                 PLACEHOLDER — VA view (Doc 1)
    (doctor)/             PLACEHOLDER — Doctor view (Doc 2)
    (operator)/           PLACEHOLDER — Operator view (Doc 3)
  server/
    foundation/           PLACEHOLDER — Foundation (Doc 0): data model, auth,
                          roles, per-clinic isolation, audit log
STACK.md                  The fixed architecture decision (read first)
```

The `(va)`, `(doctor)`, `(operator)` folders are Next.js route groups; they hold
only placeholders now and gain real screens in their slices.

## How we build

- Foundation fully done before any view; then VA, Doctor, Operator — one slice
  at a time.
- Roles and per-clinic isolation are enforced in the **backend** on every
  request. The frontend is assumed bypassable.
- Patient data stays minimal (name + DOB only). The real medical record lives in
  RevolutionEHR.
