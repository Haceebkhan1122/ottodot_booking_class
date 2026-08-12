import { Container } from '@/components/layout/Container';
import { PageHeading } from '@/components/layout/PageHeading';
import { PageTransition } from '@/components/layout/PageTransition';
import { RosterIndex } from '@/components/roster/RosterIndex';

export default function RosterIndexPage() {
  return (
    <Container>
      <PageTransition>
        <PageHeading
          title="Class rosters"
          description="The teacher-facing view. Pick a class to see exactly who will be in the room, and who dropped out along the way."
        />
        <RosterIndex />
      </PageTransition>
    </Container>
  );
}
