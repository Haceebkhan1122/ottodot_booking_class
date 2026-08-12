import { cn } from '@/utils/cn';

/**
 * Page width and gutters.
 *
 * `max-w-5xl` keeps line length in the comfortable range without a separate
 * prose wrapper (WCAG 1.4.8 asks for no more than ~80 characters), and the
 * gutters step up rather than collapsing to zero on small screens.
 */
export function Container({
  children,
  className,
  size = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  size?: 'default' | 'wide' | 'narrow';
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        size === 'narrow' && 'max-w-3xl',
        size === 'default' && 'max-w-5xl',
        size === 'wide' && 'max-w-7xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
