import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-2 py-10 text-center">
      {icon && <div className="text-ink-3 [&>svg]:size-8">{icon}</div>}
      <p className="text-body font-medium text-ink-2">{title}</p>
      {hint && <p className="text-body-sm text-ink-3 max-w-sm">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
