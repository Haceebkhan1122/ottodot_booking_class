import { cn } from '@/utils/cn';
import { TONE_CLASSES, type Tone } from '@/helpers/bookingStatus';

const GLYPHS: Record<Tone, string> = {
  success: '✓',
  danger: '✕',
  warning: '!',
  neutral: 'i',
  primary: 'i',
};

interface AlertProps {
  tone?: Tone;
  title?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Set when the alert appears in response to something the user just did.
   *
   * A static explanatory note should not hijack a screen reader, and an error
   * that appears after a click must not be missed - so the live region is
   * opt-in rather than always on.
   */
  live?: 'off' | 'polite' | 'assertive';
  className?: string;
  action?: React.ReactNode;
}

export function Alert({
  tone = 'neutral',
  title,
  children,
  live = 'off',
  className,
  action,
}: AlertProps) {
  return (
    <div
      role={live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined}
      aria-live={live === 'off' ? undefined : live}
      className={cn('rounded-lg border p-4 text-sm', TONE_CLASSES[tone], className)}
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold"
        >
          {GLYPHS[tone]}
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          <div className={cn(title && 'mt-1', 'leading-relaxed')}>{children}</div>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}
