'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import { usePathname } from 'next/navigation';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Smooth scrolling, with an off switch that actually works.
 *
 * Smooth scroll is a real accessibility risk, not just a taste question:
 * taking over the scroll wheel can cause nausea and dizziness for people with
 * vestibular disorders, and it is one of the clearest cases WCAG 2.3.3 is
 * aimed at. So Lenis is never initialised when the OS asks for reduced motion
 * - the browser's native scrolling is left completely alone rather than being
 * replaced with a faster hijack.
 *
 * Two smaller details that are easy to get wrong:
 *
 *  - Anchor jumps. Lenis intercepts scrolling, so `#main` links stop working
 *    unless they are routed through `lenis.scrollTo`. The skip link is the one
 *    that matters, and it is handled below.
 *
 *  - Route changes. Lenis keeps its own scroll position, so without an
 *    explicit reset a new page can open halfway down.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const pathname = usePathname();

  useEffect(() => {
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 0.9,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      // Touch devices already have good native scroll physics, and overriding
      // them mostly makes phones feel broken.
      smoothWheel: true,
      syncTouch: false,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    // Keep in-page anchors working while Lenis owns the scroll position.
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!anchor) return;

      const id = anchor.getAttribute('href')?.slice(1);
      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      event.preventDefault();
      lenis.scrollTo(target, { offset: -16 });

      // Moving the viewport is not the same as moving focus. Without this,
      // a keyboard user's focus stays behind and the next Tab jumps back up.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };

    document.addEventListener('click', onAnchorClick);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onAnchorClick);
      lenis.destroy();
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return <>{children}</>;
}
