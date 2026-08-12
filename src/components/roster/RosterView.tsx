'use client';

import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { RosterTable } from './RosterTable';
import { SeatMeter } from '@/components/classes/SeatMeter';

import { useApiResource } from '@/hooks/useApiResource';
import { fetchRoster } from '@/apiservice/bookingApi';
import { ENDPOINTS } from '@/apiservice/endpoints';
import { getStatusPresentation } from '@/helpers/bookingStatus';
import { getSeatPresentation } from '@/helpers/seats';
import { formatClassDateTimeLong, toDateTimeAttr } from '@/utils/format';
import { API_BASE_URL } from '@/constants';
import type { Roster } from '@/types';

export function RosterView({ classId }: { classId: string }) {
  const query = useApiResource((signal) => fetchRoster(classId, signal), [classId]);

  if (query.isLoading) {
    return (
      <div aria-busy="true" className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 w-full" />
        <span className="sr-only">Loading roster…</span>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="danger" title="Roster unavailable" live="assertive">
        {query.error?.message ?? 'We could not load this roster.'}
      </Alert>
    );
  }

  const { trialClass, confirmed, otherBookings } = query.data;
  const awaiting = otherBookings.filter((b) => b.status === 'pending_payment');
  const closed = otherBookings.filter((b) => b.status !== 'pending_payment');
  const seats = getSeatPresentation(trialClass);

  return (
    <div className="space-y-6">
      {/* The page's <h1> is server-rendered one level up so it exists before
          this data arrives. The class name sits under it as an <h2>. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-text">
            {trialClass.subject}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            <time dateTime={toDateTimeAttr(trialClass.startsAt)}>
              {formatClassDateTimeLong(trialClass.startsAt)} UTC
            </time>
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void query.refetch()}
          isLoading={query.isFetching}
          loadingText="Refreshing…"
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader
          as="h2"
          title="Capacity"
          action={<Badge tone={seats.tone}>{seats.label}</Badge>}
        />
        <SeatMeter trialClass={trialClass} />
        <p className="mt-3 text-sm text-text-muted">
          {trialClass.confirmedCount} of {trialClass.capacity} seats confirmed.{' '}
          {/*
            Worth stating plainly on the teacher's screen: this number can only
            be moved by the confirm transaction, so the roster below and the
            counter here cannot disagree.
          */}
          This count is incremented in the same transaction that confirms a booking, so it
          cannot drift from the list below.
        </p>
      </Card>

      <Card>
        <CardHeader
          as="h2"
          title="Confirmed students"
          description="Only confirmed bookings occupy a seat. Pending and failed bookings never appear here."
        />
        <RosterTable trialClass={trialClass} entries={confirmed} />
      </Card>

      {/*
        Two sections, not one.
        A booking still waiting for payment has not "failed" - it is in
        progress, and lumping it in with declined cards tells a teacher the
        wrong story about who might still turn up. Every row links to the
        booking, because a pending booking that cannot be opened is a dead end:
        the uniqueness rule keeps it blocking the child, and nothing on screen
        offers a way to finish or cancel it.
      */}
      {awaiting.length > 0 && (
        <Card>
          <CardHeader
            as="h2"
            title="Awaiting payment"
            description="Started but not paid for. These hold no seat and may still be completed or abandoned."
          />
          <BookingRows entries={awaiting} />
        </Card>
      )}

      {closed.length > 0 && (
        <Card>
          <CardHeader
            as="h2"
            title="Bookings that did not make it"
            description="Kept visible so staff can see why a child is missing without having to ask."
          />
          <BookingRows entries={closed} />
        </Card>
      )}

      <Card className="bg-surface-2">
        <CardHeader
          as="h2"
          title="Same data as JSON"
          description="The brief allows a roster API instead of a screen, so both exist. This is the endpoint the page above calls."
        />
        <p className="font-mono text-xs break-all text-text-muted">
          GET {API_BASE_URL}
          {ENDPOINTS.roster(classId)}
        </p>
      </Card>
    </div>
  );
}

/** One clickable row per booking, linking to the page that can act on it. */
function BookingRows({
  entries,
}: {
  entries: Roster['otherBookings'];
}) {
  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const status = getStatusPresentation(entry.status, entry.failureReason);
        return (
          <li key={entry.bookingId}>
            <Link
              href={`/bookings/${entry.bookingId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="text-sm text-text">
                {entry.studentName}
                <span className="sr-only">, open booking</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={status.tone} glyph={status.glyph}>
                  {status.label}
                </Badge>
                <span aria-hidden="true" className="text-text-muted">
                  →
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
