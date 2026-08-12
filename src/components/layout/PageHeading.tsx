import Link from 'next/link';

/**
 * The single `<h1>` for a page, plus an optional back link.
 *
 * Every page renders exactly one of these. A page with no `<h1>`, or with
 * several, breaks the heading outline screen reader users navigate by
 * (WCAG 1.3.1, 2.4.6).
 */
export function PageHeading({
  title,
  description,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-text-muted hover:text-text"
        >
          <span aria-hidden="true">←</span>
          {backLabel ?? 'Back'}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
