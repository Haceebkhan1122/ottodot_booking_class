import { listParents } from '@/server/bookingService';
import { jsonOk } from '@/server/http';

/** In-memory state must never be cached between requests. */
export const dynamic = 'force-dynamic';

/**
 * GET /api/parents
 *
 * Stands in for a session. There is no authentication in this exercise, so the
 * UI lets you switch parent explicitly - see the "deliberately cut" section of
 * the README.
 */
export async function GET() {
  return jsonOk(await listParents());
}
