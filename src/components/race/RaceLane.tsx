'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RadioCardGroup } from '@/components/ui/RadioCardGroup';
import { getStatusPresentation } from '@/helpers/bookingStatus';
import { PAYMENT_OUTCOMES } from '@/constants';
import { cn } from '@/utils/cn';
import type { BookingStatus, FailureReason, PaymentOutcome, Student } from '@/types';

export interface LaneState {
  bookingId: string | null;
  status: BookingStatus | null;
  /** Separates "you cancelled" from "the seat went" - both are `cancelled`. */
  failureReason: FailureReason | null;
  outcome: PaymentOutcome;
  studentId: string | null;
  isWorking: boolean;
  note: string | null;
}

interface RaceLaneProps {
  title: string;
  accent: 'a' | 'b';
  state: LaneState;
  students: Student[];
  onChangeStudent: (studentId: string) => void;
  onChangeOutcome: (outcome: PaymentOutcome) => void;
  onCreate: () => void;
  onPay: () => void;
}

const ACCENT = {
  a: 'border-l-4 border-l-primary',
  b: 'border-l-4 border-l-warning',
} as const;

/**
 * One parent in the race, driven by hand.
 *
 * The two steps are deliberately separate buttons. A single "book and pay"
 * action would hide the exact window the brief asks about - the gap between
 * choosing a seat and paying for it, during which somebody else can take it.
 */
export function RaceLane({
  title,
  accent,
  state,
  students,
  onChangeStudent,
  onChangeOutcome,
  onCreate,
  onPay,
}: RaceLaneProps) {
  const status = state.status
    ? getStatusPresentation(state.status, state.failureReason)
    : null;
  const selectId = `race-student-${accent}`;

  return (
    <Card as="section" aria-label={title} className={cn('space-y-4', ACCENT[accent])}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {status && (
          <Badge tone={status.tone} glyph={status.glyph}>
            {status.label}
          </Badge>
        )}
      </div>

      <div>
        <label htmlFor={selectId} className="mb-1.5 block text-xs font-medium text-text-muted">
          Child
        </label>
        <select
          id={selectId}
          value={state.studentId ?? ''}
          onChange={(event) => onChangeStudent(event.target.value)}
          disabled={Boolean(state.bookingId) || state.isWorking}
          className="h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
      </div>

      <RadioCardGroup
        legend={`Payment outcome for ${title}`}
        hideLegend
        name={`race-outcome-${accent}`}
        value={state.outcome}
        options={PAYMENT_OUTCOMES}
        onChange={onChangeOutcome}
        disabled={state.isWorking || state.status === 'confirmed'}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onCreate}
          isLoading={state.isWorking && !state.bookingId}
          softDisabled={Boolean(state.bookingId)}
          disabledReason="This lane already has a booking. Reset the demo to start over."
        >
          1 · Create booking
        </Button>

        <Button
          size="sm"
          onClick={onPay}
          isLoading={state.isWorking && Boolean(state.bookingId)}
          loadingText="Paying…"
          softDisabled={!state.bookingId || state.status !== 'pending_payment'}
          disabledReason={
            !state.bookingId
              ? 'Create the booking first.'
              : 'This booking has already been settled.'
          }
        >
          2 · Pay and confirm
        </Button>
      </div>

      {state.note && (
        <p
          className={cn(
            'text-xs leading-relaxed',
            state.status === 'confirmed'
              ? 'text-success-text'
              : state.status === 'payment_failed'
                ? 'text-danger-text'
                : 'text-text-muted',
          )}
        >
          {state.note}
        </p>
      )}
    </Card>
  );
}
