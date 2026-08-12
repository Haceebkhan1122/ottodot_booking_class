import { Card } from './Card';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}
