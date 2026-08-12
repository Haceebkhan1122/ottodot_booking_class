# AI Usage

## Which tools

**Claude (Anthropic), used as a coding agent** with access to the shell, the
filesystem, and a real browser via Playwright. That last part matters more than
which model it was: the agent could start Postgres, run the suite, drive the UI
and read back what actually happened, so most claims in this repo were checked
rather than asserted.

No other AI tools were used.

---

## What I used AI for

- **Arguing about the design before writing anything.** Holds versus no holds,
  `SELECT FOR UPDATE` versus a conditional `UPDATE`, whether the seat claim
  belongs in a plpgsql function or in TypeScript.
- **Writing the code**, once those decisions were settled: schema, booking
  service, API routes, components.
- **Writing the verification**, which turned out to be where AI earned the most:
  a 24-test integration suite, 33 HTTP assertions, and 128 browser assertions
  covering things I would not have written by hand under a 4-hour cap
  (browser-Back mid-payment, a tab holding a stale seat count, aborted network
  requests, keyboard-only booking, 375px layout).
- **Diagnosis.** Reading Postgres `pg_stat_activity` output and Next.js dev logs
  to find why a demo was wedging.

---

## Where AI moved me fastest

**Building the frontend against a locked API contract before the database
existed.**

The plan was frontend first, Postgres second. The obvious way to do that is
hard-coded props, and the obvious consequence is a contract that drifts, so the
backend phase turns into a rewrite of both layers.

Instead the first phase shipped real HTTP endpoints backed by an in-memory
store, with the final statuses, failure reasons and response envelope already in
place. When Postgres arrived, only the bodies of `bookingService.ts` changed —
no route, no component, no API-service file. The 33 HTTP assertions written
against the in-memory version passed against Postgres unchanged, which is the
proof the contract really was stable.

That is a couple of hours saved, and it is a discipline AI is good at holding
because it does not get bored of keeping two layers consistent.

---

## Where I disagreed with, corrected, or rejected AI output

### 1. It grew the state machine twice, and was talked down twice.

First the AI wanted a fifth status, `seat_unavailable`, for the race loser. The
argument was good — the card was fine, only the seat ran out, and calling that
`payment_failed` hides every race in the data. But the brief lists four statuses
and asks to keep the model small, and a take-home is not the place to quietly
grow someone else's state machine.

Its second attempt was subtler and I nearly kept it: put the race loser on
`cancelled` with `failure_reason = 'class_full'`. Four statuses, so it looked
compliant. It was not — it gave `cancelled` two meanings, "a person cancelled
this" and "the system rejected this", which is the same overloading as a fifth
status with the seam hidden better.

The version that shipped: `payment_failed` covers every way the payment step
fails to complete, `failure_reason` says which, and `cancelled` means a person
cancelled it and nothing else. The UI still shows "Seat taken" rather than
"Payment failed", because `getStatusPresentation()` reads the reason as well as
the status.

Both corrections came from the same question — *what does this status mean, and
does it mean only that?* — and both times the AI had a fluent answer for why the
extra state was fine.

### 2. It reached for `SELECT ... FOR UPDATE`. The database showed it was wrong.

The first confirm transaction locked the booking row with `SELECT ... FOR
UPDATE` and held it across every following statement. Correct, and it passed
the tests.

Then an eleven-way race left the whole demo wedged with no error anywhere.
`pg_stat_activity` showed two backends blocked on `Lock/relation` while running
the schema file, and one sitting on `Client/ClientRead` — a request had died
mid-transaction and its row locks outlived it, and the next database reset
blocked behind them forever.

Two changes came out of that, and I would not have found either by reading the
code:

- The lock is now a **compare-and-swap** (`update ... where status =
  'pending_payment'`), which gives the same mutual exclusion while holding locks
  for the shortest possible window.
- The pool sets **`idle_in_transaction_session_timeout`**, so Postgres itself
  kills a transaction whose client walked away. An aborted HTTP request can no
  longer strand a lock.

The AI wrote the original and the fix. What settled it was looking at what the
database was actually doing rather than at what the code said it should do.

