import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className = "",
  children,
  ...rest
}: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-surface border border-line rounded-xl shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 pt-4 pb-2">
      <div className="min-w-0">
        <h2 className="text-h3 font-semibold leading-6">{title}</h2>
        {subtitle && <p className="text-body-sm text-ink-3 mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`px-4 pb-4 ${className}`}>{children}</div>;
}
