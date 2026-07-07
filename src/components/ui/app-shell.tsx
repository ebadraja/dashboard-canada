"use client";

import { Activity, ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import { ThemeToggle } from "./theme-toggle";

// The shared shell (DESIGN.md §4): slim top bar with product mark, screen
// title, optional live indicator, theme toggle, and a user menu with the
// sign-out that never existed before this redesign.
export function AppShell({
  title,
  userName,
  userRole,
  live, // undefined = no indicator; true = connected; false = reconnecting
  right,
  children,
}: {
  title: string;
  userName: string;
  userRole: string;
  live?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-line">
        <div className="flex items-center gap-3 h-13 px-4 max-w-[1400px] mx-auto py-2">
          <div className="flex items-center gap-2 text-ink font-semibold text-body">
            <span className="grid place-items-center size-7 rounded-lg bg-accent text-on-accent">
              <Activity className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">AI Receptionist</span>
          </div>
          <span className="text-ink-3">/</span>
          <h1 className="text-body font-medium text-ink-2 truncate">{title}</h1>

          {live !== undefined && (
            <span
              className={`inline-flex items-center gap-1.5 text-caption font-medium ml-1
                ${live ? "text-success" : "text-warning"}`}
            >
              <span
                className={`size-1.5 rounded-full ${live ? "bg-success animate-pulse" : "bg-warning"}`}
                aria-hidden
              />
              {live ? "Live" : "Reconnecting…"}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {right}
            <ThemeToggle />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 h-8 pl-1.5 pr-2 rounded-lg
                  hover:bg-surface-2 transition-colors duration-120"
              >
                <span
                  className="grid place-items-center size-6 rounded-full bg-surface-2
                    text-caption font-semibold text-ink-2"
                >
                  {userName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:block text-body-sm text-ink-2 max-w-32 truncate">
                  {userName}
                </span>
                <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-52 bg-surface border border-line
                    rounded-xl shadow-lg py-1.5 text-body"
                >
                  <div className="px-3 py-1.5">
                    <p className="font-medium truncate">{userName}</p>
                    <p className="text-caption text-ink-3 capitalize">{userRole}</p>
                  </div>
                  <div className="border-t border-line my-1" />
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-ink-2
                        hover:bg-surface-2 transition-colors duration-120"
                    >
                      <LogOut className="size-4" aria-hidden />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto px-4 py-5">{children}</main>
    </div>
  );
}
