import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

import { Header } from '@/components/layout/Header';
import { LenisProvider } from '@/components/providers/LenisProvider';
import { MotionProvider } from '@/components/providers/MotionProvider';
import { Toaster } from '@/components/ui/Toaster';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ottodot · Trial class booking',
  description:
    'Book a trial science or maths class. Seats are capped at four per class and only confirmed once payment succeeds.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `lang` is required for screen readers to pick the right pronunciation
    // rules (WCAG 3.1.1).
    /*
      The font variables belong on <html>, not <body>.

      `--font-sans` is declared in the Tailwind theme block, which lands on
      :root. If `--font-geist-sans` is only defined on <body>, the :root
      declaration resolves against an undefined variable, becomes invalid at
      computed-value time, and every element silently falls back to the
      preflight system stack - Geist loads over the network and is then never
      used by anything.
    */
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <MotionProvider>
          <LenisProvider>
            {/*
              Skip link. First focusable element on the page, hidden until
              focused (WCAG 2.4.1). Without it a keyboard user tabs through the
              whole nav on every single page before reaching the content.
            */}
            <a
              href="#main"
              className="skip-link m-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-md)]"
            >
              Skip to main content
            </a>

            <Header />

            <main id="main" tabIndex={-1} className="py-10 sm:py-14">
              {children}
            </main>

            <footer className="border-t border-border py-8">
              <p className="text-center text-xs text-text-muted">
                Take-home exercise · Trial booking slice · Seats capped at 4 per class
              </p>
            </footer>

            <Toaster />
          </LenisProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
