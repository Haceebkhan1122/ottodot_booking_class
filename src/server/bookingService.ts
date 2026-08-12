import 'server-only';
import { TRIAL_PRICE_CENTS } from '@/constants';
import { getErrorMessage } from '@/helpers/errorMessages';
import { isPgError, pgConstraint, PG_ERROR, sql } from './db';
import { authorize, capture, voidAuthorization } from './paymentProvider';
import {
  toBooking,
  toPaymentAttempt,
  toStudent,
  toTrialClass,
  type BookingRow,
  type ParentRow,
  type PaymentAttemptRow,
  type StudentRow,
  type TrialClassRow,
} from './rows';
import type {
  Booking,
  BookingDetail,
  FailureDetails,
  FailureReason,
  MutationResult,
  Parent,
  PaymentOutcome,
  Roster,
  TrialClass,
} from '@/types';

/**
 * Booking service - the only module allowed to change booking state.
 *
 * The rules it enforces are not really enforced here. They are enforced by the
 * schema: `capacity_never_exceeded`, `uniq_active_booking`, and the unique
 * index on `idempotency_key`. This layer's job is to work with those
 * constraints rather than around them, and to turn the errors they raise into
 * something a parent can read.
 */

function fail<T>(
  reason: FailureReason,
  details?: FailureDetails,
): MutationResult<T> {
  return { ok: false, reason, message: getErrorMessage(reason), ...(details ? { details } : {}) };
}

