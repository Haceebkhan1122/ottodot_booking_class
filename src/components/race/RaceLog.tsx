'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { MOTION } from '@/constants';

export interface RaceLogEntry {
  id: string;
  /** Milliseconds since the run started, so ordering is obvious at a glance. */
  atMs: number;
  actor: string;
  message: string;
  tone: 'info' | 'win' | 'lose';
}

const TONE_CLASSES: Record<RaceLogEntry['tone'], string> = {
  info: 'text-text-muted',
  win: 'text-success-text font-medium',
  lose: 'text-danger-text',
};

/**
 * Timeline of what happened, newest last.
 *
 * A `role="log"` live region: additions are announced, and unlike `alert` the
 * screen reader is not interrupted mid-sentence for each one. During a
 * ten-way race that difference is the gap between a useful narration and an
 * unusable stream of interruptions.
 */
export function RaceLog({ entries }: { entries: RaceLogEntry[] }) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Race event log"
      /*
        `tabIndex={0}` because this box scrolls (WCAG 2.1.1). A scrollable
        region whose contents are all plain text has nothing focusable inside
        it, so without an explicit tab stop a keyboard-only user can reach the
        buttons around the log but can never scroll the log itself - the
        earlier entries simply become unreachable.
      */
      tabIndex={0}
      className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]"
    >
      {entries.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">
          Nothing yet. Start a lane or fire the automated race.
        </p>
      ) : (
        <ol className="space-y-1.5 font-mono text-xs">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: MOTION.fastDuration, ease: MOTION.ease }}
                className="flex gap-2"
              >
                <span className="shrink-0 tabular-nums text-text-muted">
                  +{String(entry.atMs).padStart(5, ' ')}ms
                </span>
                <span className="shrink-0 font-semibold text-text">{entry.actor}</span>
                <span className={cn('min-w-0', TONE_CLASSES[entry.tone])}>{entry.message}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}
