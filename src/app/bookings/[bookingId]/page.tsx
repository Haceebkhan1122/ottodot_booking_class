import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { PageTransition } from '@/components/layout/PageTransition';
import { BookingStatusView } from '@/components/booking/BookingStatusView';

export default async function BookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  return (
    <Container size="narrow">
      <PageTransition>
        {/*
          Server-rendered <h1>, for the same reason as the roster page: the
          booking details load client-side, and a page whose only heading
          appears after a network round trip has no heading at all for anyone
          who arrives while it is still loading.
        */}
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-text-muted hover:text-text"
        >
          <span aria-hidden="true">←</span>
          All trial classes
        </Link>
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-text sm:text-3xl">
          Your trial booking
        </h1>

        <BookingStatusView bookingId={bookingId} />
      </PageTransition>
    </Container>
  );
}
