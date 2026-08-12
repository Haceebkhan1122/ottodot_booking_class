-- ============================================================================
-- Seed data
--
-- The brief asks for four situations to be demonstrable out of the box. Each
-- has a dedicated fixture:
--
--   a class with available seats     -> Physics       (1 of 4 confirmed)
--   a class with exactly 3 confirmed -> Mathematics   (the race stage)
--   a duplicate booking attempt      -> Ayesha already confirmed in Biology
--   a payment failure                -> Zara's declined booking in Physics
--
-- Sana Iqbal, the family the app opens on, deliberately holds no bookings, so
-- a reviewer never sees a booking they did not make.
--
-- A fifth, completely full class is included so the "no seats at all" path is
-- visible too.
--
-- Ids are readable so the API can be driven by hand:
--   curl -XPOST .../api/bookings -d '{"studentId":"stu_aisha","trialClassId":"cls_maths"}'
-- ============================================================================

truncate payment_attempts, bookings, trial_classes, students, parents restart identity cascade;

-- ----------------------------------------------------------------------------
-- Parents and children
-- ----------------------------------------------------------------------------
insert into parents (id, name, email, sort_order) values
  -- Sana opens the app and holds nothing. Everything below belongs to someone
  -- else, so the classes start part-full without any of it looking like hers.
  ('par_sana',     'Sana Iqbal',                       'sana.iqbal@example.com',    0),
  ('par_omar',     'Omar Farooq',                      'omar.farooq@example.com',  10),
  ('par_nadia',    'Nadia Rehman',                     'nadia.rehman@example.com', 20),
  ('par_imran',    'Imran Sheikh',                     'imran.sheikh@example.com', 30),
  ('par_fatima',   'Fatima Noor',                      'fatima.noor@example.com',  40),
  ('par_fixtures', 'Concurrency fixtures (demo only)', 'fixtures@example.com',     90);

insert into students (id, parent_id, name, grade) values
  ('stu_aisha',  'par_sana',   'Aisha Iqbal',   5),
  ('stu_bilal',  'par_sana',   'Bilal Iqbal',   4),
  ('stu_zara',   'par_omar',   'Zara Farooq',   5),
  ('stu_hamza',  'par_nadia',  'Hamza Rehman',  6),
  ('stu_ayesha', 'par_imran',  'Ayesha Sheikh', 5),
  ('stu_yusuf',  'par_fatima', 'Yusuf Noor',    4);

-- The automated race needs more competitors than the real families provide.
-- Ten parents fighting over one seat is a far sharper demonstration than two,
-- and every competitor must be a distinct child or the uniqueness rule rejects
-- them before the race even begins.
insert into students (id, parent_id, name, grade)
select 'stu_fixture_' || n, 'par_fixtures', 'Test Child ' || n, 5
from generate_series(1, 8) as n;

-- ----------------------------------------------------------------------------
-- Classes
--
-- confirmed_count is left at 0 here and derived from the bookings below, so the
-- seed cannot ship a counter that disagrees with its own rows.
-- ----------------------------------------------------------------------------
insert into trial_classes (id, subject, starts_at, capacity) values
  ('cls_physics',   'Physics - Forces and Motion',
   (date_trunc('day', now() at time zone 'UTC') + interval '2 days 15 hours') at time zone 'UTC', 4),
  ('cls_maths',     'Mathematics - Fractions in Real Life',
   (date_trunc('day', now() at time zone 'UTC') + interval '3 days 16 hours') at time zone 'UTC', 4),
  ('cls_biology',   'Biology - Cells and Living Things',
   (date_trunc('day', now() at time zone 'UTC') + interval '4 days 14 hours') at time zone 'UTC', 4),
  ('cls_chemistry', 'Chemistry - States of Matter',
   (date_trunc('day', now() at time zone 'UTC') + interval '5 days 15 hours') at time zone 'UTC', 4);

