'use client';

import { cn } from '@/utils/cn';

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface RadioCardGroupProps<T extends string> {
  legend: string;
  /** Hides the legend visually while keeping it for screen readers. */
  hideLegend?: boolean;
  name: string;
  value: T;
  options: ReadonlyArray<RadioCardOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * A radio group that looks like cards.
 *
 * Built on real `<input type="radio">` inside a `<fieldset>` rather than
 * clickable divs with `role="radio"`. That gets arrow-key navigation, the
 * roving tab stop, form semantics and the grouping announcement from the
 * browser for free - all of which a hand-rolled version has to reimplement and
 * usually reimplements incompletely.
 *
 * The input is positioned under the card instead of `hidden`, because a hidden
 * input cannot receive focus and the focus ring would disappear with it.
 */
export function RadioCardGroup<T extends string>({
  legend,
  hideLegend,
  name,
  value,
  options,
  onChange,
  disabled,
}: RadioCardGroupProps<T>) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={cn('mb-2 text-sm font-medium text-text', hideLegend && 'sr-only')}>
        {legend}
      </legend>

      <div className="grid gap-2">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const isSelected = value === option.value;

          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                'relative flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                'transition-colors duration-150',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                'has-[:focus-visible]:outline-[color:var(--ring)]',
                isSelected
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface hover:bg-surface-2',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--primary)]"
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    isSelected ? 'text-primary-text' : 'text-text',
                  )}
                >
                  {option.label}
                </span>
                {option.description && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
