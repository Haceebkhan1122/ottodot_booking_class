import { beforeEach, describe, expect, it } from 'vitest';
import {
  attemptResults,
  bookingStatus,
  classState,
  confirmedRowCount,
  key,
  reseed,
  sql,
} from './helpers';
import {
  cancelBooking,
  createBooking,
  getRoster,
  payAndConfirm,
} from '@/server/bookingService';

describe('duplicate bookings', () => {
  beforeEach(reseed);

  it('refuses a second booking when one is already confirmed', async () => {
    // Ayesha is confirmed in Biology in the seed.
    const result = await createBooking('stu_ayesha', 'cls_biology');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toBe('duplicate_active_booking');
  });

  it('refuses a second booking when one is merely pending', async () => {
    const first = await createBooking('stu_bilal', 'cls_biology');
    expect(first.ok).toBe(true);

    const second = await createBooking('stu_bilal', 'cls_biology');
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('expected refusal');
    expect(second.reason).toBe('duplicate_active_booking');
  });

  it('allows a fresh booking after a declined card', async () => {
    const first = await createBooking('stu_aisha', 'cls_physics');
    if (!first.ok) throw new Error('setup failed');
    await payAndConfirm(first.data.id, key('d'), 'decline');

    // The failed row sits outside the partial unique index, so no cleanup is
    // needed before trying again.
    const second = await createBooking('stu_aisha', 'cls_physics');
    expect(second.ok).toBe(true);
  });

  it('survives two identical bookings created at the same instant', async () => {
    // The guard is the unique index, not a read-then-write, so there is no
    // window in which both requests see "no active booking".
    const [a, b] = await Promise.all([
      createBooking('stu_bilal', 'cls_biology'),
      createBooking('stu_bilal', 'cls_biology'),
    ]);

    const succeeded = [a, b].filter((r) => r.ok);
    expect(succeeded).toHaveLength(1);
    const refused = [a, b].find((r) => !r.ok);
    expect(refused && !refused.ok && refused.reason).toBe('duplicate_active_booking');
  });

  it('allows the same child in a different class', async () => {
    const result = await createBooking('stu_aisha', 'cls_physics');
    expect(result.ok).toBe(true);
  });
});

describe('payment failure', () => {
  beforeEach(reseed);

  it('never adds the child to the roster', async () => {
    const before = await classState('cls_physics');
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');

    const paid = await payAndConfirm(booking.data.id, key('f'), 'decline');
    expect(paid.ok).toBe(false);
    if (paid.ok) throw new Error('expected decline');
    expect(paid.reason).toBe('payment_declined');

    const after = await classState('cls_physics');
    expect(after.confirmedCount).toBe(before.confirmedCount);

    const status = await bookingStatus(booking.data.id);
    expect(status.status).toBe('payment_failed');
    expect(status.failureReason).toBe('payment_declined');

    const roster = await getRoster('cls_physics');
    expect(roster?.confirmed.some((e) => e.studentName === 'Aisha Iqbal')).toBe(false);

    // The attempt is recorded as declined, and nothing was captured.
    const attempts = await attemptResults(booking.data.id);
    expect(attempts).toEqual(['declined']);
  });

  it('leaves a declined booking visible to staff with its reason', async () => {
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');
    await payAndConfirm(booking.data.id, key('f2'), 'decline');

    const roster = await getRoster('cls_physics');
    const entry = roster?.otherBookings.find((b) => b.bookingId === booking.data.id);
    expect(entry?.status).toBe('payment_failed');
    expect(entry?.failureReason).toBe('payment_declined');
  });
});

describe('idempotency', () => {
  beforeEach(reseed);

  it('a replayed key does not take a second seat or charge twice', async () => {
    const before = await classState('cls_physics');
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');

    const k = key('idem');
    const first = await payAndConfirm(booking.data.id, k, 'success');
    const second = await payAndConfirm(booking.data.id, k, 'success');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const after = await classState('cls_physics');
    expect(after.confirmedCount).toBe(before.confirmedCount + 1);

    const attempts = await attemptResults(booking.data.id);
    expect(attempts.filter((r) => r === 'captured')).toHaveLength(1);
  });

  it('two simultaneous requests with the same key settle as one', async () => {
    // This is the double-click. Both requests are in flight before either has
    // written anything, so the check-then-insert cannot save us - the unique
    // index on idempotency_key does.
    const before = await classState('cls_physics');
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');

    const k = key('idem-race');
    const [a, b] = await Promise.all([
      payAndConfirm(booking.data.id, k, 'success'),
      payAndConfirm(booking.data.id, k, 'success'),
    ]);

    expect(a.ok && b.ok).toBe(true);

    const after = await classState('cls_physics');
    expect(after.confirmedCount).toBe(before.confirmedCount + 1);
    expect(await confirmedRowCount('cls_physics')).toBe(after.confirmedCount);

    const attempts = await attemptResults(booking.data.id);
    expect(attempts.filter((r) => r === 'captured')).toHaveLength(1);
  });
});

describe('cancellation', () => {
  beforeEach(reseed);

  it('returns the seat to the class', async () => {
    const before = await classState('cls_physics');
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');
    await payAndConfirm(booking.data.id, key('c'), 'success');

    expect((await classState('cls_physics')).confirmedCount).toBe(before.confirmedCount + 1);

    await cancelBooking(booking.data.id);

    const after = await classState('cls_physics');
    expect(after.confirmedCount).toBe(before.confirmedCount);
    expect(await confirmedRowCount('cls_physics')).toBe(after.confirmedCount);
  });

  it('two simultaneous cancels release exactly one seat', async () => {
    // Without the compare-and-swap on `status = 'confirmed'`, both would
    // decrement and the class would invent a seat out of nothing.
    const before = await classState('cls_physics');
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');
    await payAndConfirm(booking.data.id, key('c2'), 'success');

    await Promise.all([cancelBooking(booking.data.id), cancelBooking(booking.data.id)]);

    const after = await classState('cls_physics');
    expect(after.confirmedCount).toBe(before.confirmedCount);
  });

  it('cancelling a pending booking touches no counter', async () => {
    const before = await classState('cls_physics');
    const booking = await createBooking('stu_aisha', 'cls_physics');
    if (!booking.ok) throw new Error('setup failed');

    await cancelBooking(booking.data.id);

    expect((await classState('cls_physics')).confirmedCount).toBe(before.confirmedCount);
    expect((await bookingStatus(booking.data.id)).status).toBe('cancelled');
  });
});

describe('full and past classes', () => {
  beforeEach(reseed);

  it('refuses a booking for a class with no seats', async () => {
    // Aisha holds nothing, so the only thing that can refuse her is capacity.
    const result = await createBooking('stu_aisha', 'cls_chemistry');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toBe('class_full');
  });

  it('refuses a booking for a class that has already started', async () => {
    await sql`update trial_classes set starts_at = now() - interval '1 hour' where id = 'cls_physics'`;
    const result = await createBooking('stu_aisha', 'cls_physics');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected refusal');
    expect(result.reason).toBe('class_already_started');
  });

  it('reports an unknown class and an unknown student distinctly', async () => {
    const noClass = await createBooking('stu_aisha', 'cls_nope');
    const noStudent = await createBooking('stu_nope', 'cls_physics');
    expect(noClass.ok === false && noClass.reason).toBe('class_not_found');
    expect(noStudent.ok === false && noStudent.reason).toBe('student_not_found');
  });
});
