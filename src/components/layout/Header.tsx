'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Container } from './Container';
import { cn } from '@/utils/cn';

const NAV = [
  { href: '/', label: 'Trial classes' },
  { href: '/admin/roster', label: 'Rosters' },
  { href: '/race-demo', label: 'Race demo' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            /* h-11: the visible mark is 32px, but the tappable area should not
               be. 44px keeps the home link a comfortable thumb target
               (WCAG 2.5.5) without changing how it looks. */
            className="flex h-11 items-center gap-2.5 rounded-md text-sm font-semibold text-text"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-bold text-white"
            >
              od
            </span>
            <span>
              Ottodot
              {/*
                Dropped below 640px. The logo plus three nav items came to
                392px against a 375px viewport, which pushed the whole document
                into horizontal scroll - on every page, because the header is
                in the root layout. The subtitle is the least useful 68px on
                the bar, so it is the first thing to go.
              */}
              <span className="ml-1.5 hidden font-normal text-text-muted sm:inline">
                Trial booking
              </span>
            </span>
          </Link>

          <nav aria-label="Main">
            <ul className="flex items-center gap-0.5 sm:gap-1">
              {NAV.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      // WCAG 1.4.1 again: the active tab is not signalled by
                      // colour alone. `aria-current` carries it for assistive
                      // tech and the underline carries it visually.
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'inline-flex h-9 items-center rounded-md px-2 text-[13px] transition-colors',
                        'sm:px-3 sm:text-sm',
                        isActive
                          ? 'font-medium text-primary-text underline decoration-2 underline-offset-8'
                          : 'text-text-muted hover:bg-surface-2 hover:text-text',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </Container>
    </header>
  );
}
