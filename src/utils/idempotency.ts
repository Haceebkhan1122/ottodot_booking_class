/**
 * Idempotency keys for payment attempts.
 *
 * The key is generated once when the user opens the payment step and reused
 * for every retry of that same attempt. That is what makes a double-click, a
 * flaky network retry, or a page refresh mid-request safe: the server sees the
 * same key and returns the original result instead of charging twice.
 *
 * A fresh key is minted only when the user deliberately starts a new attempt
 * after a failure.
 */
export function createIdempotencyKey(bookingId: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `pay_${bookingId}_${random}`;
}