-- ----------------------------------------------------------------------------
-- Bookings
--
-- IMPORTANT: none of these belong to Sana Iqbal.
--
-- Sana is the family the app opens on, and she starts with nothing booked. An
-- earlier version spread the fixtures across every family including hers, and
-- the first thing a reviewer saw was "you already have a booking" for a class
-- they had never touched - the app appeared to be lying about its own state.
--
-- The classes still start part-full, because the other four families hold
-- those seats. Every case the brief asks for is still on screen; it just
-- belongs to somebody else, which is exactly how it would look in production.
-- ----------------------------------------------------------------------------
insert into bookings (id, student_id, trial_class_id, status, created_at, updated_at) values
  -- Physics: 1 of 4. Seats available.
  ('bkg_p1', 'stu_yusuf',  'cls_physics', 'confirmed', now() - interval '245 minutes', now() - interval '240 minutes'),

  -- Mathematics: exactly 3 of 4. This is the last-seat race stage.
  ('bkg_m1', 'stu_zara',   'cls_maths',   'confirmed', now() - interval '205 minutes', now() - interval '200 minutes'),
  ('bkg_m2', 'stu_hamza',  'cls_maths',   'confirmed', now() - interval '185 minutes', now() - interval '180 minutes'),
  ('bkg_m3', 'stu_ayesha', 'cls_maths',   'confirmed', now() - interval '95 minutes',  now() - interval '90 minutes'),

  -- Biology: 1 of 4. Ayesha is confirmed here, so trying to book her into this
  -- class again is refused - the duplicate case, without touching Sana.
  ('bkg_b1', 'stu_ayesha', 'cls_biology', 'confirmed', now() - interval '305 minutes', now() - interval '300 minutes'),

  -- Chemistry: completely full.
  ('bkg_c1', 'stu_zara',   'cls_chemistry', 'confirmed', now() - interval '405 minutes', now() - interval '400 minutes'),
  ('bkg_c2', 'stu_hamza',  'cls_chemistry', 'confirmed', now() - interval '395 minutes', now() - interval '390 minutes'),
  ('bkg_c3', 'stu_ayesha', 'cls_chemistry', 'confirmed', now() - interval '385 minutes', now() - interval '380 minutes'),
  ('bkg_c4', 'stu_yusuf',  'cls_chemistry', 'confirmed', now() - interval '375 minutes', now() - interval '370 minutes');

-- A historical payment failure. Note this row does NOT block Zara from booking
-- Physics again: failed bookings sit outside uniq_active_booking, which is what
-- makes retry-after-decline work with no cleanup.
insert into bookings (id, student_id, trial_class_id, status, failure_reason, created_at, updated_at)
values ('bkg_failed', 'stu_zara', 'cls_physics', 'payment_failed', 'payment_declined',
        now() - interval '60 minutes', now() - interval '59 minutes');

insert into payment_attempts (id, booking_id, idempotency_key, amount_cents, result, provider_ref, created_at)
values ('pay_seed_failed', 'bkg_failed', 'pay_bkg_failed_seed', 2500, 'declined',
        'mock_auth_seed_declined', now() - interval '59 minutes');

-- ----------------------------------------------------------------------------
-- Every confirmed booking gets the payment that confirmed it.
--
-- Without this the seed ships a contradiction: bookings marked `confirmed`
-- whose payment history reads "no payment has been attempted". A reviewer
-- opening one sees a seat that was apparently never paid for, and the audit
-- trail the rest of this system leans on looks optional.
--
-- A booking cannot reach `confirmed` at runtime without a captured attempt, so
-- the fixtures must not be able to either.
-- ----------------------------------------------------------------------------
insert into payment_attempts (booking_id, idempotency_key, amount_cents, result, provider_ref, created_at)
select b.id,
       'pay_seed_' || b.id,
       2500,
       'captured',
       'mock_auth_seed_' || b.id,
       b.updated_at
  from bookings b
 where b.status = 'confirmed';

-- ----------------------------------------------------------------------------
-- Derive the counters from the rows they describe.
--
-- If this ever disagrees with capacity, capacity_never_exceeded aborts the
-- seed rather than letting a broken fixture into the database.
-- ----------------------------------------------------------------------------
update trial_classes c
   set confirmed_count = (
     select count(*) from bookings b
      where b.trial_class_id = c.id and b.status = 'confirmed'
   );
