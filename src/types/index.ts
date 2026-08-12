/**
 * Domain types for the trial booking system.
 *
 * These mirror the database schema 1:1, so a change to one is a compile error
 * in the other rather than a runtime surprise.
 */

/**
 * Booking lifecycle - the four statuses named in the brief, and no more.
 *
 *   pending_payment  created, holds no seat
 *   confirmed        payment captured, seat taken
 *   payment_failed   the payment step did not complete
 *   cancelled        a person cancelled it
 *
 * `payment_failed` covers both ways the payment step can fail: a declined card
 * and losing the last seat to another parent. In both cases no money moved and
 * no seat was taken; `failureReason` ('payment_declined' vs 'class_full')
 * records which, and the UI reads it so a parent who was outbid is never told
 * to check their card.
 *
 * `cancelled` means a person cancelled it. The system never sets it.
 */
export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'payment_failed'
  | 'cancelled';

/** Deterministic outcomes for the mock payment provider. No randomness. */
export type PaymentOutcome = 'success' | 'decline' | 'slow';

/** Result of a single payment attempt, append-only in the data model. */
export type PaymentAttemptResult = 'authorized' | 'captured' | 'declined' | 'voided';

/**
 * Machine-readable failure reasons. The UI maps these to human copy in
 * `helpers/errorMessages.ts` - it never renders a raw reason string.
 */
export type FailureReason =
  | 'class_full'
  | 'duplicate_active_booking'
  | 'payment_declined'
  | 'booking_not_found'
  | 'class_not_found'
  | 'student_not_found'
  | 'class_already_started'
  | 'invalid_state'
  | 'network_error'
  | 'unknown_error';

export interface Parent {
  id: string;
  name: string;
  email: string;
  students: Student[];
}

export interface Student {
  id: string;
  parentId: string;
  name: string;
  grade: number;
}

export interface TrialClass {
  id: string;
  subject: string;
  /** ISO 8601 UTC string. Formatting is a presentation concern. */
  startsAt: string;
  capacity: number;
  confirmedCount: number;
  /**
   * Derived server-side: `capacity - confirmedCount`.
   *
   * This number is a snapshot, never a promise. Only the confirm transaction
   * knows the truth at the moment money moves.
   */
  seatsRemaining: number;
}

export interface PaymentAttempt {
  id: string;
  bookingId: string;
  idempotencyKey: string;
  amountCents: number;
  result: PaymentAttemptResult;
  providerRef: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  studentId: string;
  trialClassId: string;
  status: BookingStatus;
  failureReason: FailureReason | null;
  createdAt: string;
  updatedAt: string;
}

/** Booking joined with the rows a screen needs, so the UI makes one request. */
export interface BookingDetail extends Booking {
  student: Student;
  parent: Pick<Parent, 'id' | 'name' | 'email'>;
  trialClass: TrialClass;
  paymentAttempts: PaymentAttempt[];
}

/** A booking a child currently holds for a class, as far as the rules care. */
export interface ActiveBooking {
  bookingId: string;
  trialClassId: string;
  status: Extract<BookingStatus, 'pending_payment' | 'confirmed'>;
}

export interface RosterEntry {
  bookingId: string;
  studentId: string;
  studentName: string;
  grade: number;
  parentName: string;
  parentEmail: string;
  confirmedAt: string;
}

export interface Roster {
  trialClass: TrialClass;
  confirmed: RosterEntry[];
  /** Non-confirmed bookings, shown so staff can see who fell out and why. */
  otherBookings: Array<{
    bookingId: string;
    studentId: string;
    studentName: string;
    status: BookingStatus;
    failureReason: FailureReason | null;
  }>;
}

/* ------------------------------------------------------------------ */
/* API envelopes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Every mutation returns this shape. A business rejection is not an
 * exception - it is an expected outcome with a reason attached.
 */
export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: FailureReason; message: string; details?: FailureDetails };

/**
 * Extra context attached to a refusal.
 *
 * Telling a parent "this child already has a booking for this class" and then
 * leaving them to find it is a dead end - and because the uniqueness rule
 * covers pending bookings, that dead end also locks the child out of the class
 * permanently. When the server knows which row caused the refusal it says so,
 * and the UI offers a way there instead of a description of one.
 */
export interface FailureDetails {
  bookingId?: string;
}

export interface ApiErrorShape {
  reason: FailureReason;
  message: string;
  status: number;
  details?: FailureDetails;
}
