'use client';

import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ClassCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeatMeter } from '@/components/classes/SeatMeter';
import { StaggerItem, StaggerList } from '@/components/layout/PageTransition';

import { useApiResource } from '@/hooks/useApiResource';
import { fetchClasses } from '@/apiservice/bookingApi';
import { getSeatPresentation } from '@/helpers/seats';
import { formatClassDateTime, formatClassDateTimeLong, toDateTimeAttr } from '@/utils/format';

export function RosterIndex() {
  const query = useApiResource((signal) => fetchClasses(signal), []);

  if (query.error) {
    return (
      <Alert tone="danger" title="Could not load classes" live="assertive">
        {query.error.message}
      </Alert>
    );
  }

  if (query.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
        <ClassCardSkeleton />
        <ClassCardSkeleton />
      </div>
    );
  }

  if ((query.data?.length ?? 0) === 0) {
    return <EmptyState title="No classes scheduled" />;
  }

  return (
    <StaggerList className="grid list-none gap-4 sm:grid-cols-2">
      {query.data?.map((trialClass) => {
        const seats = getSeatPresentation(trialClass);

        return (
          <StaggerItem key={trialClass.id}>
            {/*
              The whole card is one link rather than a card containing a link.
              Nested interactive elements give keyboard users two tab stops for
              one destination, and screen readers announce the link twice.
            */}
            <Link
              href={`/admin/roster/${trialClass.id}`}
              className="block h-full rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text">{trialClass.subject}</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    <time dateTime={toDateTimeAttr(trialClass.startsAt)}>
                      <span aria-hidden="true">
                        {formatClassDateTime(trialClass.startsAt)} UTC
                      </span>
                      <span className="sr-only">
                        {formatClassDateTimeLong(trialClass.startsAt)} UTC
                      </span>
                    </time>
                  </p>
                </div>
                <Badge tone={seats.tone} srLabel={seats.announcement}>
                  {seats.label}
                </Badge>
              </div>

              <div className="mt-5">
                <SeatMeter trialClass={trialClass} />
              </div>

              <p className="mt-4 text-sm font-medium text-primary-text">
                Open roster <span aria-hidden="true">→</span>
              </p>
            </Link>
          </StaggerItem>
        );
      })}
    </StaggerList>
  );
}
