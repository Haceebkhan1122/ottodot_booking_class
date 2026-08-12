import { NextResponse } from 'next/server';
import type { FailureDetails, FailureReason, MutationResult } from '@/types';

/**
 * One mapping from domain failure to HTTP status, applied by every route.
 *
 * Business rejections are not 500s. `class_full` is the system working
 * correctly - a monitoring dashboard that counts it as a server error would
 * page someone every time a popular class sells out.
 */
const STATUS_BY_REASON: Record<FailureReason, number> = {
  class_full: 409,
  duplicate_active_booking: 409,
  invalid_state: 409,
  payment_declined: 402,
  booking_not_found: 404,
  class_not_found: 404,
  student_not_found: 404,
  class_already_started: 409,
  network_error: 503,
  unknown_error: 500,
};

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonFail(
  reason: FailureReason,
  message: string,
  details?: FailureDetails,
) {
  return NextResponse.json(
    { ok: false, reason, message, ...(details ? { details } : {}) },
    { status: STATUS_BY_REASON[reason] ?? 500 },
  );
}

/** Turns a service result straight into a response, so routes stay thin. */
export function respond<T>(result: MutationResult<T>, successStatus = 200) {
  return result.ok
    ? jsonOk(result.data, successStatus)
    : jsonFail(result.reason, result.message, result.details);
}

export function jsonNotFound(reason: FailureReason, message: string) {
  return jsonFail(reason, message);
}

/**
 * Reads a JSON body, returning null instead of throwing on malformed input.
 *
 * The returned type is a claim about the body, not a check on it - a client
 * can send anything. Each route validates the fields it actually needs before
 * using them, which is why every one of them starts with an explicit
 * required-field guard.
 */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
