"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { useId } from "react";

const fieldChrome = `w-full h-9 px-3 rounded-lg bg-surface text-ink text-body
  border border-line placeholder:text-ink-3
  focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25
  transition-colors duration-120 disabled:opacity-50`;

export function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-body-sm font-medium text-ink-2">
          {label}
        </label>
      )}
      {children}
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  );
}

export function Input({
  label,
  error,
  className = "",
  ...rest
}: {
  label?: string;
  error?: string | null;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} htmlFor={id}>
      <input id={id} className={`${fieldChrome} ${className}`} {...rest} />
    </Field>
  );
}

export function Select({
  label,
  error,
  className = "",
  children,
  ...rest
}: {
  label?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} error={error} htmlFor={id}>
      <select id={id} className={`${fieldChrome} ${className}`} {...rest}>
        {children}
      </select>
    </Field>
  );
}
