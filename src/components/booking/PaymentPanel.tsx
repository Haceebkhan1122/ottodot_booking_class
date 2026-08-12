'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';

import { payBooking } from '@/apiservice/bookingApi';
import { toApiError, type ApiError } from '@/apiservice/axiosInstance';
import { createIdempotencyKey } from '@/utils/idempotency';
import { formatMoney } from '@/utils/format';
import { SAVED_CARD, TRIAL_PRICE_CENTS } from '@/constants';
import { useAppStore } from '@/store/useAppStore';
import type { BookingDetail } from '@/types';

interface PaymentPanelProps {
  booking: BookingDetail;
  onSettled: (booking: BookingDetail) => void;
  onFailed: () => void;
}

/**
 * The parent-facing checkout.
 *
 * One saved card, already selected, and a Pay button - the shape a real
 * product has.
 *
 * The mock provider still supports declines and slow authorisations, and the
 * race demo page keeps those levers, so both scenarios the brief asks for stay
 * reproducible in a browser. They just do not belong in front of a parent,
 * where the only honest option is "pay with my card".
 */
export function PaymentPanel({ booking, onSettled, onFailed }: PaymentPanelProps) {
  const pushToast = useAppStore((s) => s.pushToast);

  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /*
   * One idempotency key per attempt, minted before the user can click.
   *
   * Holding it in state rather than generating it inside the click handler is
   * the entire point: a double click, a retried request after a dropped
   * connection, or a refresh that re-fires the same call all arrive carrying
   * the same key, and the server returns the original result instead of
   * authorising a second time.
   *
   * A new key is minted only when the user deliberately starts a fresh attempt
   * after a failure.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey(booking.id),
  );

  useEffect(() => {
    setIdempotencyKey(createIdempotencyKey(booking.id));
  }, [booking.id]);

  const handlePay = useCallback(async () => {
    setIsPaying(true);
    setError(null);

    try {
      const updated = await payBooking({
        bookingId: booking.id,
        idempotencyKey,
        outcome: 'success',
      });

      onSettled(updated);
      pushToast({
        tone: 'success',
        title: 'Booking confirmed',
        description: `${updated.student.name} has a seat in ${updated.trialClass.subject}.`,
      });
    } catch (caught) {
      const apiError = toApiError(caught);
      setError(apiError);

      pushToast({
        tone: 'danger',
        title:
          apiError.reason === 'class_full' ? 'The last seat was taken' : 'Payment failed',
        description: apiError.message,
        assertive: true,
      });

      // Whatever happened, the booking row changed server-side - it is now
      // payment_failed, or cancelled if the seat went. Re-read, do not guess.
      onFailed();

      // That attempt is spent. A retry is a genuinely new attempt and must not
      // reuse the key, or the server will replay the old result forever.
      setIdempotencyKey(createIdempotencyKey(booking.id));
    } finally {
      setIsPaying(false);
    }
  }, [booking.id, idempotencyKey, onSettled, onFailed, pushToast]);

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Payment"
        description={`${formatMoney(TRIAL_PRICE_CENTS)} · Mock checkout. No real card is involved and nothing is charged.`}
      />

      {/*
        A single saved card, presented as a fact rather than a choice. There is
        no radio group, because there is nothing to choose between - a picker
        with one option is a control that cannot be operated.
      */}
      <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary-soft p-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-12 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-bold tracking-wide text-white"
        >
          {SAVED_CARD.brandShort}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-primary-text">
            {SAVED_CARD.brand} ending {SAVED_CARD.last4}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Expires {SAVED_CARD.expiry} · Saved to this account
          </span>
        </span>
      </div>

      {error && (
        <Alert
          tone="danger"
          title={error.reason === 'class_full' ? 'Seat taken' : 'Payment not completed'}
          live="assertive"
          className="mt-4"
        >
          {error.message}
        </Alert>
      )}

      <div className="mt-5">
        <Button
          size="lg"
          onClick={handlePay}
          isLoading={isPaying}
          loadingText="Contacting the bank…"
        >
          Pay {formatMoney(TRIAL_PRICE_CENTS)} and confirm
        </Button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        The seat is claimed before the payment is captured. If another parent takes the last
        seat while this is in flight, the authorisation is released and you are not charged.
      </p>

      {/*
        Surfaced deliberately. It makes the idempotency story demonstrable in a
        walkthrough: pay twice with this key and the second call replays the
        first result instead of charging again.
      */}
      <p className="mt-3 font-mono text-[11px] break-all text-text-muted">
        idempotency key: {idempotencyKey}
      </p>
    </Card>
  );
}
