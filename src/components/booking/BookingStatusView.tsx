'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PaymentPanel } from './PaymentPanel';
import { PaymentAttemptList } from './PaymentAttemptList';

import { useApiResource } from '@/hooks/useApiResource';
import { useAppStore } from '@/store/useAppStore';
import { cancelBooking, createBooking, fetchBooking } from '@/apiservice/bookingApi';
import { toApiError } from '@/apiservice/axiosInstance';
import { canRetryBooking, getStatusPresentation } from '@/helpers/bookingStatus';
import { formatClassDateTimeLong, toDateTimeAttr } from '@/utils/format';
import type { BookingDetail } from '@/types';

export function BookingStatusView({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const pushToast = useAppStore((s) => s.pushToast);

  const query = useApiResource<BookingDetail>(
    (signal) => fetchBooking(bookingId, signal),
    [bookingId],
  );

  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const booking = query.data;

  const handleSettled = useCallback(
    (updated: BookingDetail) => query.setData(updated),
    [query],
  );

  const handleFailed = useCallback(() => void query.refetch(), [query]);

  /**
   * Retry after a failure creates a *new* booking rather than reviving the old
   * one. The failed row stays exactly as it is, which keeps the history
   * honest, and the uniqueness rule allows it because failed bookings sit
   * outside the partial unique index.
   */
  async function handleRetry() {
    if (!booking) return;
    setIsRetrying(true);

    try {
      const fresh = await createBooking({
        studentId: booking.studentId,
        trialClassId: booking.trialClassId,
      });
      router.push(`/bookings/${fresh.id}`);
    } catch (caught) {
      const error = toApiError(caught);
      pushToast({
        tone: 'danger',
        title: 'Could not start a new booking',
        description: error.message,
        assertive: true,
      });
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleCancel() {
    if (!booking) return;
    setIsCancelling(true);

    try {
      await cancelBooking(booking.id);
      await query.refetch();
      pushToast({
        tone: 'neutral',
        title: 'Booking cancelled',
        description:
          booking.status === 'confirmed'
            ? 'The seat has been returned to the class.'
            : 'You can now start a new booking for this class.',
      });
    } catch (caught) {
      pushToast({
        tone: 'danger',
        title: 'Could not cancel',
        description: toApiError(caught).message,
        assertive: true,
      });
    } finally {
      setIsCancelling(false);
    }
  }

  if (query.isLoading) {
    return (
      <div aria-busy="true" className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
        <span className="sr-only">Loading booking…</span>
      </div>
    );
  }

  if (query.error || !booking) {
    return (
      <Alert tone="danger" title="Booking not found" live="assertive">
        {query.error?.message ?? 'We could not load this booking.'}{' '}
        <Link href="/" className="underline underline-offset-4">
          Back to trial classes
        </Link>
      </Alert>
    );
  }

  const status = getStatusPresentation(booking.status, booking.failureReason);

  return (
    <div className="space-y-6">
      {/* The page's <h1> is server-rendered one level up. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-text">
            {booking.trialClass.subject}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            For {booking.student.name} · Grade {booking.student.grade} ·{' '}
            <time dateTime={toDateTimeAttr(booking.trialClass.startsAt)}>
              {formatClassDateTimeLong(booking.trialClass.startsAt)} UTC
            </time>
          </p>
        </div>
        <Badge tone={status.tone} glyph={status.glyph}>
          {status.label}
        </Badge>
      </div>

      {/*
        The status explanation is a live region: on this page the status
        changes in place after payment, and a screen reader user who is not
        told has no way to know the outcome without re-reading the page.
      */}
      <Alert
        tone={status.tone}
        title={status.label}
        live="polite"
        action={
          booking.status === 'confirmed' ? (
            <Link
              href={`/admin/roster/${booking.trialClassId}`}
              className="inline-flex h-9 items-center rounded-lg border border-current px-3 text-sm font-medium"
            >
              View class roster
            </Link>
          ) : canRetryBooking(booking.status) ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleRetry} isLoading={isRetrying}>
                {booking.failureReason === 'class_full' ? 'Try this class again' : 'Try again'}
              </Button>
              <Link
                href="/"
                className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-medium text-text"
              >
                Choose another class
              </Link>
            </div>
          ) : undefined
        }
      >
        {status.description}
      </Alert>

      {booking.status === 'pending_payment' && (
        <PaymentPanel booking={booking} onSettled={handleSettled} onFailed={handleFailed} />
      )}

      <Card>
        <CardHeader
          as="h2"
          title="Payment history"
          description="Every attempt against this booking, oldest first."
        />
        <PaymentAttemptList attempts={booking.paymentAttempts} />
      </Card>

      <Card>
        <CardHeader
          as="h2"
          title="Class capacity right now"
          description="Read fresh from the server, not from anything cached in this tab."
        />
        <p className="text-sm text-text">
          <span className="font-semibold">
            {booking.trialClass.confirmedCount} of {booking.trialClass.capacity}
          </span>{' '}
          seats confirmed
          {booking.trialClass.seatsRemaining > 0
            ? ` · ${booking.trialClass.seatsRemaining} still open`
            : ' · class is full'}
        </p>

        {/*
          Pending bookings are cancellable too, not just confirmed ones.
          The uniqueness rule covers `pending_payment`, so an abandoned checkout
          locks the child out of that class until somebody clears it. Without a
          cancel button here there is no way to clear it.
        */}
        {(booking.status === 'confirmed' || booking.status === 'pending_payment') && (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              isLoading={isCancelling}
              loadingText="Cancelling…"
            >
              {booking.status === 'confirmed'
                ? 'Cancel this booking'
                : 'Cancel and free this child to rebook'}
            </Button>
            <p className="mt-2 text-xs text-text-muted">
              {booking.status === 'confirmed'
                ? 'Cancelling returns the seat to the class. Refunds are out of scope for this exercise.'
                : 'This booking holds no seat. Cancelling it lets you start a fresh booking for the same class.'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
