import { cn } from '@/utils/cn';

/**
 * Loading placeholder.
 *
 * Hidden from assistive tech: a screen reader user gains nothing from hearing
 * about grey rectangles. The wait itself is announced once by the container's
 * `aria-busy`, which is the useful signal.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
    />
  );
}

export function ClassCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/3" />
      <Skeleton className="mt-5 h-2 w-full" />
      <div className="mt-5 flex gap-3">
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-24" />
      </div>
    </div>
  );
}
