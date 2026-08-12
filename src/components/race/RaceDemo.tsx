'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SeatMeter } from '@/components/classes/SeatMeter';
import { RaceLane, type LaneState } from './RaceLane';
import { RaceLog, type RaceLogEntry } from './RaceLog';

import { useApiResource } from '@/hooks/useApiResource';
import {
  createBooking,
  fetchClasses,
  fetchParents,
  fetchRoster,
  payBooking,
  resetDemoData,
} from '@/apiservice/bookingApi';
import { toApiError } from '@/apiservice/axiosInstance';
import { createIdempotencyKey } from '@/utils/idempotency';
import { getSeatPresentation } from '@/helpers/seats';
import { RACE_DEMO_CONCURRENCY } from '@/constants';
import type { PaymentOutcome, Student } from '@/types';

const EMPTY_LANE: LaneState = {
  bookingId: null,
  status: null,
  failureReason: null,
  outcome: 'success',
  studentId: null,
  isWorking: false,
  note: null,
};

/**
 * Reproduces the last-seat race from the brief, both by hand and automatically.
 *
 * The manual lanes exist because the scenario is a sequence, not a single
 * event: A picks the seat, B picks the same seat, B pays first, A pays second.
 * Firing ten requests at once proves the invariant holds, but it does not show
 * the ordering that makes the problem interesting - so this page does both.
 */
