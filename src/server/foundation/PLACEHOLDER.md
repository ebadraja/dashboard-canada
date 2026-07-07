# Foundation (Doc 0) — PLACEHOLDER

**Build order: 1st. This slice must be fully done before any view.**

Empty on purpose. Nothing here yet. This is where the ground floor goes:

- The data model (Prisma models for Clinic, User, SlotTemplate,
  AvailabilityEntry, AppointmentRecord, Call, Task, Invoice, AuditLog) and their
  relationships — defined in `prisma/schema.prisma`.
- Auth.js setup: login, sessions, password credentials.
- The backend guard that enforces **role** (`va` / `doctor` / `operator`) and
  **per-clinic isolation** on every request — assume the frontend is bypassable.
- The dual caller model: human session cookie vs. AI-phone per-clinic API key,
  both normalized to `{ user|clinic, role }`.
- Audit-log write on every meaningful change.
- Minimal seed/screen so the operator can create one clinic + one VA user.

**Definition of done (from Doc 0 §4):** STACK.md exists and is followed; all
tables exist with correct relationships; a person can log in and is recognised
as va/doctor/operator; the backend rejects out-of-role actions and never returns
another clinic's data; the operator can create one clinic and one VA; every
meaningful change writes an audit-log row.
