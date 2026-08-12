import { createBooking } from '@/server/bookingService';
import { jsonFail, readJson, respond } from '@/server/http';

export const dynamic = 'force-dynamic';

interface CreateBookingBody {
  studentId?: string;
  trialClassId?: string;
}

/**
 * POST /api/bookings
 *
 * Creates a booking in `pending_payment`. This reserves nothing - see
 * `createBooking` for why a pending booking deliberately holds no seat.
 *
 * 201 on success, 409 for a duplicate or a full class.
 */
export async function POST(request: Request) {
  const body = await readJson<CreateBookingBody>(request);

  if (!body?.studentId || !body?.trialClassId) {
    return jsonFail('unknown_error', 'studentId and trialClassId are required.');
  }

  return respond(await createBooking(body.studentId, body.trialClassId), 201);
}
