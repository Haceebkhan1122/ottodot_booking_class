import type { TrialClass } from '@/types';
import type { Tone } from './bookingStatus';

export type SeatState = 'available' | 'last_seat' | 'full';

export interface SeatPresentation {
  state: SeatState;
  /** Short label for the badge. */
  label: string;
  /** Full sentence for screen readers and tooltips. */
  announcement: string;
  tone: Tone;
  bookable: boolean;
}

export function getSeatState(trialClass: TrialClass): SeatState {
  if (trialClass.seatsRemaining <= 0) return 'full';
  if (trialClass.seatsRemaining === 1) return 'last_seat';
  return 'available';
}

export function getSeatPresentation(trialClass: TrialClass): SeatPresentation {
  const { seatsRemaining, capacity } = trialClass;
  const state = getSeatState(trialClass);

  if (state === 'full') {
    return {
      state,
      label: 'Class full',
      announcement: `Class full. All ${capacity} seats are confirmed.`,
      tone: 'danger',
      bookable: false,
    };
  }

  if (state === 'last_seat') {
    return {
      state,
      label: 'Last seat',
      announcement: `Last seat. 1 of ${capacity} seats remaining.`,
      tone: 'warning',
      bookable: true,
    };
  }

  return {
    state,
    label: `${seatsRemaining} seats left`,
    announcement: `${seatsRemaining} of ${capacity} seats remaining.`,
    tone: 'success',
    bookable: true,
  };
}

/**
 * Fraction of the class that is confirmed, for the seat meter.
 * Clamped because a UI should degrade quietly, not render a broken bar, if the
 * server ever reports something impossible.
 */
export function getSeatFillRatio(trialClass: TrialClass): number {
  if (trialClass.capacity <= 0) return 0;
  return Math.min(1, Math.max(0, trialClass.confirmedCount / trialClass.capacity));
}

export function hasStarted(trialClass: TrialClass, now: Date = new Date()): boolean {
  return new Date(trialClass.startsAt).getTime() <= now.getTime();
}
