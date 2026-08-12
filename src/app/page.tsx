import { Container } from '@/components/layout/Container';
import { PageHeading } from '@/components/layout/PageHeading';
import { PageTransition } from '@/components/layout/PageTransition';
import { ClassBrowser } from '@/components/classes/ClassBrowser';

export default function HomePage() {
  return (
    <Container>
      <PageTransition>
        <PageHeading
          title="Book a trial class"
          description="Pick a child and a class. Trial classes are capped at four students, and a seat is only yours once payment has succeeded - choosing a class does not hold it."
        />
        <ClassBrowser />
      </PageTransition>
    </Container>
  );
}
