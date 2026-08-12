import { cancelBooking } from '@/server/bookingService';
import { respond } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/:bookingId/cancel
 *
 * Returns the seat to the class if the booking was holding one. Refunds are
 * out of scope and listed as a deliberate cut in the README.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  return respond(await cancelBooking(bookingId));
}
