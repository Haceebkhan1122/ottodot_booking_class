/**
 * Every URL the client can call, in one place.
 *
 * Paths are never assembled inline in a component. When phase 2 moves an
 * endpoint, this file is the only thing that changes.
 */
export const ENDPOINTS = {
  parents: () => '/parents',

  classes: () => '/classes',
  classById: (classId: string) => `/classes/${encodeURIComponent(classId)}`,

  bookings: () => '/bookings',
  bookingById: (bookingId: string) => `/bookings/${encodeURIComponent(bookingId)}`,
  payBooking: (bookingId: string) => `/bookings/${encodeURIComponent(bookingId)}/pay`,
  cancelBooking: (bookingId: string) => `/bookings/${encodeURIComponent(bookingId)}/cancel`,

  studentBookings: (studentId: string) =>
    `/students/${encodeURIComponent(studentId)}/bookings`,

  roster: (classId: string) => `/roster/${encodeURIComponent(classId)}`,

  devReset: () => '/dev/reset',
} as const;
