# DESIGN.md — UI/UX Redesign Plan

> **Status: the governing design document.** Like STACK.md, this file is the
> permanent reference. Every screen built or restyled after this point follows
> it. The redesign is presentation-only: **no API contract, database field, or
> business rule changes**. Every flow that passed its Definition of Done must
> still pass after the restyle.

---

## 1. Design principles

1. **Calm, not loud.** This is software people stare at for whole shifts
   (the VA) or check between patients (the doctor). Refined hierarchy comes
   from spacing, weight and color — never from large bold type.
2. **Speed is the aesthetic.** The VA rail's job is sub-10-second responses;
   nothing may cost more than ~200ms of perceived delay. Animations are
   feedback, not decoration.
3. **One system, three moods.** All screens share one token set and component
   kit; each role's screen differs in layout density, not in design language.
4. **Quietly medical.** Trustworthy, clinical-adjacent, international: neutral
   surfaces, one restrained accent, generous whitespace, no gradients-for-
   gradients'-sake.
5. **Accessible by default.** WCAG AA contrast, visible focus rings, reduced-
   motion respected, keyboard reachable, screen-reader labels on icon buttons.

---

## 2. Technology additions (presentation layer only)

| Addition | Why | Cost |
|---|---|---|
| **Tailwind CSS v4** | Industry-standard utility CSS; design tokens as CSS variables; first-class dark mode; deletes all inline style objects | dev-only dependency |
| **`next/font` + Inter** | Self-hosted variable font (no external requests — matches our CSP posture); the de-facto standard UI face | ~100KB, cached |
| **`lucide-react`** | Consistent 1.5px-stroke icon set (professional, not emoji) | tree-shaken, tiny |
| **`motion` (Framer Motion successor)** | Spring-based enter/exit animation for rail cards and toasts; respects `prefers-reduced-motion` automatically | ~30KB gzip, only on client screens |

No component library (MUI/Ant/shadcn) — our surface area is small enough that
a hand-rolled kit stays lighter, and nothing external dictates our look.

---

## 3. Design tokens (the single source of truth)

Defined once in `globals.css` as CSS variables, consumed by Tailwind. Light
and dark themes; dark is the default for the VA rail (long shifts, dim rooms),
light is the default for doctor/operator (office daylight), both user-toggleable.

### 3.1 Typography — refined, never shouty

- **Family:** Inter variable (`next/font/google`, self-hosted at build time).
  Numeric UI (metrics, money, timers) uses `font-variant-numeric: tabular-nums`.
- **Scale (rem):** 12 caption · 13 body-sm · 14 body (base) · 16 heading-3 ·
  18 heading-2 · 22 heading-1 · 28 display (stat tiles only).
- **Weights:** 400 body · 500 medium (labels, buttons) · 600 semibold
  (headings, key values). **Nothing above 600.** Hierarchy comes from size
  steps + color, not weight.
- **Color hierarchy:** `ink` (primary text) → `ink-2` (secondary) → `ink-3`
  (muted). Uppercase is banned except 11px tracked "overline" labels.

### 3.2 Color

- **Surfaces:** layered neutrals (slate family) — `bg` page, `surface` cards,
  `surface-2` inset areas, `border` hairlines. Dark theme: near-black slate
  `#0f1420` → `#171d2b` → `#1f2637`; light theme: `#f8f9fb` → `#ffffff` → `#f1f3f7`.
- **Accent:** one medical teal-blue (`#2a78d6` light / `#3987e5` dark — already
  validated with the dataviz palette checker). Used for primary actions, focus,
  active states, links. Never for decoration.
- **Status (reserved, never decorative):** success `#1baf7a`, warning `#eda100`,
  danger `#e34948`, info = accent. Always paired with an icon or label.
- **Charts:** keep the validated dataviz reference palette (Doc 2 chart already
  complies).

### 3.3 Space, radius, elevation

