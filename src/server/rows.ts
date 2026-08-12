import 'server-only';
import type {
  Booking,
  BookingStatus,
  FailureReason,
  Parent,
  PaymentAttempt,
  Student,
  TrialClass,
} from '@/types';

/**
 * Row -> domain mappers.
 *
 * These exist for one reason that is easy to miss: postgres.js returns
 * `timestamptz` as a JavaScript `Date`, and `JSON.stringify` would happily
 * serialise that to an ISO string of its own accord. Doing it explicitly here
 * keeps the wire format a stated decision rather than a side effect of the
 * driver, so swapping the driver cannot silently change the API contract.
 *
 * `seatsRemaining` is likewise derived here on every read rather than stored,
 * so it cannot drift from `confirmedCount`.
 */

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export interface TrialClassRow {
  id: string;
  subject: string;
  startsAt: Date;
  capacity: number;
  confirmedCount: number;
}

export function toTrialClass(row: TrialClassRow): TrialClass {
  return {
    id: row.id,
    subject: row.subject,
    startsAt: iso(row.startsAt),
    capacity: row.capacity,
    confirmedCount: row.confirmedCount,
    seatsRemaining: Math.max(0, row.capacity - row.confirmedCount),
  };
}

export interface StudentRow {
  id: string;
  parentId: string;
  name: string;
  grade: number;
}

export function toStudent(row: StudentRow): Student {
  return { id: row.id, parentId: row.parentId, name: row.name, grade: row.grade };
}

export interface ParentRow {
  id: string;
  name: string;
  email: string;
}

export function toParent(row: ParentRow, students: Student[]): Parent {
  return { id: row.id, name: row.name, email: row.email, students };
}

export interface BookingRow {
  id: string;
  studentId: string;
  trialClassId: string;
  status: BookingStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    studentId: row.studentId,
    trialClassId: row.trialClassId,
    status: row.status,
    failureReason: (row.failureReason as FailureReason | null) ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export interface PaymentAttemptRow {
  id: string;
  bookingId: string;
  idempotencyKey: string;
  amountCents: number;
  result: PaymentAttempt['result'];
  providerRef: string | null;
  createdAt: Date;
}

export function toPaymentAttempt(row: PaymentAttemptRow): PaymentAttempt {
  return {
    id: row.id,
    bookingId: row.bookingId,
    idempotencyKey: row.idempotencyKey,
    amountCents: row.amountCents,
    result: row.result,
    providerRef: row.providerRef,
    createdAt: iso(row.createdAt),
  };
}
