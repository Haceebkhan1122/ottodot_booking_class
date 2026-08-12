import axios, { AxiosError, type AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT_MS } from '@/constants';
import type { ApiErrorShape, FailureDetails, FailureReason } from '@/types';

/**
 * Single axios instance for the whole app.
 *
 * Its job is to make every caller face the same error shape. Without this,
 * each component ends up writing its own `error.response?.data?.message ??
 * 'Something went wrong'` chain, and the messages drift apart until the same
 * failure reads differently on two screens.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * A rejection the UI can branch on.
 *
 * `reason` is the machine code; `message` is copy already written for parents.
 * Components read `reason` to decide what to do and render `message` as-is.
 */
export class ApiError extends Error implements ApiErrorShape {
  readonly reason: FailureReason;
  readonly status: number;
  /** Context the server attached, e.g. which booking blocked this one. */
  readonly details?: FailureDetails;

  constructor({ reason, message, status, details }: ApiErrorShape) {
    super(message);
    this.name = 'ApiError';
    this.reason = reason;
    this.status = status;
    this.details = details;
  }
}

function readDetails(body: unknown): FailureDetails | undefined {
  if (typeof body !== 'object' || body === null || !('details' in body)) return undefined;
  const details = (body as { details?: unknown }).details;
  if (typeof details !== 'object' || details === null) return undefined;
  const bookingId = (details as { bookingId?: unknown }).bookingId;
  return typeof bookingId === 'string' ? { bookingId } : undefined;
}

const KNOWN_REASONS = new Set<FailureReason>([
  'class_full',
  'duplicate_active_booking',
  'payment_declined',
  'booking_not_found',
  'class_not_found',
  'student_not_found',
  'class_already_started',
  'invalid_state',
  'network_error',
  'unknown_error',
]);

function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === 'string' && KNOWN_REASONS.has(value as FailureReason);
}

/**
 * Response interceptor.
 *
 * Unwraps the `{ ok: true, data }` envelope so callers receive the payload
 * directly, and converts every failure - HTTP error, timeout, dropped
 * connection - into an `ApiError`. Nothing downstream ever sees a raw
 * AxiosError.
 */
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;

    if (body && typeof body === 'object' && 'ok' in body) {
      if (body.ok === true) {
        response.data = body.data;
        return response;
      }

      return Promise.reject(
        new ApiError({
          reason: isFailureReason(body.reason) ? body.reason : 'unknown_error',
          message: typeof body.message === 'string' ? body.message : 'Request failed.',
          status: response.status,
          details: readDetails(body),
        }),
      );
    }

    return response;
  },

  (error: AxiosError<{ reason?: unknown; message?: unknown }>) => {
    // No response at all: offline, DNS failure, timeout, server down.
    // This is the one case where we can promise nothing was charged, because
    // the request never completed a round trip.
    if (!error.response) {
      return Promise.reject(
        new ApiError({
          reason: 'network_error',
          message: 'We could not reach the server. Check your connection and try again.',
          status: 0,
        }),
      );
    }

    const body = error.response.data;

    return Promise.reject(
      new ApiError({
        reason: isFailureReason(body?.reason) ? body.reason : 'unknown_error',
        message:
          typeof body?.message === 'string'
            ? body.message
            : 'Something went wrong on our side. Please try again.',
        status: error.response.status,
        details: readDetails(body),
      }),
    );
  },
);

/** Narrowing helper so callers can branch on `reason` without casting. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Last-resort normaliser for anything that escaped the interceptor. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;
  return new ApiError({
    reason: 'unknown_error',
    message: 'Something went wrong. Please try again.',
    status: 0,
  });
}
