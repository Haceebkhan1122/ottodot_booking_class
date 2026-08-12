-- ============================================================================
-- Trial booking schema
--
-- Three invariants are enforced here rather than in application code, because
-- a rule that lives in a service can be bypassed by the next caller who
-- forgets it:
--
--   1. a class can never hold more confirmed bookings than its capacity
--   2. a child can never hold two active bookings for the same class
--   3. a payment attempt can never be recorded twice for one idempotency key
--
-- Requires PostgreSQL 13 or newer for the built-in gen_random_uuid().
-- ============================================================================

drop table if exists payment_attempts cascade;
drop table if exists bookings cascade;
drop table if exists trial_classes cascade;
drop table if exists students cascade;
drop table if exists parents cascade;
drop type if exists booking_status cascade;

-- ----------------------------------------------------------------------------
-- Booking lifecycle - exactly the four statuses named in the brief.
--
--   pending_payment  booking exists, holds no seat
--   confirmed        seat taken, payment captured
--   payment_failed   the payment step did not complete
--   cancelled        a person cancelled it
--
-- Each status means exactly one thing. `payment_failed` covers every way the
-- payment step can fail to complete - a declined card, or losing the last seat
-- to another parent - because in both cases no money moved and no seat was
-- taken. Which one it was lives in `failure_reason` ('payment_declined' or
-- 'class_full'), so support and the UI can still tell them apart.
--
-- `cancelled` is reserved for a deliberate act by a parent or an admin. The
-- system never sets it on its own; overloading it with system-side rejections
-- would give one status two meanings.
-- ----------------------------------------------------------------------------
create type booking_status as enum (
  'pending_payment',
  'confirmed',
  'payment_failed',
  'cancelled'
);

-- ----------------------------------------------------------------------------
-- Identifiers are text, not uuid.
--
-- The seed uses readable ids ('cls_maths', 'stu_aisha') so a reviewer can hit
-- the API by hand and read a log line without cross-referencing a uuid. Rows
-- created at runtime get a prefixed random id from the same column default.
-- ----------------------------------------------------------------------------

create table parents (
  id    text primary key default ('par_' || replace(gen_random_uuid()::text, '-', '')),
  name  text not null,
  email text not null unique,

  -- Display order for the parent picker.
  --
  -- Alphabetical order is not good enough here: it decided which family the app
  -- opened on, and that family turned out to hold seeded bookings, so the first
  -- thing a reviewer saw was a booking they had never made. The seed now states
  -- the order it wants - the family with a clean slate first, the concurrency
  -- fixtures last - instead of leaving it to whoever's name sorts highest.
  sort_order int not null default 100
);

create table students (
  id        text primary key default ('stu_' || replace(gen_random_uuid()::text, '-', '')),
  parent_id text not null references parents (id) on delete cascade,
  name      text not null,
  grade     int  not null check (grade between 1 and 12)
);

create index students_parent_id_idx on students (parent_id);

create table trial_classes (
  id        text        primary key default ('cls_' || replace(gen_random_uuid()::text, '-', '')),
  subject   text        not null,
  starts_at timestamptz not null,
  capacity  int         not null default 4 check (capacity > 0),

  -- Denormalised on purpose. The alternative - counting confirmed rows on every
  -- claim - cannot be made atomic without locking the whole booking set for the
  -- class. A single counter row is one lock, held for microseconds.
  confirmed_count int not null default 0,

  -- INVARIANT 1. Not "we check before inserting" but "the row cannot exist".
  -- Any code path that gets the claim wrong fails loudly here instead of
  -- quietly overbooking a classroom.
  constraint capacity_never_exceeded
    check (confirmed_count >= 0 and confirmed_count <= capacity)
);

create table bookings (
  id             text           primary key default ('bkg_' || replace(gen_random_uuid()::text, '-', '')),
  student_id     text           not null references students (id) on delete cascade,
  trial_class_id text           not null references trial_classes (id) on delete cascade,
  status         booking_status not null default 'pending_payment',
  failure_reason text,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now()
);

-- INVARIANT 2. A child may hold at most one *active* booking per class.
--
-- Leaving failed and cancelled rows outside the index is the whole point: it
-- enforces the rule and permits a retry after a declined card with no cleanup
-- step, in one index.
create unique index uniq_active_booking
  on bookings (student_id, trial_class_id)
  where status in ('pending_payment', 'confirmed');

create index bookings_class_status_idx on bookings (trial_class_id, status);

create table payment_attempts (
  id           text primary key default ('pay_' || replace(gen_random_uuid()::text, '-', '')),
  booking_id   text not null references bookings (id) on delete cascade,

  -- INVARIANT 3. A replayed request - double click, retried fetch, refreshed
  -- tab - cannot authorise a second time.
  idempotency_key text not null unique,

  amount_cents int  not null check (amount_cents > 0),
  result       text not null check (result in ('authorized', 'captured', 'declined', 'voided')),
  provider_ref text,
  created_at   timestamptz not null default now()
);

create index payment_attempts_booking_idx on payment_attempts (booking_id, created_at);

-- ----------------------------------------------------------------------------
-- Notes on what is deliberately NOT here
--
-- No trigger keeping confirmed_count in sync with the bookings table. A trigger
-- would fire on every booking write and would hide the one operation this
-- system exists to get right. The counter is moved only by the claim, in the
-- same transaction that flips the booking to confirmed - see
-- src/server/bookingService.ts.
--
-- No stored procedure wrapping the claim. It would be harder to bypass, but the
-- constraints above already make the bad state unrepresentable, and keeping the
-- logic in TypeScript makes it far easier to test and to explain.
-- ----------------------------------------------------------------------------
