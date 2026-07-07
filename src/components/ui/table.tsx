import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

// Responsive table (DESIGN.md §4): sticky header, row hover, and the wide
// content scrolls inside its own container — the page never scrolls sideways.
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full border-collapse text-body">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 bg-surface">{children}</thead>;
}

export function Th({
  children,
  className = "",
  ...rest
}: { children?: ReactNode; className?: string } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`text-left px-3 py-2 overline border-b border-line whitespace-nowrap ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Tr({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={`hover:bg-surface-2/60 transition-colors duration-120 ${className}`}>
      {children}
    </tr>
  );
}

export function Td({
  children,
  className = "",
  ...rest
}: { children?: ReactNode; className?: string } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-3 py-2.5 border-b border-line/60 align-middle ${className}`} {...rest}>
      {children}
    </td>
  );
}
