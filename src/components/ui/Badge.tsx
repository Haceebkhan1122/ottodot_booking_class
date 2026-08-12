import { cn } from '@/utils/cn';
import { TONE_CLASSES, type Tone } from '@/helpers/bookingStatus';

interface BadgeProps {
  tone?: Tone;
  /**
   * A short symbol shown before the label.
   *
   * WCAG 1.4.1: colour is never the only carrier of meaning here. Every badge
   * has a text label, and the glyph gives a second non-colour cue for anyone
   * scanning quickly or viewing in greyscale. It is hidden from screen readers
   * because the label already says it.
   */
  glyph?: string;
  /** Longer text for assistive tech when the visible label is abbreviated. */
  srLabel?: string;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', glyph, srLabel, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {glyph && (
        <span aria-hidden="true" className="font-semibold leading-none">
          {glyph}
        </span>
      )}
      {srLabel ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">{srLabel}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
