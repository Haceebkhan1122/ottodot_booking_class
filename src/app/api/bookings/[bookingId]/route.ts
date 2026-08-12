import { getBookingDetail } from '@/server/bookingService';
import { jsonFail, jsonOk } from '@/server/http';
import { getErrorMessage } from '@/helpers/errorMessages';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings/:bookingId
 *
 * Returns the booking joined with its student, parent, class and full payment
 * attempt history, so the status screen needs exactly one request. The attempt
 * list is what makes "your card was never charged" a verifiable claim rather
 * than a reassuring sentence.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const detail = await getBookingDetail(bookingId);

  if (!detail) {
    return jsonFail('booking_not_found', getErrorMessage('booking_not_found'));
  }

  return jsonOk(detail);
}
