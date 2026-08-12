import { getClass } from '@/server/bookingService';
import { jsonFail, jsonOk } from '@/server/http';
import { getErrorMessage } from '@/helpers/errorMessages';

export const dynamic = 'force-dynamic';

/** GET /api/classes/:classId */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const { classId } = await params;
  const trialClass = await getClass(classId);

  if (!trialClass) {
    return jsonFail('class_not_found', getErrorMessage('class_not_found'));
  }

  return jsonOk(trialClass);
}
