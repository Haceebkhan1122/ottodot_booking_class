import { getRoster } from '@/server/bookingService';
import { jsonFail, jsonOk } from '@/server/http';
import { getErrorMessage } from '@/helpers/errorMessages';

export const dynamic = 'force-dynamic';

/**
 * GET /api/roster/:classId
 *
 * The teacher-facing view the brief asks for, usable as a plain JSON endpoint
 * without the UI.
 *
 * It returns non-confirmed bookings alongside the roster on purpose. A teacher
 * who can see that a child dropped out because the seat was taken, rather than
 * because a card bounced, does not have to phone anyone to find out.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const { classId } = await params;
  const roster = await getRoster(classId);

  if (!roster) {
    return jsonFail('class_not_found', getErrorMessage('class_not_found'));
  }

  return jsonOk(roster);
}
