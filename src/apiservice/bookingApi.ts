import { apiClient } from './axiosInstance';
import { ENDPOINTS } from './endpoints';
import type {
  ActiveBooking,
  Booking,
  BookingDetail,
  Parent,
  PaymentOutcome,
  Roster,
  TrialClass,
} from '@/types';

/**
 * Typed wrappers around the endpoints.
 *
 * These resolve with the payload and reject with an `ApiError` - the envelope
 * is already unwrapped by the interceptor. Components never touch axios
 * directly, so swapping the transport later is a change to this folder only.
 */

export async function fetchParents(signal?: AbortSignal): Promise<Parent[]> {
  const { data } = await apiClient.get<Parent[]>(ENDPOINTS.parents(), { signal });
  return data;
}

export async function fetchClasses(signal?: AbortSignal): Promise<TrialClass[]> {
  const { data } = await apiClient.get<TrialClass[]>(ENDPOINTS.classes(), { signal });
  return data;
}

export async function fetchClass(
  classId: string,
  signal?: AbortSignal,
): Promise<TrialClass> {
  const { data } = await apiClient.get<TrialClass>(ENDPOINTS.classById(classId), { signal });
  return data;
}

export async function createBooking(input: {
  studentId: string;
  trialClassId: string;
}): Promise<Booking> {
  const { data } = await apiClient.post<Booking>(ENDPOINTS.bookings(), input);
  return data;
}

export async function fetchBooking(
  bookingId: string,
  signal?: AbortSignal,
): Promise<BookingDetail> {
  const { data } = await apiClient.get<BookingDetail>(ENDPOINTS.bookingById(bookingId), {
    signal,
  });
  return data;
}

/**
 * Pay for and confirm a booking.
 *
 * `idempotencyKey` is a required argument rather than something generated in
 * here. If this function minted its own key, every retry would look like a new
 * attempt and the protection would be worthless - the caller has to hold the
 * key steady across retries for it to mean anything.
 */
export async function payBooking(input: {
  bookingId: string;
  idempotencyKey: string;
  outcome: PaymentOutcome;
}): Promise<BookingDetail> {
  const { data } = await apiClient.post<BookingDetail>(
    ENDPOINTS.payBooking(input.bookingId),
    { idempotencyKey: input.idempotencyKey, outcome: input.outcome },
  );
  return data;
}

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const { data } = await apiClient.post<Booking>(ENDPOINTS.cancelBooking(bookingId));
  return data;
}

/** Active bookings a child already holds, keyed by class. */
export async function fetchStudentBookings(
  studentId: string,
  signal?: AbortSignal,
): Promise<ActiveBooking[]> {
  const { data } = await apiClient.get<ActiveBooking[]>(
    ENDPOINTS.studentBookings(studentId),
    { signal },
  );
  return data;
}

export async function fetchRoster(classId: string, signal?: AbortSignal): Promise<Roster> {
  const { data } = await apiClient.get<Roster>(ENDPOINTS.roster(classId), { signal });
  return data;
}

/** Restores the seed data. Demo tooling, not part of the product. */
export async function resetDemoData(): Promise<void> {
  await apiClient.post(ENDPOINTS.devReset());
}
