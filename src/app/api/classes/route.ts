import { listClasses } from '@/server/bookingService';
import { jsonOk } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/classes
 *
 * `seatsRemaining` is computed here on every read rather than stored, so it
 * cannot drift from `confirmedCount`. It is still only a snapshot: by the time
 * it reaches the browser another parent may already have taken a seat. The UI
 * treats it as advisory and the confirm call is the only place it is enforced.
 */
export async function GET() {
  return jsonOk(await listClasses());
}
