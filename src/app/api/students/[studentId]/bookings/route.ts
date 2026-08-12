import { listActiveBookingsForStudent } from '@/server/bookingService';
import { jsonOk } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/students/:studentId/bookings
 *
 * The child's active bookings - `pending_payment` or `confirmed` - keyed by
 * class.
 *
 * This exists so the class list can offer "Finish booking" on a class the
 * child already started, instead of letting them press "Book", hit the
 * uniqueness rule, and receive an error with no way to act on it. Preventing
 * the dead end beats explaining it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await params;
  return jsonOk(await listActiveBookingsForStudent(studentId));
}
