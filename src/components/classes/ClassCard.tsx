'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SeatMeter } from './SeatMeter';
import { getSeatPresentation } from '@/helpers/seats';
import { formatClassDateTime, formatClassDateTimeLong, toDateTimeAttr } from '@/utils/format';
import { formatMoney } from '@/utils/format';
import { TRIAL_PRICE_CENTS } from '@/constants';
import type { ActiveBooking, Student, TrialClass } from '@/types';

interface ClassCardProps {
  trialClass: TrialClass;
  student: Student | null;
  onBook: (trialClass: TrialClass) => void;
  isBooking: boolean;
  /**
   * A booking this child already holds for this class, if any.
   *
   * The uniqueness rule covers pending bookings as well as confirmed ones, so
   * an abandoned checkout would otherwise leave the child permanently unable to
   * book the class - pressing Book returns a refusal with nothing to act on.
   * Knowing about it up front lets the card offer the way back instead.
   */
  existingBooking: ActiveBooking | null;
}

export function ClassCard({
  trialClass,
  student,
  onBook,
  isBooking,
  existingBooking,
}: ClassCardProps) {
  const seats = getSeatPresentation(trialClass);
  const headingId = `class-${trialClass.id}-title`;

  const blockedReason = !student
    ? 'Choose a child first.'
    : !seats.bookable
      ? 'This class is full. Every seat is already confirmed.'
      : undefined;

  return (
    <article
      aria-labelledby={headingId}
      className="h-full rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-semibold text-text">
            {trialClass.subject}
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            <time dateTime={toDateTimeAttr(trialClass.startsAt)}>
              <span aria-hidden="true">{formatClassDateTime(trialClass.startsAt)} UTC</span>
              <span className="sr-only">
                {formatClassDateTimeLong(trialClass.startsAt)} UTC
              </span>
            </time>
            {' · '}
            {formatMoney(TRIAL_PRICE_CENTS)}
          </p>
        </div>

        <Badge tone={seats.tone} srLabel={seats.announcement}>
          {seats.label}
        </Badge>
      </div>

      <div className="mt-5">
        <SeatMeter trialClass={trialClass} />
        <p className="mt-2 text-xs text-text-muted">
          {trialClass.confirmedCount} of {trialClass.capacity} seats confirmed
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {existingBooking ? (
          <Link
            href={`/bookings/${existingBooking.bookingId}`}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            {existingBooking.status === 'confirmed'
              ? 'View booking'
              : `Finish booking${student ? ` for ${student.name.split(' ')[0]}` : ''}`}
          </Link>
        ) : (
          <Button
            onClick={() => onBook(trialClass)}
            isLoading={isBooking}
            loadingText="Creating booking…"
            softDisabled={Boolean(blockedReason)}
            disabledReason={blockedReason}
          >
            {student ? `Book for ${student.name.split(' ')[0]}` : 'Book trial'}
          </Button>
        )}

        <Link
          href={`/admin/roster/${trialClass.id}`}
          className="inline-flex h-11 items-center rounded-lg px-3 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          View roster
          <span className="sr-only"> for {trialClass.subject}</span>
        </Link>
      </div>

      {/*
        The seat count above is a snapshot taken when the page loaded. Saying
        so on the card that has one seat left is more honest than letting a
        parent believe the number is reserved for them.
      */}
      {existingBooking?.status === 'pending_payment' && (
        <p className="mt-3 text-xs leading-relaxed text-warning-text">
          This booking is already started and still waiting for payment. It holds no seat
          until you finish it.
        </p>
      )}

      {seats.state === 'last_seat' && !existingBooking && (
        <p className="mt-3 text-xs leading-relaxed text-warning-text">
          Only one seat left. It is not held for you until payment succeeds, so another
          parent can still take it while you check out.
        </p>
      )}
    </article>
  );
}
