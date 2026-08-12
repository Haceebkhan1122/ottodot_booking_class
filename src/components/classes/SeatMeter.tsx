'use client';

import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { MOTION } from '@/constants';
import type { TrialClass } from '@/types';
import { getSeatState } from '@/helpers/seats';

const FILL_BY_STATE = {
  available: 'bg-success',
  last_seat: 'bg-warning',
  full: 'bg-danger',
} as const;

/**
 * One block per seat, filled blocks first.
 *
 * Four seats is small enough to show individually, and a discrete count beats
 * a percentage bar here - a parent wants "one left", not "75%".
 *
 * The whole meter is a single `role="img"` with one label. Marking up four
 * separate divs would have a screen reader read "seat, seat, seat, seat" and
 * convey nothing; one sentence conveys everything.
 */
export function SeatMeter({ trialClass }: { trialClass: TrialClass }) {
  const { capacity, confirmedCount } = trialClass;
  const state = getSeatState(trialClass);
  const seats = Array.from({ length: capacity }, (_, i) => i < confirmedCount);

  return (
    <div
      role="img"
      aria-label={`${confirmedCount} of ${capacity} seats confirmed, ${Math.max(
        0,
        capacity - confirmedCount,
      )} remaining.`}
      className="flex items-center gap-1.5"
    >
      {seats.map((isTaken, index) => (
        <span
          key={index}
          className="relative h-2 w-full max-w-14 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border"
        >
          {isTaken && (
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: MOTION.fastDuration,
                delay: index * 0.04,
                ease: MOTION.ease,
              }}
              className={cn(
                'absolute inset-0 origin-left rounded-full',
                FILL_BY_STATE[state],
              )}
            />
          )}
        </span>
      ))}
    </div>
  );
}
