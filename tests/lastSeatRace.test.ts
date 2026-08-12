import { beforeEach, describe, expect, it } from 'vitest';
import {
  attemptResults,
  bookingStatus,
  classState,
  confirmedRowCount,
  FIXTURE_STUDENTS,
  key,
  reseed,
  sql,
} from './helpers';
import { createBooking, payAndConfirm } from '@/server/bookingService';

/**
 * The headline suite.
 *
 * Every test here runs against a real PostgreSQL server over a pool wide enough
 * that the racers genuinely arrive together. The invariant is not "our code
 * checks capacity" - it is "the database will not let this class hold five
 * confirmed students, whatever the code does".
 */
describe('last-seat race', () => {
  beforeEach(reseed);

  it('is staged correctly by the seed: Mathematics has exactly one seat', async () => {
    const cls = await classState('cls_maths');
    expect(cls.confirmedCount).toBe(3);
    expect(cls.capacity).toBe(4);
  });

  it('the scenario from the brief: B pays first, A must not confirm', async () => {
    // Both parents reach payment. Neither booking holds a seat.
    const a = await createBooking('stu_aisha', 'cls_maths');
    const b = await createBooking('stu_bilal', 'cls_maths');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error('setup failed');

    // A's bank is slow. B pays instantly, mid-flight.
    const aPromise = payAndConfirm(a.data.id, key('a'), 'slow');
    await new Promise((r) => setTimeout(r, 300));
    const bResult = await payAndConfirm(b.data.id, key('b'), 'success');
    const aResult = await aPromise;

    expect(bResult.ok).toBe(true);
    expect(aResult.ok).toBe(false);
    if (aResult.ok) throw new Error('A should not have confirmed');
    expect(aResult.reason).toBe('class_full');

    // The payment step did not complete, so A lands on payment_failed - but
    // the reason says the seat went, not that the card bounced, and the money
    // was released rather than taken.
    const aStatus = await bookingStatus(a.data.id);
    expect(aStatus.status).toBe('payment_failed');
    expect(aStatus.failureReason).toBe('class_full');

    const aAttempts = await attemptResults(a.data.id);
    expect(aAttempts).toContain('voided');
    expect(aAttempts).not.toContain('captured');

    expect(await attemptResults(b.data.id)).toContain('captured');

    const cls = await classState('cls_maths');
    expect(cls.confirmedCount).toBe(cls.capacity);
  });

  it.each([1, 2, 3, 4, 5])(
    'run %i: eleven parents, one seat, exactly one winner',
    async () => {
      const before = await classState('cls_maths');
      const open = before.capacity - before.confirmedCount;
      expect(open).toBe(1);

      const bookings: string[] = [];
      for (const studentId of FIXTURE_STUDENTS) {
        const created = await createBooking(studentId, 'cls_maths');
        if (created.ok) bookings.push(created.data.id);
      }
      expect(bookings.length).toBe(11);

      // Everyone pays in the same tick.
      const results = await Promise.all(
        bookings.map((id) => payAndConfirm(id, key('race'), 'success')),
      );

      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);

      expect(winners).toHaveLength(open);
      expect(losers).toHaveLength(bookings.length - open);
      expect(losers.every((r) => !r.ok && r.reason === 'class_full')).toBe(true);

      // The counter and the rows must agree, and neither may exceed capacity.
      const after = await classState('cls_maths');
      expect(after.confirmedCount).toBe(after.capacity);
      expect(await confirmedRowCount('cls_maths')).toBe(after.capacity);

      /*
       * Money moved exactly once per seat - no more, no less.
       *
       * Counting only the racers' captures would miss the stronger claim: the
       * class holds four confirmed students and there are four captured
       * payments against it, including the three the seed created. A fifth
       * capture, or a confirmed booking with none, would both show up here.
       */
      const charged = await sql<{ count: string }[]>`
        select count(*) from payment_attempts pa
          join bookings b on b.id = pa.booking_id
         where b.trial_class_id = 'cls_maths'
           and b.status = 'confirmed'
           and pa.result = 'captured'
      `;
      expect(Number(charged[0].count)).toBe(after.confirmedCount);
    },
    30_000,
  );

  it('a class with three seats free lets exactly three racers through', async () => {
    // Physics starts at 1 of 4.
    const before = await classState('cls_physics');
    const open = before.capacity - before.confirmedCount;
    expect(open).toBe(3);

    const bookings: string[] = [];
    for (const studentId of FIXTURE_STUDENTS) {
      const created = await createBooking(studentId, 'cls_physics');
      if (created.ok) bookings.push(created.data.id);
    }

    const results = await Promise.all(
      bookings.map((id) => payAndConfirm(id, key('race3'), 'success')),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    const after = await classState('cls_physics');
    expect(after.confirmedCount).toBe(4);
    expect(await confirmedRowCount('cls_physics')).toBe(4);
  });

  it('the database refuses overbooking even if the claim is bypassed entirely', async () => {
    // Simulates a future code path that forgets the `confirmed_count < capacity`
    // guard. The application is not the last line of defence; the schema is.
    await expect(
      sql`update trial_classes set confirmed_count = capacity + 1 where id = 'cls_maths'`,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'capacity_never_exceeded' });
  });
});
