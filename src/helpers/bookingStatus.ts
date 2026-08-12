import type { BookingStatus, FailureReason } from '@/types';

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'primary';

export interface StatusPresentation {
  label: string;
  /** One sentence a parent can act on. Never exposes internal wording. */
  description: string;
  tone: Tone;
  /**
   * WCAG 1.4.1 (Use of Color): status is never communicated by colour alone.
   * Each status carries a distinct glyph and its own text label.
   */
  glyph: string;
}

const STATUS_MAP: Record<BookingStatus, StatusPresentation> = {
  pending_payment: {
    label: 'Awaiting payment',
    description: 'This seat is not held yet. It is confirmed only once payment succeeds.',
    tone: 'warning',
    glyph: '○',
  },
  confirmed: {
    label: 'Confirmed',
    description: 'The seat is booked and the child is on the class roster.',
    tone: 'success',
    glyph: '✓',
  },
  payment_failed: {
    label: 'Payment failed',
    description: 'The card was declined. No seat was taken and nothing was charged.',
    tone: 'danger',
    glyph: '✕',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'This booking was cancelled and the seat returned to the class.',
    tone: 'neutral',
    glyph: '–',
  },
};

/**
 * A booking that failed because it lost the last-seat race.
 *
 * Same status as a declined card - the payment step did not complete either
 * way - but a parent who was outbid needs to hear something very different
 * from one whose card bounced. Telling them "payment failed" would send them
 * to check a card that was never the problem. `failureReason` separates the
 * two, and this is the only place that difference is rendered.
 */
const LOST_RACE: StatusPresentation = {
  label: 'Seat taken',
  description:
    'The card was fine, but another parent confirmed the last seat first. The authorisation was released, so nothing was charged.',
  tone: 'danger',
  glyph: '⊘',
};

export function getStatusPresentation(
  status: BookingStatus,
  failureReason?: FailureReason | null,
): StatusPresentation {
  if (status === 'payment_failed' && failureReason === 'class_full') return LOST_RACE;
  return STATUS_MAP[status];
}

/** No further transitions are possible from these states. */
export function isTerminalStatus(status: BookingStatus): boolean {
  return status === 'confirmed' || status === 'cancelled';
}

/**
 * A parent may start a fresh attempt after any failed payment - a declined card
 * or a lost seat.
 *
 * The database allows it too: the partial unique index that blocks duplicates
 * only covers `pending_payment` and `confirmed`, so a failed row never stands
 * in the way of trying again. A `cancelled` booking needs no retry button -
 * the class list already offers a normal Book.
 */
export function canRetryBooking(status: BookingStatus): boolean {
  return status === 'payment_failed';
}

/** Only these bookings occupy a seat, so only these appear on the roster. */
export function occupiesSeat(status: BookingStatus): boolean {
  return status === 'confirmed';
}

export const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success-soft text-success-text border-success/30',
  danger: 'bg-danger-soft text-danger-text border-danger/30',
  warning: 'bg-warning-soft text-warning-text border-warning/30',
  neutral: 'bg-neutral-soft text-neutral-text border-border-strong',
  primary: 'bg-primary-soft text-primary-text border-primary/30',
};