### 3. It suggested plpgsql for the claim. I chose TypeScript.

A stored procedure is genuinely harder to bypass. But the CHECK constraint and
the partial unique index already make the bad states unrepresentable, so the
procedure would only have protected against a caller that skipped the service —
and it would be harder to test and harder to talk through. Rejected, with the
reasoning written into `db/001_schema.sql` rather than left implicit.

### 4. Its accessibility audit lied to me twice, and I checked.

The first axe run reported zero violations. It was auditing the server-rendered
skeleton, because jsdom never hydrated — a clean result that meant nothing. Rerun
in a real browser: eleven violations.

A later run reported eleven contrast failures with foreground colours like
`#80808a` — not a token in the codebase. They were blends: axe was measuring
mid-fade, while the entrance animation was still running. The audit now waits
for opacity to settle, and the real numbers are 6.8:1 light and 7.4:1 dark.

Both times the tool was confidently wrong in a way that would have been easy to
paste into a README.

---

## What I would change about my AI workflow

**Ask "how would this fail?" before "does this pass?".**

Three of the four real bugs in this project were found by running something and
reading the output, not by reviewing code — the stranded lock, a race log where
every entry carried an identical timestamp (React batching, so all ten payments
appeared to land on the same millisecond), and a Postgres data directory living
inside the Next.js project root, whose constant WAL writes made the dev watcher
recompile in a loop and intermittently serve a 500 from a half-written manifest.

None of those are visible in a diff. I spent longer than I should have
reasoning about the code before instrumenting it, and the instrumentation took
two minutes each time.

I would also **fix the test harness before trusting the test results**. Several
early "failures" were my assertions being wrong, not the app: a badge that
legitimately renders its label twice (once visible, once for screen readers),
Playwright's `isDisabled()` honouring `aria-disabled`, and assertions racing a
refetch. Every one of those needed the same discipline as a production bug —
find out which side is wrong before changing anything.

---

## How I verified the final implementation

Nothing in this repo is claimed on the strength of having written it.

| Gate | Result |
|---|---|
| `npm test` — 24 integration tests vs real Postgres | 24/24 |
| `npm run verify` — 33 assertions over HTTP | 33/33 |
| `npm run qa` — 128 browser assertions, 20 suites | 128/128 |
| `npm run qa:a11y` — axe-core, light + dark + reduced motion | 0 violations |
| `npm run typecheck` / `lint` / `build` | clean |

**The concurrency claim specifically.** An eleven-way race is run five times per
suite run, and asserts three separate things: exactly one winner, every loser
rejected with `class_full`, and the denormalised counter matching the actual
count of confirmed rows. Exactly one `captured` payment attempt exists
afterwards.

**Mutation check.** A test that cannot fail proves nothing, so I removed `and
confirmed_count < capacity` from the seat claim and re-ran: 7 tests fail, and
Postgres rejects the write with `capacity_never_exceeded`, `Failing row contains
(cls_maths, ..., 4, 5)`. Both the test and the constraint have teeth.

**Constraints checked directly.** A script attempted to violate each invariant
in raw SQL — overbook a class, insert a duplicate active booking, reuse an
idempotency key, reference a missing student — and confirmed the exact
constraint name that rejected each one, plus the two cases the partial index
deliberately allows (re-booking after a failure, same child in another class).

**Where verification is thin, and I would rather say so:** there is no test for
the capture-failure compensating transaction, because the mock provider's
capture never fails. That path is written and reasoned about but not exercised.

### One more thing the AI got wrong, found by looking rather than reading

The seed created `confirmed` bookings with no rows in `payment_attempts`. Every
test passed, because no test asserted that a confirmed booking has a payment.
It only surfaced when a human opened one of those bookings and read the screen:
status **Confirmed**, payment history **"No payment has been attempted for this
booking yet."** The fixtures were shipping a state the running system cannot
produce, on the very page whose job is to prove money moved.

Fixed by deriving the captured attempt from the confirmed bookings in the seed
itself, so the two cannot disagree. Worth recording because it is the failure
mode of AI-written tests in general: they check the things the author thought
of, and the author and the test-writer were the same.
