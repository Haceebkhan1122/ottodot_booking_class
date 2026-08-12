import type { PaymentAttempt, PaymentAttemptResult } from '@/types';
import { formatMoney } from '@/utils/format';
import { cn } from '@/utils/cn';

const RESULT_COPY: Record<PaymentAttemptResult, { label: string; note: string; tone: string }> =
  {
    authorized: {
      label: 'Authorised',
      note: 'Funds earmarked by the bank. Nothing has moved yet.',
      tone: 'text-warning-text',
    },
    captured: {
      label: 'Captured',
      note: 'Payment taken. This is the only result that moves money.',
      tone: 'text-success-text',
    },
    declined: {
      label: 'Declined',
      note: 'The bank refused the card. No seat was touched.',
      tone: 'text-danger-text',
    },
    voided: {
      label: 'Voided',
      note: 'Authorisation released without charging. The seat was lost.',
      tone: 'text-danger-text',
    },
  };

/**
 * Append-only history of every payment attempt on this booking.
 *
 * This is not debug output left in by accident - it is the evidence behind
 * "your card was never charged". A parent who has just been told another
 * family took the last seat is entitled to see, in order, that the money was
 * authorised and then released rather than taken.
 */
export function PaymentAttemptList({ attempts }: { attempts: PaymentAttempt[] }) {
  if (attempts.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No payment has been attempted for this booking yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {attempts.map((attempt, index) => {
        const copy = RESULT_COPY[attempt.result];

        return (
          <li key={attempt.id} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-[11px] font-semibold text-text-muted"
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className={cn('font-semibold', copy.tone)}>{copy.label}</span>
                <span className="text-text-muted"> · {formatMoney(attempt.amountCents)}</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{copy.note}</p>
              <p className="mt-1 font-mono text-[11px] break-all text-text-muted">
                key: {attempt.idempotencyKey}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