export function RaceDemo() {
  const classesQuery = useApiResource((signal) => fetchClasses(signal), []);
  const parentsQuery = useApiResource((signal) => fetchParents(signal), []);

  const [classId, setClassId] = useState<string | null>(null);
  const [laneA, setLaneA] = useState<LaneState>(EMPTY_LANE);
  const [laneB, setLaneB] = useState<LaneState>(EMPTY_LANE);
  const [log, setLog] = useState<RaceLogEntry[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const [isAutoRacing, setIsAutoRacing] = useState(false);

  const startedAtRef = useRef<number>(0);
  const logCounter = useRef(0);

  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);
  const allStudents: Student[] = useMemo(
    () => (parentsQuery.data ?? []).flatMap((p) => p.students),
    [parentsQuery.data],
  );

  const trialClass = classes.find((c) => c.id === classId) ?? null;

  // Default to the class the seed leaves with exactly one seat - that is the
  // whole point of the fixture, and hunting for it by hand wastes demo time.
  useEffect(() => {
    if (classId || classes.length === 0) return;
    const lastSeat = classes.find((c) => c.seatsRemaining === 1);
    setClassId((lastSeat ?? classes[0]).id);
  }, [classes, classId]);

  /*
   * Default the two lanes to children who are not already in the contested
   * class.
   *
   * Picking blindly from the top of the list breaks the demo: the seed puts
   * three children in Mathematics precisely to leave one seat, so the obvious
   * defaults are often exactly the ones the uniqueness rule will reject. The
   * reviewer would press "Create booking" and get a duplicate error instead of
   * a race.
   */
  const rosterQuery = useApiResource(
    (signal) => (classId ? fetchRoster(classId, signal) : Promise.resolve(null)),
    [classId],
  );

  const eligibleStudents = useMemo(() => {
    const taken = new Set(
      (rosterQuery.data?.confirmed ?? []).map((entry) => entry.studentId),
    );
    const free = allStudents.filter((s) => !taken.has(s.id));
    return free.length >= 2 ? free : allStudents;
  }, [allStudents, rosterQuery.data]);

  useEffect(() => {
    if (eligibleStudents.length === 0) return;
    setLaneA((prev) =>
      prev.bookingId ? prev : { ...prev, studentId: eligibleStudents[0].id },
    );
    setLaneB((prev) =>
      prev.bookingId ? prev : { ...prev, studentId: eligibleStudents[1]?.id ?? null },
    );
  }, [eligibleStudents]);

  const addLog = useCallback((actor: string, message: string, tone: RaceLogEntry['tone']) => {
    if (startedAtRef.current === 0) startedAtRef.current = performance.now();
    logCounter.current += 1;

    /*
     * The id and timestamp are built HERE, not inside the state updater.
     *
     * React batches the ten or so `addLog` calls that a race produces into one
     * render pass, and runs every updater afterwards. An updater that reads
     * `logCounter.current` therefore sees the value *after* all the increments
     * - so every entry in the batch gets the same id and the same timestamp.
     * The first version of this did exactly that: React warned about duplicate
     * keys and the log claimed all ten payments landed on the same
     * millisecond, which is precisely the detail this page exists to show.
     */
    const entry: RaceLogEntry = {
      id: `log_${logCounter.current}`,
      atMs: Math.round(performance.now() - startedAtRef.current),
      actor,
      message,
      tone,
    };

    setLog((prev) => [...prev, entry]);
  }, []);

  const setLane = (lane: 'a' | 'b') => (lane === 'a' ? setLaneA : setLaneB);

  /* ---------------------------------------------------------------- */
  /* Manual lanes                                                      */
  /* ---------------------------------------------------------------- */

  async function handleCreate(lane: 'a' | 'b') {
    const state = lane === 'a' ? laneA : laneB;
    const update = setLane(lane);
    const actor = lane === 'a' ? 'Parent A' : 'Parent B';

    if (!state.studentId || !classId) return;

    update((prev) => ({ ...prev, isWorking: true, note: null }));
    addLog(actor, 'creating booking (holds no seat)…', 'info');

    try {
      const booking = await createBooking({
        studentId: state.studentId,
        trialClassId: classId,
      });

      update((prev) => ({
        ...prev,
        bookingId: booking.id,
        status: booking.status,
        failureReason: null,
        isWorking: false,
        note: 'Booking created and waiting for payment. No seat is reserved.',
      }));
      addLog(actor, `booking created · status=${booking.status}`, 'info');
    } catch (caught) {
      const error = toApiError(caught);
      update((prev) => ({ ...prev, isWorking: false, note: error.message }));
      addLog(actor, `create refused · ${error.reason}`, 'lose');
    }
  }

  async function handlePay(lane: 'a' | 'b', state?: LaneState) {
    state = state ?? (lane === 'a' ? laneA : laneB);
    const update = setLane(lane);
    const actor = lane === 'a' ? 'Parent A' : 'Parent B';

    if (!state.bookingId) return;

    update((prev) => ({ ...prev, isWorking: true, note: null }));
    addLog(
      actor,
      state.outcome === 'slow' ? 'authorising (slow bank, 3s)…' : 'authorising…',
      'info',
    );

    try {
      const settled = await payBooking({
        bookingId: state.bookingId,
        idempotencyKey: createIdempotencyKey(state.bookingId),
        outcome: state.outcome,
      });

      update((prev) => ({
        ...prev,
        status: settled.status,
        failureReason: null,
        isWorking: false,
        note: 'Seat claimed and payment captured.',
      }));
      addLog(actor, 'WON the seat · confirmed, payment captured', 'win');
    } catch (caught) {
      const error = toApiError(caught);

      update((prev) => ({
        ...prev,
        status: 'payment_failed',
        failureReason: error.reason,
        isWorking: false,
        note: error.message,
      }));

      addLog(
        actor,
        error.reason === 'class_full'
          ? 'LOST the seat · card was fine, authorisation voided, nothing charged'
          : `payment failed · ${error.reason}`,
        'lose',
      );
    } finally {
      void classesQuery.refetch();
      void rosterQuery.refetch();
    }
  }

  /**
   * Both lanes pay in the same tick.
   *
   * This is the case the brief's sequence does not cover. Driving the two
   * lanes by hand reproduces "B finishes, then A tries", which is what the
   * brief describes and which anyone can do with two browser tabs. What nobody
   * can do by hand is press both buttons on the same millisecond - and that is
   * the version where the database, not the ordering of two humans, has to
   * decide who gets the seat.
   *
   * Both requests are issued before either is awaited, so they are genuinely
   * in flight together.
   */
  async function handleBothPay() {
    if (!laneA.bookingId || !laneB.bookingId) return;

    startedAtRef.current = performance.now();
    setLog([]);
    addLog('runner', 'both parents pressing Pay at the same instant…', 'info');

    await Promise.all([handlePay('a', laneA), handlePay('b', laneB)]);

    await Promise.all([classesQuery.refetch(), rosterQuery.refetch()]);
  }

  /* ---------------------------------------------------------------- */
  /* Automated race                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Creates as many bookings as it can, then fires every confirm at once.
   *
   * The two phases are separate on purpose. Creating bookings is not the
   * contested step - claiming the seat is - so all the competitors are lined
   * up first and only the confirm calls are made concurrent.
   */
  async function handleAutoRace() {
    if (!classId || !trialClass) return;

    setIsAutoRacing(true);
    startedAtRef.current = performance.now();
    setLog([]);

    const seatsBefore = trialClass.seatsRemaining;
    addLog(
      'runner',
      `starting · ${seatsBefore} seat(s) open, ${RACE_DEMO_CONCURRENCY} parents about to pay simultaneously`,
      'info',
    );

    // Phase 1 - line up competitors. Duplicates and full-class rejections are
    // expected here and simply reduce the field.
    const created: Array<{ bookingId: string; label: string }> = [];

    for (const student of allStudents.slice(0, RACE_DEMO_CONCURRENCY + 4)) {
      if (created.length >= RACE_DEMO_CONCURRENCY) break;
      try {
        const booking = await createBooking({
          studentId: student.id,
          trialClassId: classId,
        });
        created.push({ bookingId: booking.id, label: student.name });
      } catch {
        // Already booked into this class, or the class filled up. Skip.
      }
    }

    if (created.length === 0) {
      addLog('runner', 'no bookings could be created · reset the demo data first', 'lose');
      setIsAutoRacing(false);
      return;
    }

    addLog('runner', `${created.length} bookings staged · firing all confirms now`, 'info');

    /*
     * Phase 2 - everyone pays at the same moment.
     *
     * Each result is logged the instant its own request settles, not after
     * `Promise.all` resolves. Collecting them first and logging in a loop
     * afterwards stamps every line with the same millisecond, which makes the
     * timeline look synthetic - the timestamps are the evidence that these
     * really did overlap.
     */
    const results = await Promise.all(
      created.map(async ({ bookingId, label }) => {
        try {
          await payBooking({
            bookingId,
            idempotencyKey: createIdempotencyKey(bookingId),
            outcome: 'success',
          });
          addLog(label, 'WON · confirmed', 'win');
          return { label, won: true, reason: 'confirmed' };
        } catch (caught) {
          const reason = toApiError(caught).reason;
          addLog(label, `lost · ${reason}`, 'lose');
          return { label, won: false, reason };
        }
      }),
    );

    const winners = results.filter((r) => r.won).length;
    addLog(
      'runner',
      `${winners} confirmed, ${results.length - winners} rejected · expected exactly ${seatsBefore}`,
      winners === seatsBefore ? 'win' : 'lose',
    );

    await classesQuery.refetch();
    setIsAutoRacing(false);
  }

  /* ---------------------------------------------------------------- */

  async function handleReset() {
    setIsResetting(true);
    try {
      await resetDemoData();
      setLaneA({ ...EMPTY_LANE, studentId: allStudents[0]?.id ?? null });
      setLaneB({ ...EMPTY_LANE, studentId: allStudents[1]?.id ?? null });
      setLog([]);
      startedAtRef.current = 0;
      await Promise.all([classesQuery.refetch(), rosterQuery.refetch()]);
    } finally {
      setIsResetting(false);
    }
  }

  const seats = trialClass ? getSeatPresentation(trialClass) : null;

  return (
    <div className="space-y-6">
      <Alert tone="primary" title="How to reproduce the scenario from the brief">
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Pick a class with one seat left (Mathematics, by default).</li>
          <li>
            Set Parent A to <strong>Slow bank</strong>, then press{' '}
            <em>Create booking</em> and <em>Pay</em> in lane A.
          </li>
          <li>
            While A is still waiting, create and pay in lane B with{' '}
            <strong>Card approved</strong>.
          </li>
          <li>B confirms first. A comes back to a seat that no longer exists.</li>
        </ol>
      </Alert>

      <Card>
        <CardHeader
          as="h2"
          title="Contested class"
          description="Both lanes compete for a seat in this class."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              isLoading={isResetting}
              loadingText="Resetting…"
            >
              Reset demo data
            </Button>
          }
        />

        <label htmlFor="race-class" className="mb-1.5 block text-xs font-medium text-text-muted">
          Class
        </label>
        <select
          id="race-class"
          value={classId ?? ''}
          onChange={(event) => setClassId(event.target.value)}
          className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.subject} — {c.seatsRemaining} of {c.capacity} seats open
            </option>
          ))}
        </select>

        {trialClass && seats && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="min-w-40 flex-1">
              <SeatMeter trialClass={trialClass} />
            </div>
            <Badge tone={seats.tone} srLabel={seats.announcement}>
              {seats.label}
            </Badge>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <RaceLane
          title="Parent A"
          accent="a"
          state={laneA}
          students={eligibleStudents}
          onChangeStudent={(studentId) => setLaneA((p) => ({ ...p, studentId }))}
          onChangeOutcome={(outcome: PaymentOutcome) => setLaneA((p) => ({ ...p, outcome }))}
          onCreate={() => void handleCreate('a')}
          onPay={() => void handlePay('a')}
        />
        <RaceLane
          title="Parent B"
          accent="b"
          state={laneB}
          students={eligibleStudents}
          onChangeStudent={(studentId) => setLaneB((p) => ({ ...p, studentId }))}
          onChangeOutcome={(outcome: PaymentOutcome) => setLaneB((p) => ({ ...p, outcome }))}
          onCreate={() => void handleCreate('b')}
          onPay={() => void handlePay('b')}
        />
      </div>

      <Card>
        <CardHeader
          as="h2"
          title="Both parents at once"
          description="Fires both lanes in the same tick - the case two people with two tabs cannot produce by hand. Create a booking in each lane first."
          action={
            <Button
              onClick={() => void handleBothPay()}
              softDisabled={!laneA.bookingId || !laneB.bookingId}
              disabledReason="Create a booking in both lanes first."
              isLoading={laneA.isWorking && laneB.isWorking}
              loadingText="Both paying…"
            >
              Both pay at the same instant
            </Button>
          }
        />
        <p className="text-sm text-text-muted">
          Exactly one of them can end up confirmed. The other is told the seat went, and
          its authorisation is released rather than captured.
        </p>
      </Card>

      <Card>
        <CardHeader
          as="h2"
          title="Automated race"
          description={`Stages up to ${RACE_DEMO_CONCURRENCY} bookings, then fires every confirm in the same tick. However many parents take part, only the open seats can be won.`}
          action={
            <Button
              onClick={handleAutoRace}
              isLoading={isAutoRacing}
              loadingText="Racing…"
              softDisabled={!classId}
              disabledReason="Choose a class first."
            >
              Fire {RACE_DEMO_CONCURRENCY} concurrent confirms
            </Button>
          }
        />
        <RaceLog entries={log} />
      </Card>

      <Alert tone="neutral" title="What this proves, and what it does not">
        Every confirm above went through the same PostgreSQL claim the real endpoint uses -{' '}
        <code className="font-mono text-xs">
          update trial_classes set confirmed_count = confirmed_count + 1 where id = $1 and
          confirmed_count &lt; capacity
        </code>{' '}
        - inside a transaction, with a check constraint behind it. Postgres serialises the
        competing updates on that one row, so the guarantee comes from the database, not from
        Node happening to run one task at a time. What this page cannot prove is behaviour
        across several server processes; that is what the concurrency suite in{' '}
        <code className="font-mono text-xs">npm test</code> covers, over a real connection
        pool.
      </Alert>
    </div>
  );
}
