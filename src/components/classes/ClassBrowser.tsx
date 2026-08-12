'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ParentStudentPicker } from '@/components/parents/ParentStudentPicker';
import { ClassCard } from './ClassCard';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ClassCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StaggerItem, StaggerList } from '@/components/layout/PageTransition';

import { useApiResource } from '@/hooks/useApiResource';
import { readStoredParentId, useAppStore } from '@/store/useAppStore';
import {
  createBooking,
  fetchClasses,
  fetchParents,
  fetchStudentBookings,
} from '@/apiservice/bookingApi';
import { toApiError } from '@/apiservice/axiosInstance';
import { isRetryableReason } from '@/helpers/errorMessages';
import type { TrialClass } from '@/types';

export function ClassBrowser() {
  const router = useRouter();
  const pushToast = useAppStore((s) => s.pushToast);
  const selectedParentId = useAppStore((s) => s.selectedParentId);
  const setSelectedParentId = useAppStore((s) => s.setSelectedParentId);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [bookingClassId, setBookingClassId] = useState<string | null>(null);

  const parentsQuery = useApiResource((signal) => fetchParents(signal), []);
  const classesQuery = useApiResource((signal) => fetchClasses(signal), []);

  /*
   * What this child has already started.
   *
   * Without it the class list cannot tell "never booked" from "booked and
   * abandoned", and the only feedback a parent gets for the second case is a
   * refusal after they click. Knowing up front turns a dead end into a link.
   */
  const myBookingsQuery = useApiResource(
    (signal) =>
      selectedStudentId ? fetchStudentBookings(selectedStudentId, signal) : Promise.resolve([]),
    [selectedStudentId],
  );

  const parents = useMemo(() => parentsQuery.data ?? [], [parentsQuery.data]);

  /*
   * Resolve who is booking, once the parent list arrives.
   *
   * Order: whatever is already in the store, then whatever the last refresh
   * left in sessionStorage, then the first parent. Falling straight through to
   * `parents[0]` would silently switch parents on every reload.
   *
   * Reading storage here rather than in the store's initialiser keeps the
   * first client render identical to the server's, so hydration stays quiet.
   */
  useEffect(() => {
    if (parents.length === 0) return;

    const parent =
      parents.find((p) => p.id === selectedParentId) ??
      parents.find((p) => p.id === readStoredParentId()) ??
      parents[0];

    if (parent.id !== selectedParentId) setSelectedParentId(parent.id);

    const stillValid = parent.students.some((s) => s.id === selectedStudentId);
    if (!stillValid) setSelectedStudentId(parent.students[0]?.id ?? null);
  }, [parents, selectedParentId, selectedStudentId, setSelectedParentId]);

  const selectedParent = parents.find((p) => p.id === selectedParentId) ?? null;
  const selectedStudent =
    selectedParent?.students.find((s) => s.id === selectedStudentId) ?? null;

  async function handleBook(trialClass: TrialClass) {
    if (!selectedStudent) return;

    setBookingClassId(trialClass.id);

    try {
      const booking = await createBooking({
        studentId: selectedStudent.id,
        trialClassId: trialClass.id,
      });

      // Straight to the payment step. The booking exists but holds nothing -
      // the seat is still up for grabs until the confirm call succeeds.
      router.push(`/bookings/${booking.id}`);
    } catch (caught) {
      const error = toApiError(caught);

      pushToast({
        tone: 'danger',
        title: 'Could not start this booking',
        description: error.message,
        assertive: true,
        // The refusal names the booking that caused it, so the toast can offer
        // the way there rather than describing one.
        action: error.details?.bookingId
          ? { label: 'Open existing booking', href: `/bookings/${error.details.bookingId}` }
          : undefined,
      });

      // Someone else may have taken a seat since this page loaded, so refresh
      // the counts rather than leaving a stale number on screen.
      if (!isRetryableReason(error.reason)) {
        void classesQuery.refetch();
        void myBookingsQuery.refetch();
      }
    } finally {
      setBookingClassId(null);
    }
  }

  const isLoading = parentsQuery.isLoading || classesQuery.isLoading;
  const loadError = parentsQuery.error ?? classesQuery.error;

  if (loadError) {
    return (
      <Alert
        tone="danger"
        title="We could not load the trial classes"
        live="assertive"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void parentsQuery.refetch();
              void classesQuery.refetch();
            }}
          >
            Try again
          </Button>
        }
      >
        {loadError.message}
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      {isLoading ? (
        <div className="h-[132px] animate-pulse rounded-xl border border-dashed border-border bg-surface" />
      ) : (
        <ParentStudentPicker
          parents={parents}
          selectedParentId={selectedParentId}
          selectedStudentId={selectedStudentId}
          onSelectParent={(parentId) => {
            setSelectedParentId(parentId);
            const next = parents.find((p) => p.id === parentId);
            setSelectedStudentId(next?.students[0]?.id ?? null);
          }}
          onSelectStudent={setSelectedStudentId}
        />
      )}

      <section aria-labelledby="classes-heading" aria-busy={classesQuery.isFetching}>
        <h2 id="classes-heading" className="mb-4 text-sm font-semibold text-text">
          Available trial classes
        </h2>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ClassCardSkeleton />
            <ClassCardSkeleton />
            <ClassCardSkeleton />
            <ClassCardSkeleton />
          </div>
        ) : (classesQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No trial classes are scheduled"
            description="Once a class is added it will appear here with its remaining seats."
          />
        ) : (
          <StaggerList className="grid list-none gap-4 sm:grid-cols-2">
            {classesQuery.data?.map((trialClass) => (
              <StaggerItem key={trialClass.id}>
                <ClassCard
                  trialClass={trialClass}
                  student={selectedStudent}
                  onBook={handleBook}
                  isBooking={bookingClassId === trialClass.id}
                  existingBooking={
                    (myBookingsQuery.data ?? []).find(
                      (b) => b.trialClassId === trialClass.id,
                    ) ?? null
                  }
                />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </section>
    </div>
  );
}