- **Spacing:** 4px grid (4/8/12/16/24/32/48).
- **Radius:** 8px inputs/buttons · 12px cards · 999 pills.
- **Elevation:** borders first, shadows second. Two shadows only:
  `sm` (cards, subtle) and `lg` (modals/popovers). No glows.

### 3.4 Motion

- **Durations:** 120ms micro (hover/press) · 200ms standard (enter/exit) ·
  320ms large (modal, page). Easing `cubic-bezier(0.2, 0, 0, 1)`.
- **Springs** (motion lib) only for rail-card entrance and toast slide.
- **`prefers-reduced-motion: reduce`** collapses everything to opacity fades.
- Never animate layout of what a user is reading; never loop anything except
  the "waiting" pulse on urgent rail cards and skeleton shimmer.

---

## 4. The shared component kit — `src/components/ui/`

Small, typed, and the only way screens are allowed to build UI:

| Component | Notes |
|---|---|
| `Button` | variants: primary / secondary / ghost / danger; sizes sm-md-lg; loading spinner state; icon slot |
| `Card` | surface + border + radius; optional header/footer |
| `Badge` | status pill; icon + label, never color alone |
| `Input`, `Select`, `DateInput`, `MonthInput` | shared field chrome, labels, error text, focus ring |
| `Table` | sticky header, row hover, responsive horizontal scroll wrapper |
| `StatTile` | value (tabular-nums, animated count-up), label, optional delta |
| `Toast` | success/error feedback, slides in bottom-right, auto-dismiss — **replaces every `alert`-style flash bar** |
| `Modal` | for destructive confirms and the operator's create forms |
| `Skeleton` | loading shimmer for tables/tiles — **replaces "…" placeholders** |
| `EmptyState` | icon + one line + optional action, for zero-data views |
| `AppShell` | top bar: product mark, screen title, clinic name, connection dot (SSE state), user menu with **Sign out** (currently missing!) |
| `ThemeToggle` | light/dark, persisted in `localStorage`, respects system default |

---

## 5. Screen-by-screen redesign

### 5.0 App-wide UX fixes (bugs of omission, fixed in this pass)
- **Role-based landing:** after login, va → `/va`, doctor → `/doctor`,
  operator → `/operator` (today everyone lands on the bare home page).
- **Sign out** in the shell user menu (today there is no way to log out).
- **SSE connection indicator** on the rail (green dot pulsing = live; amber =
  reconnecting) — today a dropped stream is silent.
- **Sound permission affordance:** first visit to the rail shows a small
  "Enable sound" chip (one click satisfies the browser's audio-gesture rule —
  fixes the ding you never heard); preference remembered.
- **Route protection polish:** wrong-role visits get a friendly "you don't
  have access" page with a link to their own screen, not a redirect loop.

### 5.1 Login
Centered 380px card on a soft-gradient neutral backdrop; product wordmark;
Inter 14px fields with floating labels; inline error under the field (not a
red banner); button shows a spinner while authenticating; subtle card
fade-up on mount. Footer line: "Access is provisioned by your operator."

### 5.2 VA rail (the flagship — kitchen display, redesigned)
- **Layout:** three zones. Left: the rail (cards, max-width 720px). Right:
  slot board in a collapsible panel. Top: slim status bar.
- **Status bar:** connection dot + "Live", waiting count pill, availability
  segmented control (Available / Busy) — small and calm, not a giant button.
- **Cards:** white/dark surface, 12px radius, colored 3px left edge by task
  type (book=accent, cancel=danger, move=violet, find=info, availability=
  neutral, callback=warning). Header row: type icon + small-caps label +
  patient name at 16px/600 + live age timer (tabular). Body: the details.
  Footer: actions.
  - **Entrance:** spring slide-in from top + the ding; the newest card gets a
    2-second accent pulse. **Exit:** fade + collapse (motion `AnimatePresence`).
  - **Urgency:** at 30s the age timer turns warning; at timeout the card
    dims and shows Reopen/Close.
  - **CONFIRM buttons** stay large (44px min-height — they are the one
    deliberate exception to "calm"; tap targets are a safety feature).
