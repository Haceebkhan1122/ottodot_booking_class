# Ottodot Booking Class

A trial-class booking system built to solve a single, deceptively simple problem: **when two parents go for the last seat in a class at the same time, at most one of them may end up confirmed.**

Everything else in the system — duplicate bookings, overbooking, failed payments — is the same concurrency problem wearing a different hat.

---

## Overview

Parents can:
- Pick a child
- Pick a trial class (each capped at **4 students**)
- Pay for the seat
- Get instantly confirmed — or cleanly rejected if the seat is gone

Teachers can view a live roster of confirmed students per class.

The system is built to make **overbooking structurally impossible**, not just logically unlikely.

---

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript
- **Backend:** Node.js — plain route handlers (not Server Actions)
- **Database:** PostgreSQL
- **Testing:** Integration tests against a real Postgres instance, HTTP-level concurrency tests, browser assertions, accessibility audits (axe)

One Next.js application handles both frontend and backend — there is no separate backend process. Route handlers live under `app/api`, and a service layer under `src/server` is the **only** code allowed to touch the database.

---

## Key Design Decisions

### Why route handlers instead of Server Actions
- The brief requires a callable roster API — a Server Action has no URL and can't be `curl`'d.
- Concurrency needed to be testable from **outside** the app via plain HTTP.
- A single API client (axios) gives one consistent error shape across the app.

### Why PostgreSQL instead of SQLite
SQLite serialises every write globally, which means a race-condition test would pass **without any real locking logic** — a test that passes for the wrong reason is worse than no test at all.

PostgreSQL provides:
- Real concurrent connections
- Real row-level locking
- The ability to make bad states **impossible to represent** at the schema level

### Database-enforced correctness
- A `CHECK` constraint ensures `confirmed_count` can never exceed `capacity`.
- A **partial unique index** ensures a child can never hold two active bookings for the same class.

These aren't application-level checks a future developer could accidentally skip — the invalid row simply cannot exist in the database.

### The last-seat race
Pending bookings **do not** hold a seat. This was a deliberate trade-off:
- Holding the seat on booking creation would eliminate the race — but it also lets a parent abandon checkout and freeze a seat nobody paid for.
- Instead, the race is allowed to actually happen, and resolved atomically in the database.

The seat is claimed with a single SQL statement:

```sql
UPDATE trial_classes
SET confirmed_count = confirmed_count + 1
WHERE id = $1 AND confirmed_count < capacity;
```

Postgres takes a row lock on the class for the duration of the update. Every concurrent request is serialised, and each one re-checks the count against the **committed** value — not a value read moments earlier. Zero rows updated means someone else won the seat first.

### Payment ordering
**Authorise → claim the seat → capture.**
Seat first, money second — because money can be refunded, but a seat can't be un-lost. The losing parent's payment is **authorised then voided**, never captured. Their card was never the problem, and the UI reflects that honestly ("seat taken", not "payment failed").

### Booking statuses
| Status | Meaning |
|---|---|
| `pending_payment` | Booking created, seat not yet held |
| `confirmed` | Payment captured, seat claimed |
| `payment_failed` | Payment declined **or** lost the seat race — includes a reason |
| `cancelled` | Explicitly cancelled by a person (never set by the system automatically) |

Each status means exactly one thing — the race loser is *not* given a `cancelled` status, since that would overload its meaning.

---

## Features

- ✅ Real-time seat availability per class
- ✅ Duplicate booking prevention (enforced at the database level, not just the client)
- ✅ Mock payment provider with `authorize` / `capture` / `void` steps and idempotency keys (prevents double-charging on retries or double-clicks)
- ✅ Full payment history / audit trail per booking
- ✅ Teacher roster view (confirmed bookings only)
- ✅ Concurrency-safe seat claiming, verified under load (tested with up to 10 simultaneous confirms on a single seat)
- ✅ WCAG 2.1 AA accessibility compliance

---

## Getting Started

### Prerequisites
- Node.js
- PostgreSQL

### Installation

```bash
npm install
```

### Setup the database

```bash
npm run db:reset
```

This seeds the database to a known state (Mathematics should show 3/4 confirmed seats).

### Run the development server

```bash
npm run dev
```

### Run tests

```bash
npm test
```

Includes integration tests against a real Postgres instance, HTTP-level concurrency assertions, and browser-level assertions, plus an accessibility audit.

---

## Known Limitations / Trade-offs

- **No authentication** — the parent is selected from a dropdown as a stand-in for a session. This kept the concurrency demo simple.
- **Mock payment provider** — behaves like a real one (separate authorize/capture/void, idempotency keys) but does not connect to a real processor.
- **No stored procedure for seat claiming** — the guard lives in application code (TypeScript) rather than a database procedure. It's easier to test and explain, and the database constraints already make the invalid state impossible regardless.
- **Reconciliation gap** — if the process crashes between claiming a seat and capturing payment, a seat could be held without being paid for. The intended fix is a reconciliation job; it is not implemented here.

---

## Testing Summary

- 24 integration tests against a real PostgreSQL instance
- 33 HTTP-level concurrency assertions
- 128 browser-level assertions
- Clean axe accessibility audit
- Mutation-tested the core race guard: removing the `confirmed_count < capacity` check causes 7 tests to fail and Postgres to reject the write

---

## Video Walkthrough

A full walkthrough of the system — architecture, the app flow, and a live demonstration of the last-seat race (including a 10-way concurrent confirm test) is available here:

**[Add video link here]**

---

## AI Usage

Details on where AI tools were used during development, and specific decisions where AI suggestions were overruled, are documented in `AI_USAGE.md`.
