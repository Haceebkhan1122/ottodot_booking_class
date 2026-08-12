import { SLOW_PAYMENT_DELAY_MS } from '@/constants';
import type { PaymentOutcome } from '@/types';

/**
 * Mock payment provider.
 *
 * Modelled as authorise / capture / void rather than a single `charge()` call,
 * because the split is what makes the last-seat race safe to lose:
 *
 *   authorise  - the bank earmarks the money but nothing has moved
 *   capture    - the money actually moves. Only ever called after a seat is won
 *   void       - the earmark is released. Called when the seat is lost
 *
 * A parent who loses the race never gets charged, so there is no refund to
 * chase and no "pending" line on their statement to explain.
 *
 * Outcomes are chosen explicitly by the caller and are fully deterministic.
 * Nothing here uses randomness: a reviewer must be able to reproduce every
 * path on demand.
 */

export interface AuthorizationResult {
  ok: boolean;
  providerRef: string;
  declineCode?: string;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let refCounter = 0;

function makeRef(kind: string): string {
  refCounter += 1;
  return `mock_${kind}_${Date.now().toString(36)}${refCounter.toString(36)}`;
}

export async function authorize(
  amountCents: number,
  outcome: PaymentOutcome,
): Promise<AuthorizationResult> {
  if (outcome === 'slow') {
    // The whole point of this branch: hold the request open long enough for a
    // competing parent to confirm the same seat.
    await delay(SLOW_PAYMENT_DELAY_MS);
  }

  if (outcome === 'decline') {
    return { ok: false, providerRef: makeRef('auth'), declineCode: 'card_declined' };
  }

  return { ok: true, providerRef: makeRef('auth') };
}

/** Called only after the seat has been claimed. */
export async function capture(providerRef: string): Promise<{ ok: boolean }> {
  await delay(50);
  void providerRef;
  return { ok: true };
}

/** Called when the seat was lost after a successful authorisation. */
export async function voidAuthorization(providerRef: string): Promise<{ ok: boolean }> {
  await delay(20);
  void providerRef;
  return { ok: true };
}
