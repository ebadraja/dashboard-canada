# Doctor View (Doc 2) — PLACEHOLDER

**Build order: 3rd, after the VA view produces real Call records.**

Empty on purpose. A strictly **read-only** report card, built entirely by
counting/aggregating the Call and AppointmentRecord rows the VA view produces.

Will show (later, not now), for the doctor's own clinic and a selectable date
range: calls handled, bookings made, cancellations & reschedules, missed/callback
rate, average response time (waiting→answered), busiest times.

Must **not** be able to reach — enforced in the backend, by construction — VA
pay/existence, any other clinic's data, or internal cost/margin.

**Definition of done (Doc 2 §5):** doctor sees only their own clinic's numbers;
each metric over a selectable date range; strictly read-only; cannot reach VA /
cost / other-clinic data; numbers reconcile with the underlying Call records.
