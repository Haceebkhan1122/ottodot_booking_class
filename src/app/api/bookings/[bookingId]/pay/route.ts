import { payAndConfirm } from '@/server/bookingService';
import { jsonFail, readJson, respond } from '@/server/http';
import type { PaymentOutcome } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_OUTCOMES: PaymentOutcome[] = ['success', 'decline', 'slow'];

interface PayBody {
  idempotencyKey?: string;
  outcome?: PaymentOutcome;
}

/**
 * POST /api/bookings/:bookingId/pay
 *
 * Runs authorise -> claim seat -> capture, and is the only endpoint that can
 * produce a confirmed booking.
 *
 * Responses:
 *   200  confirmed
 *   402  card declined - no seat touched
 *   409  class_full - card was fine, the authorisation was voided
 *
 * `idempotencyKey` is required, not optional. Making the caller supply one
 * means a retried request is safe by construction instead of safe by luck.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const body = await readJson<PayBody>(request);

  if (!body?.idempotencyKey) {
    return jsonFail('unknown_error', 'idempotencyKey is required.');
  }

  const outcome = body.outcome ?? 'success';
  if (!VALID_OUTCOMES.includes(outcome)) {
    return jsonFail('unknown_error', `outcome must be one of: ${VALID_OUTCOMES.join(', ')}`);
  }

  return respond(await payAndConfirm(bookingId, body.idempotencyKey, outcome));
}
