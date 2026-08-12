import type { FailureReason } from '@/types';

/**
 * Machine reason -> parent-facing copy.
 *
 * The UI never renders a raw reason code. Two rules shaped this list:
 *
 *  1. Say what happened to the money. "Seat taken" and "card declined" feel
 *     identical to a parent staring at a spinner, but only one of them means
 *     "check your card".
 *  2. Say what to do next. A dead end with no next step generates a support
 *     ticket.
 */
const MESSAGES: Record<FailureReason, string> = {
  class_full:
    'Another parent confirmed the last seat moments before you. Your card was not charged - please pick another class.',
  duplicate_active_booking:
    'This child already has an active booking for this class. Open the existing booking instead of starting a new one.',
  payment_declined:
    'The card was declined, so no seat was taken. You can try again with a different card.',
  booking_not_found: 'We could not find that booking. It may have been cancelled.',
  class_not_found: 'That class is no longer listed.',
  student_not_found: 'We could not find that child on your account.',
  class_already_started: 'This class has already started, so it can no longer be booked.',
  invalid_state:
    'This booking has already been processed. Refresh the page to see its current status.',
  network_error: 'We could not reach the server. Check your connection and try again.',
  unknown_error: 'Something went wrong on our side. Nothing was charged. Please try again.',
};

export function getErrorMessage(reason: FailureReason): string {
  return MESSAGES[reason] ?? MESSAGES.unknown_error;
}

/**
 * Whether the failure is worth retrying with the same inputs.
 *
 * `class_full` and `duplicate_active_booking` are not: retrying identical
 * inputs produces an identical answer, and a retry button there just teaches
 * parents to hammer it.
 */
export function isRetryableReason(reason: FailureReason): boolean {
  return (
    reason === 'payment_declined' ||
    reason === 'network_error' ||
    reason === 'unknown_error'
  );
}
