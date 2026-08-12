'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore, type Toast } from '@/store/useAppStore';
import { TONE_CLASSES } from '@/helpers/bookingStatus';
import { MOTION } from '@/constants';
import { cn } from '@/utils/cn';

const AUTO_DISMISS_MS = 6_000;

/**
 * Toasts, rendered once at the root.
 *
 * Accessibility notes, because toasts are easy to get wrong:
 *
 *  - Two separate live regions. Errors go in the assertive one so they
 *    interrupt; confirmations go in the polite one so they wait for a pause.
 *    Announcing "booking confirmed" over the top of someone reading a form is
 *    as unhelpful as staying silent about a failure.
 *
 *  - The regions are always in the DOM, empty. A live region added at the same
 *    moment as its content is frequently not announced at all.
 *
 *  - Errors do not auto-dismiss. A message that vanishes before it is read is
 *    a WCAG 2.2.1 problem, and an error is precisely the thing a user needs
 *    time with.
 */
export function Toaster() {
  const toasts = useAppStore((s) => s.toasts);

  return (
    /*
      A landmark, so the toast machinery is not orphaned content.
      Everything on a page should sit inside one - anything that does not is
      skipped by users who navigate by landmark, and a dismiss button they
      cannot find is a control that may as well not exist. `aside` gives the
      complementary role without another wrapper.
    */
    <aside aria-label="Notifications">
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {toasts.filter((t) => !t.assertive).map((t) => (
          <p key={t.id}>
            {t.title}. {t.description} {t.action ? `Action available: ${t.action.label}.` : ''}
          </p>
        ))}
      </div>
      <div aria-live="assertive" aria-atomic="false" className="sr-only">
        {toasts.filter((t) => t.assertive).map((t) => (
          <p key={t.id}>
            {t.title}. {t.description} {t.action ? `Action available: ${t.action.label}.` : ''}
          </p>
        ))}
      </div>

      {/*
        The visual stack is intentionally NOT a live region - the two sr-only
        regions above already announce every toast, and duplicating the markup
        into a second live region would read each one twice.

        It is also not `aria-hidden`, even though that would be the quick way
        to stop the double announcement: each toast owns a focusable dismiss
        button, and hiding a focusable element from assistive tech creates a
        control a keyboard user can reach but a screen reader cannot describe.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} />
          ))}
        </AnimatePresence>
      </div>
    </aside>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useAppStore((s) => s.dismissToast);

  useEffect(() => {
    // Errors stay put, and so does anything carrying an action - a button that
    // disappears while you are reaching for it is worse than no button.
    if (toast.assertive || toast.action) return;
    const timer = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.assertive, toast.action, dismissToast]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: MOTION.fastDuration, ease: MOTION.ease }}
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 shadow-[var(--shadow-md)]',
        TONE_CLASSES[toast.tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-sm leading-relaxed opacity-90">{toast.description}</p>
          )}
          {toast.action && (
            <Link
              href={toast.action.href}
              onClick={() => dismissToast(toast.id)}
              className="mt-2 inline-flex h-9 items-center rounded-lg border border-current px-3 text-sm font-medium"
            >
              {toast.action.label}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-lg leading-none opacity-70 hover:opacity-100"
        >
          <span aria-hidden="true">×</span>
          <span className="sr-only">Dismiss notification: {toast.title}</span>
        </button>
      </div>
    </motion.div>
  );
}
