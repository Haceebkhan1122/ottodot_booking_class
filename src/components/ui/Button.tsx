'use client';

import { forwardRef } from 'react';
import { cn } from '@/utils/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover shadow-sm border border-transparent',
  secondary:
    'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-2 border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border border-transparent',
};

const SIZES: Record<Size, string> = {
  // 44px minimum touch target on the two sizes used for real actions
  // (WCAG 2.5.5). `sm` is reserved for controls that sit inside a larger
  // already-tappable row.
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  /** Announced while `isLoading`. Silence during a wait is its own bug. */
  loadingText?: string;
  /**
   * Blocks the action while keeping the button focusable.
   *
   * A `disabled` button is skipped by keyboard navigation and often ignored by
   * screen readers, so a parent using one would never find out *why* they
   * cannot book. `aria-disabled` keeps it reachable and lets us explain.
   * Pair it with `disabledReason`.
   */
  softDisabled?: boolean;
  disabledReason?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingText,
    softDisabled = false,
    disabledReason,
    className,
    children,
    disabled,
    onClick,
    ...props
  },
  ref,
) {
  const inert = softDisabled || isLoading;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-disabled={inert || undefined}
      aria-busy={isLoading || undefined}
      title={softDisabled ? disabledReason : undefined}
      onClick={(event) => {
        // `aria-disabled` is a promise to assistive tech, not an enforcement
        // mechanism - the click still has to be stopped here.
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]',
        VARIANTS[variant],
        SIZES[size],
        (inert || disabled) && 'cursor-not-allowed opacity-60',
        className,
      )}
      {...props}
    >
      {isLoading && <Spinner />}
      <span>{isLoading && loadingText ? loadingText : children}</span>
      {softDisabled && disabledReason && <span className="sr-only">. {disabledReason}</span>}
    </button>
  );
});
