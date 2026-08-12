'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Reads the OS "reduce motion" setting and keeps up with changes to it.
 *
 * WCAG 2.3.3 covers animation triggered by interaction, and smooth scrolling
 * is the worst offender in this app: hijacking the scroll wheel can trigger
 * nausea and dizziness for people with vestibular disorders. So the JS-driven
 * motion - Lenis and Framer Motion - is switched off here rather than merely
 * shortened, while the CSS block in `globals.css` catches everything else.
 *
 * The initial value is `false` on purpose: the server cannot know the user's
 * preference, so both sides render the same markup and the correction happens
 * on mount. One frame of motion is a better trade than a hydration mismatch.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(QUERY);
    setPrefersReducedMotion(mediaQuery.matches);

    const onChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return prefersReducedMotion;
}
