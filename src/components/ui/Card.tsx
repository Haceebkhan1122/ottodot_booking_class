import { cn } from '@/utils/cn';

export function Card({
  children,
  className,
  as: Tag = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li' }) {
  return (
    <Tag
      className={cn(
        'rounded-xl border border-border bg-surface p-5',
        'shadow-[0_1px_2px_rgb(16_16_24_/_0.04)]',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  /** Heading level. Never hard-coded, so page outlines stay valid (WCAG 1.3.1). */
  as: Heading = 'h2',
  id,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Heading id={id} className="text-base font-semibold text-text">
          {title}
        </Heading>
        {description && (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
