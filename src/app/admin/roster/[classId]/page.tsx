import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { PageTransition } from '@/components/layout/PageTransition';
import { RosterView } from '@/components/roster/RosterView';

export default async function RosterDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;

  return (
    <Container size="narrow">
      <PageTransition>
        {/*
          The <h1> is rendered by the server, not by the client component that
          loads the roster. If it only appeared once the data arrived, the page
          would have no heading at all while loading - so a screen reader user
          landing here would be told nothing about where they are, and the
          heading would pop into the outline a second later.

          The class name is a level down, inside the loaded content.
        */}
        <Link
          href="/admin/roster"
          className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-text-muted hover:text-text"
        >
          <span aria-hidden="true">←</span>
          All rosters
        </Link>
        <h1 className="mb-8 text-2xl font-semibold tracking-tight text-text sm:text-3xl">
          Class roster
        </h1>

        <RosterView classId={classId} />
      </PageTransition>
    </Container>
  );
}