- **Slot chips:** 40px tap targets, filled=open (accent) / outline=taken;
  press animation 120ms scale; block headings as 11px overlines.
- **Feedback:** every action optimistic-updates the card, shows a Toast on
  failure and rolls back — no more red banner across the screen.

### 5.3 Doctor dashboard
- Header: clinic name (18px/600) + "Reception report" subtitle + date-range
  control group right-aligned (7/30/90 presets as segmented control + custom
  range popover).
- **StatTiles** in a responsive row: 28px semibold values with count-up
  animation (400ms, once per load), 12px muted labels, no borders between —
  one quiet card.
- Busiest-times chart: keep the validated hue; add 200ms bar-grow on load;
  tooltip restyled to kit tokens; table view stays.
- Skeletons while loading; EmptyState ("No calls in this range yet") for
  zero data.

### 5.4 Operator control room
- **Left nav rail** (icons + labels): Overview · Clinics · Users · Billing.
  Each a route segment (`/operator`, `/operator/clinics`, `/operator/users`,
  `/operator/billing`) so deep-linking works; shell highlights the active one.
- **Overview:** health cards per clinic (status badge, waiting, timed-out,
  last call, sparkline of today's calls) + a cross-clinic margin summary row.
- **Clinics:** table + "Add clinic" opens a **Modal** with a proper stepped
  form (details → plan → slot template with a visual chip-picker grid instead
  of a comma-separated text field). The one-time AI key is presented in a
  copy-to-clipboard field inside a success modal.
- **Users:** table with role filter chips; disable/enable via row menu with a
  confirm modal ("This locks them out on their next request").
- **Billing:** month picker; money table with margin column colored by sign;
  costs sub-panel; invoice cards with status timeline (draft → sent → paid);
  generate button per clinic with loading state.

### 5.5 Home page
Becomes a redirect: logged-in users go to their role's screen; logged-out
users go to `/login`. (The current link list disappears.)

---

## 6. Implementation plan — phases, each shippable and verified

Rules: one phase per commit; `npm run build` green before every commit; after
each phase, re-run the affected flows end-to-end (login, a booking through
the rail, doctor metrics fetch, an operator action) before moving on. No API
or schema edits anywhere in this plan.

| Phase | Scope | Verification gate |
|---|---|---|
| **P0 Foundation** | Tailwind v4 + Inter via next/font + tokens in globals.css + the full `ui/` kit + AppShell + ThemeToggle + role-based redirect + sign out | kit renders on a hidden `/design` playground page; login-as-each-role still works |
| **P1 Login + Home** | restyle login, home becomes role redirect | all three roles land on their screens; wrong password shows inline error |
| **P2 VA rail** | restyle rail/board/cards, motion, toasts, sound chip, connection dot | full booking + cancel + reschedule through the UI against the live API; ding audible after enabling sound |
| **P3 Doctor** | shell + tiles + chart polish + skeletons + empty states | metrics render for both doctors; numbers unchanged from API |
| **P4 Operator** | nav-rail restructure into 4 sections + modals + forms | create clinic via modal, disable/enable user, generate + pay invoice — all against live API |
| **P5 Sweep** | remove dead styles, a11y pass (focus order, labels, contrast), reduced-motion check, README screenshots | Lighthouse a11y ≥ 95 on all four screens; `npm run build` clean |

Estimated shape: P0 is the big one; P1–P4 are mostly mechanical once the kit
exists.

## 7. Non-regression contract

- `/api/*` request/response shapes: **untouched**.
- Prisma schema: **untouched**.
- Golden Rules & state machine behavior: **untouched** — the UI may only make
  illegal actions *unpresentable*, exactly as it does today.
- Anything that fails during a phase's verification gate blocks the commit.
