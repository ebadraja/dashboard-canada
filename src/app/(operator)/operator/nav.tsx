"use client";

import { LayoutDashboard, Building2, Users, Receipt } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/operator", label: "Overview", icon: LayoutDashboard },
  { href: "/operator/clinics", label: "Clinics", icon: Building2 },
  { href: "/operator/users", label: "Users", icon: Users },
  { href: "/operator/billing", label: "Billing", icon: Receipt },
];

// Left nav rail (DESIGN.md §5.4). Route segments make each section
// deep-linkable.
export function OperatorNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Operator sections"
      className="flex lg:flex-col gap-1 lg:w-44 shrink-0 overflow-x-auto"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 h-9 px-3 rounded-lg text-body font-medium
              whitespace-nowrap transition-colors duration-120
              ${active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
