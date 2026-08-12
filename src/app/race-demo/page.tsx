import { Container } from '@/components/layout/Container';
import { PageHeading } from '@/components/layout/PageHeading';
import { PageTransition } from '@/components/layout/PageTransition';
import { RaceDemo } from '@/components/race/RaceDemo';

export const metadata = {
  title: 'Last-seat race · Ottodot trial booking',
};

export default function RaceDemoPage() {
  return (
    <Container>
      <PageTransition>
        <PageHeading
          title="Last-seat race"
          description="Two parents, one seat. Drive them by hand to reproduce the exact sequence from the brief, or fire ten payments at once and watch nine of them get turned away."
        />
        <RaceDemo />
      </PageTransition>
    </Container>
  );
}
