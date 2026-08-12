import type { PaymentOutcome } from '@/types';

/** Business rule from the brief: trial classes are capped at 4 students. */
export const TRIAL_CLASS_CAPACITY = 4;

/** Trial class price in cents. Single currency, no tax handling - out of scope. */
export const TRIAL_PRICE_CENTS = 2500;
export const CURRENCY = 'USD';

/** Base path for the internal API. Kept in one place so the axios instance
 *  and any future external host share a single source of truth. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

export const API_TIMEOUT_MS = 15_000;

/**
 * The card shown at checkout.
 *
 * A stand-in for a real saved payment method. The booking page presents this
 * one card rather than a set of test switches - `PAYMENT_OUTCOMES` below still
 * exists and is still honoured by the API, but only the race demo exposes it,
 * because "make my card decline" is not a choice a parent should be offered.
 */
export const SAVED_CARD = {
  brand: 'Visa',
  brandShort: 'VISA',
  last4: '4242',
  expiry: '04/29',
} as const;

/**
 * Mock payment provider outcomes, used by the race demo.
 *
 * Surfaced in the UI as a radio group.
 *
 * `slow` exists so the last-seat race can be reproduced by hand in a browser:
 * start Parent A on "slow", then let Parent B pay instantly and win.
 */
export const PAYMENT_OUTCOMES: Array<{
  value: PaymentOutcome;
  label: string;
  description: string;
}> = [
  {
    value: 'success',
    label: 'Card approved',
    description: 'Authorises and captures immediately.',
  },
  {
    value: 'decline',
    label: 'Card declined',
    description: 'Authorisation fails. The seat is never touched.',
  },
  {
    value: 'slow',
    label: 'Slow bank (3s)',
    description: 'Delays authorisation so another parent can take the seat first.',
  },
];

/** How long the mock provider stalls on the `slow` outcome. */
export const SLOW_PAYMENT_DELAY_MS = 3_000;

/** Number of parallel confirms fired by the automated race demo. */
export const RACE_DEMO_CONCURRENCY = 10;

/** Motion timings, kept together so the whole app feels like one system. */
export const MOTION = {
  /** Page + section entrances. */
  duration: 0.35,
  /** Small state flips (badge, button). */
  fastDuration: 0.18,
  /** Distance list items travel on entry, in pixels. */
  offset: 12,
  /** Delay between staggered children. */
  stagger: 0.05,
  ease: [0.22, 1, 0.36, 1] as const,
} as const;