function ok<T>(data: T): MutationResult<T> {
  return { ok: true, data };
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export async function listParents(): Promise<Parent[]> {
  const [parents, students] = await Promise.all([
    // The seed states this order deliberately - see `sort_order` in the
    // schema. Sorting by name instead put a family that holds seeded bookings
    // at the top, and the app opened showing a booking the reviewer never made.
    sql<ParentRow[]>`select id, name, email from parents order by sort_order, name`,
    sql<StudentRow[]>`select id, parent_id, name, grade from students order by name`,
  ]);

  return parents.map((parent) => ({
    id: parent.id,
    name: parent.name,
    email: parent.email,
    students: students.filter((s) => s.parentId === parent.id).map(toStudent),
  }));
}

export async function listClasses(): Promise<TrialClass[]> {
  const rows = await sql<TrialClassRow[]>`
    select id, subject, starts_at, capacity, confirmed_count
      from trial_classes
     order by starts_at
  `;
  return rows.map(toTrialClass);
}

export async function getClass(classId: string): Promise<TrialClass | null> {
  const [row] = await sql<TrialClassRow[]>`
    select id, subject, starts_at, capacity, confirmed_count
      from trial_classes
     where id = ${classId}
  `;
  return row ? toTrialClass(row) : null;
}

export async function getBookingDetail(bookingId: string): Promise<BookingDetail | null> {
  const [booking] = await sql<BookingRow[]>`
    select id, student_id, trial_class_id, status, failure_reason, created_at, updated_at
      from bookings
     where id = ${bookingId}
  `;
  if (!booking) return null;

  const [[student], [trialClass], attempts] = await Promise.all([
    sql<(StudentRow & ParentRow & { parentName: string; parentEmail: string })[]>`
      select s.id, s.parent_id, s.name, s.grade,
             p.name as parent_name, p.email as parent_email
        from students s
        join parents p on p.id = s.parent_id
       where s.id = ${booking.studentId}
    `,
    sql<TrialClassRow[]>`
      select id, subject, starts_at, capacity, confirmed_count
        from trial_classes where id = ${booking.trialClassId}
    `,
    sql<PaymentAttemptRow[]>`
      select id, booking_id, idempotency_key, amount_cents, result, provider_ref, created_at
        from payment_attempts
       where booking_id = ${bookingId}
       order by created_at, id
    `,
  ]);

  if (!student || !trialClass) return null;

  return {
    ...toBooking(booking),
    student: toStudent(student),
    parent: { id: student.parentId, name: student.parentName, email: student.parentEmail },
    trialClass: toTrialClass(trialClass),
    paymentAttempts: attempts.map(toPaymentAttempt),
  };
}

export async function getRoster(classId: string): Promise<Roster | null> {
  const trialClass = await getClass(classId);
  if (!trialClass) return null;

  const [confirmed, others] = await Promise.all([
    sql<
      {
        bookingId: string;
        studentId: string;
        studentName: string;
        grade: number;
        parentName: string;
        parentEmail: string;
        confirmedAt: Date;
      }[]
    >`
      select b.id            as booking_id,
             s.id            as student_id,
             s.name          as student_name,
             s.grade         as grade,
             p.name          as parent_name,
             p.email         as parent_email,
             b.updated_at    as confirmed_at
        from bookings b
        join students s on s.id = b.student_id
        join parents  p on p.id = s.parent_id
       where b.trial_class_id = ${classId}
         and b.status = 'confirmed'
       order by b.updated_at, b.id
    `,
    sql<
      {
        bookingId: string;
        studentId: string;
        studentName: string;
        status: Booking['status'];
        failureReason: FailureReason | null;
      }[]
    >`
      select b.id     as booking_id,
             s.id     as student_id,
             s.name   as student_name,
             b.status as status,
             b.failure_reason as failure_reason
        from bookings b
        join students s on s.id = b.student_id
       where b.trial_class_id = ${classId}
         and b.status <> 'confirmed'
       order by b.updated_at desc, b.id
    `,
  ]);

  return {
    trialClass,
    confirmed: confirmed.map((row) => ({
      bookingId: row.bookingId,
      studentId: row.studentId,
      studentName: row.studentName,
      grade: row.grade,
      parentName: row.parentName,
      parentEmail: row.parentEmail,
      confirmedAt: row.confirmedAt.toISOString(),
    })),
    otherBookings: others,
  };
}

/**
 * The active booking a child already holds for a class, if any.
 *
 * "Active" is exactly the set the partial unique index covers -
 * `pending_payment` or `confirmed` - so this answers the same question the
 * index does, and cannot disagree with it.
 */
async function findActiveBooking(
  studentId: string,
  classId: string,
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select id from bookings
     where student_id = ${studentId}
       and trial_class_id = ${classId}
       and status in ('pending_payment', 'confirmed')
     limit 1
  `;
  return row?.id ?? null;
}

/**
 * Every active booking a child holds, keyed by class.
 *
 * The class list uses this to offer "Finish booking" instead of "Book", so a
 * parent who abandoned a checkout is walked back to it rather than shown a
 * refusal they cannot act on.
 */
export async function listActiveBookingsForStudent(
  studentId: string,
): Promise<Array<{ bookingId: string; trialClassId: string; status: Booking['status'] }>> {
  const rows = await sql<
    { id: string; trialClassId: string; status: Booking['status'] }[]
  >`
    select id, trial_class_id, status
      from bookings
     where student_id = ${studentId}
       and status in ('pending_payment', 'confirmed')
  `;
  return rows.map((r) => ({
    bookingId: r.id,
    trialClassId: r.trialClassId,
    status: r.status,
  }));
}

/* ------------------------------------------------------------------ */
/* Create booking                                                      */
/* ------------------------------------------------------------------ */

export async function createBooking(
  studentId: string,
  classId: string,
): Promise<MutationResult<Booking>> {
  const [student] = await sql`select 1 from students where id = ${studentId}`;
  if (!student) return fail('student_not_found');

  const [trialClass] = await sql<TrialClassRow[]>`
    select id, subject, starts_at, capacity, confirmed_count
      from trial_classes where id = ${classId}
  `;
  if (!trialClass) return fail('class_not_found');
  if (trialClass.startsAt.getTime() <= Date.now()) return fail('class_already_started');

  /*
   * Advisory capacity check, not a guarantee.
   *
   * A pending booking reserves nothing - that is the decision that makes the
   * last-seat race possible at all. This only avoids sending a parent to a
   * payment screen for a class that is already visibly full. Between this read
   * and the confirm call the class can fill up, and that is handled where it
   * matters, in `payAndConfirm`.
   */
  if (trialClass.capacity - trialClass.confirmedCount <= 0) return fail('class_full');

  try {
    const [row] = await sql<BookingRow[]>`
      insert into bookings (student_id, trial_class_id, status)
      values (${studentId}, ${classId}, 'pending_payment')
      returning id, student_id, trial_class_id, status, failure_reason, created_at, updated_at
    `;
    return ok(toBooking(row));
  } catch (error) {
    /*
     * The duplicate check is the index, not an `if` above it.
     *
     * Reading first and then inserting would leave a window in which two
     * requests both see "no active booking" and both insert. Letting the
     * unique index decide removes the window entirely - we just have to
     * translate its error.
     */
    if (
      isPgError(error, PG_ERROR.UNIQUE_VIOLATION) &&
      pgConstraint(error) === 'uniq_active_booking'
    ) {
      /*
       * Hand back the booking that blocked this one.
       *
       * Without it the parent is stuck: the uniqueness rule covers pending
       * bookings, so an abandoned checkout locks the child out of that class
       * forever, and "open the existing booking" is advice with nowhere to go.
       */
      const existing = await findActiveBooking(studentId, classId);
      return fail('duplicate_active_booking', existing ? { bookingId: existing } : undefined);
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* The seat claim - the one critical section in the system             */
/* ------------------------------------------------------------------ */

type SettleOutcome =
  | { kind: 'confirmed' }
  | { kind: 'replayed' }
  | { kind: 'rejected'; reason: FailureReason };

/**
 * Everything that must happen atomically once the bank has said yes.
 *
 * One transaction covers: the idempotency check, the booking state flip, the
 * seat claim, and the payment record. Split across two transactions, a crash
 * in between could leave a booking confirmed with no seat counted, or a seat
 * counted for a booking that never confirmed.
 *
 * Note what is NOT in here: the calls to the payment provider. Those are
 * network calls, and holding a row lock across the open internet is how a
 * booking system stops responding because someone else's gateway is having a
 * bad day.
 */
async function settleConfirmation(
  bookingId: string,
  idempotencyKey: string,
  providerRef: string,
): Promise<SettleOutcome> {
  try {
    return await sql.begin(async (tx): Promise<SettleOutcome> => {
      // [1] Replay of an attempt we already recorded.
      const [seen] = await tx`
        select 1 from payment_attempts where idempotency_key = ${idempotencyKey}
      `;
      if (seen) return { kind: 'replayed' };

      /*
       * [2] Take ownership of the booking with a compare-and-swap.
       *
       * `and status = 'pending_payment'` is the whole guard. Exactly one
       * transaction can move a booking out of that state, so two concurrent
       * confirms of the SAME booking - a double click that dodged the
       * idempotency key - cannot both proceed.
       *
       * An earlier version used `select ... for update` instead. It was also
       * correct, but it held a row lock across every following statement, and
       * when a request died mid-transaction the lock outlived it and blocked
       * the next database reset indefinitely. A conditional UPDATE gives the
       * same mutual exclusion while holding locks for the shortest possible
       * window.
       */
      const [owned] = await tx<{ trialClassId: string }[]>`
        update bookings
           set status = 'confirmed', failure_reason = null, updated_at = now()
         where id = ${bookingId}
           and status = 'pending_payment'
        returning trial_class_id
      `;

      if (!owned) {
        const [existing] = await tx<{ status: Booking['status'] }[]>`
          select status from bookings where id = ${bookingId}
        `;
        if (!existing) return { kind: 'rejected', reason: 'booking_not_found' };
        if (existing.status === 'confirmed') return { kind: 'replayed' };
        return { kind: 'rejected', reason: 'invalid_state' };
      }

      /*
       * [3] THE SEAT CLAIM.
       *
       * One statement. Postgres takes a row lock on the class for the duration
       * of the UPDATE, so every concurrent caller is serialised by the database
       * and each re-evaluates `confirmed_count < capacity` against the
       * committed value. Zero rows affected means somebody else got there
       * first.
       *
       * The naive version - SELECT the count, compare it in TypeScript, then
       * UPDATE - is the bug this whole exercise is about: two requests read
       * "3 of 4" and both write "4 of 4".
       */
      const claimed = await tx`
        update trial_classes
           set confirmed_count = confirmed_count + 1
         where id = ${owned.trialClassId}
           and confirmed_count < capacity
      `;

      if (claimed.count === 0) {
        /*
         * The payment step did not complete, so the booking lands on
         * `payment_failed` - the same place a declined card lands.
         *
         * `cancelled` is reserved for a human deciding to cancel. Using it here
         * too would give one status two meanings, which is the overloading this
         * model exists to avoid. What actually differs is *why*, and that is
         * `failure_reason`: 'class_full' rather than 'payment_declined'. The UI
         * reads it and says "Seat taken - your card was fine", never "check
         * your card".
         */
        await tx`
          update bookings
             set status = 'payment_failed',
                 failure_reason = 'class_full',
                 updated_at = now()
           where id = ${bookingId}
        `;
        await tx`
          insert into payment_attempts (booking_id, idempotency_key, amount_cents, result, provider_ref)
          values (${bookingId}, ${idempotencyKey}, ${TRIAL_PRICE_CENTS}, 'voided', ${providerRef})
        `;
        return { kind: 'rejected', reason: 'class_full' };
      }

      // 'authorized', not 'captured' - the money has not moved yet. It is
      // upgraded to 'captured' only after the provider confirms the capture.
      await tx`
        insert into payment_attempts (booking_id, idempotency_key, amount_cents, result, provider_ref)
        values (${bookingId}, ${idempotencyKey}, ${TRIAL_PRICE_CENTS}, 'authorized', ${providerRef})
      `;

      return { kind: 'confirmed' };
    });
  } catch (error) {
    // Two requests carrying the same key can both pass the check in [2] and
    // race to the insert. The unique index breaks the tie; the loser is a
    // replay, which is exactly what the key is for.
    if (isPgError(error, PG_ERROR.UNIQUE_VIOLATION)) return { kind: 'replayed' };

    // Reaching capacity_never_exceeded means the conditional UPDATE above was
    // bypassed. That is a bug, not a business outcome, and it should be loud.
    if (isPgError(error, PG_ERROR.CHECK_VIOLATION)) {
      throw new Error(
        `Overbooking was attempted for booking ${bookingId} and the database refused it. ` +
          'The seat claim has been bypassed somewhere - this is a bug.',
        { cause: error },
      );
    }
    throw error;
  }
}

async function markBookingFailed(bookingId: string, reason: FailureReason): Promise<void> {
  await sql`
    update bookings
       set status = 'payment_failed', failure_reason = ${reason}, updated_at = now()
     where id = ${bookingId}
  `;
}

async function recordAttempt(
  bookingId: string,
  idempotencyKey: string,
  result: 'authorized' | 'captured' | 'declined' | 'voided',
  providerRef: string | null,
): Promise<void> {
  await sql`
    insert into payment_attempts (booking_id, idempotency_key, amount_cents, result, provider_ref)
    values (${bookingId}, ${idempotencyKey}, ${TRIAL_PRICE_CENTS}, ${result}, ${providerRef})
    on conflict (idempotency_key) do nothing
  `;
}

/* ------------------------------------------------------------------ */
/* Pay and confirm - the orchestration                                 */
/* ------------------------------------------------------------------ */

/**
 * Order of operations, and why:
 *
 *   1. authorise            money earmarked, nothing moved
 *   2. claim the seat       atomic, no network call inside
 *   3a. won  -> capture     take the money
 *   3b. lost -> void        release the earmark, charge nothing
 *
 * Seat first, money second. Money is refundable and a seat is not: a child
 * arriving at a class with no chair is a worse failure than a refund, so the
 * scarce resource is settled before the recoverable one - and the parent who
 * loses the race is never charged, so there is no refund to chase.
 */
export async function payAndConfirm(
  bookingId: string,
  idempotencyKey: string,
  outcome: PaymentOutcome,
): Promise<MutationResult<BookingDetail>> {
  const returnDetail = async (): Promise<MutationResult<BookingDetail>> => {
    const detail = await getBookingDetail(bookingId);
    return detail ? ok(detail) : fail('booking_not_found');
  };

  // [0] Cheap pre-checks before touching the payment provider.
  const [seen] = await sql`
    select 1 from payment_attempts where idempotency_key = ${idempotencyKey}
  `;
  if (seen) return returnDetail();

  const [booking] = await sql<{ status: Booking['status'] }[]>`
    select status from bookings where id = ${bookingId}
  `;
  if (!booking) return fail('booking_not_found');
  if (booking.status === 'confirmed') return returnDetail();
  if (booking.status !== 'pending_payment') return fail('invalid_state');

  // [1] Authorise. Slow on request, which is how the last-seat race is
  //     reproduced by hand in a browser.
  const auth = await authorize(TRIAL_PRICE_CENTS, outcome);

  if (!auth.ok) {
    await markBookingFailed(bookingId, 'payment_declined');
    await recordAttempt(bookingId, idempotencyKey, 'declined', auth.providerRef);
    return fail('payment_declined');
  }

  // [2] Claim the seat. Everything read before this line is stale.
  const settled = await settleConfirmation(bookingId, idempotencyKey, auth.providerRef);

  if (settled.kind === 'rejected') {
    await voidAuthorization(auth.providerRef);
    return fail(settled.reason);
  }

  if (settled.kind === 'replayed') {
    await voidAuthorization(auth.providerRef);
    return returnDetail();
  }

  // [3] The seat is ours - now take the money.
  const captured = await capture(auth.providerRef);

  if (!captured.ok) {
    /*
     * Capture failed after the seat was taken: we are holding a seat we were
     * not paid for. The compensating transaction gives it back.
     *
     * This is the one window the design does not fully close. A process crash
     * between the commit above and this point leaves an `authorized` attempt
     * with no capture and a seat that is held but unpaid. The fix is a
     * reconciliation job sweeping `authorized` rows older than a few minutes;
     * it is written up in the README rather than hidden.
     */
    await sql.begin(async (tx) => {
      await tx`
        update trial_classes c
           set confirmed_count = greatest(0, c.confirmed_count - 1)
          from bookings b
         where b.id = ${bookingId} and c.id = b.trial_class_id and b.status = 'confirmed'
      `;
      await tx`
        update bookings
           set status = 'payment_failed', failure_reason = 'payment_declined', updated_at = now()
         where id = ${bookingId}
      `;
      await tx`
        update payment_attempts
           set result = 'voided'
         where idempotency_key = ${idempotencyKey}
      `;
    });
    return fail('payment_declined');
  }

  await sql`
    update payment_attempts set result = 'captured' where idempotency_key = ${idempotencyKey}
  `;

  return returnDetail();
}

/* ------------------------------------------------------------------ */
/* Cancel                                                              */
/* ------------------------------------------------------------------ */

export async function cancelBooking(bookingId: string): Promise<MutationResult<Booking>> {
  const result = await sql.begin(async (tx) => {
    /*
     * Two compare-and-swaps rather than a read-then-write.
     *
     * The first matches ONLY a confirmed booking, so exactly one transaction
     * can ever observe "this booking was holding a seat" and therefore exactly
     * one can give the seat back. Two people hitting cancel at the same moment
     * cannot both decrement - which would invent capacity out of nothing.
     */
    const [released] = await tx<{ trialClassId: string }[]>`
      update bookings
         set status = 'cancelled', updated_at = now()
       where id = ${bookingId}
         and status = 'confirmed'
      returning trial_class_id
    `;

    if (released) {
      await tx`
        update trial_classes
           set confirmed_count = greatest(0, confirmed_count - 1)
         where id = ${released.trialClassId}
      `;
    } else {
      // Not confirmed: pending, failed, or already cancelled. Close it out,
      // but touch no counter - it was never holding a seat.
      await tx`
        update bookings
           set status = 'cancelled', updated_at = now()
         where id = ${bookingId}
           and status <> 'cancelled'
      `;
    }

    const [row] = await tx<BookingRow[]>`
      select id, student_id, trial_class_id, status, failure_reason, created_at, updated_at
        from bookings where id = ${bookingId}
    `;

    return row ? toBooking(row) : null;
  });

  return result ? ok(result) : fail('booking_not_found');
}
