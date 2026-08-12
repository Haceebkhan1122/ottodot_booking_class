'use client';

import { MotionConfig } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * One place that decides whether the app animates.
 *
 * `reducedMotion="user"` makes Framer Motion drop transform and opacity
 * animations when the OS asks for it, without every component having to
 * remember. Layout still settles instantly rather than jumping, so nothing
 * appears broken - it simply stops moving.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  );
}
