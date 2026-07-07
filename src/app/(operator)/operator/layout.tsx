import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import { AppShell } from "@/components/ui/app-shell";
import { OperatorNav } from "./nav";

// The control room shell (Doc 3 / DESIGN.md §5.4). Highest privilege — the
// server check here is a convenience redirect; the real wall is the guard on
// every /api/operator/* handler.
export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let name: string;
  try {
    const caller = await requireUser(["operator"]);
    name = caller.name;
  } catch {
    redirect("/login");
  }

  return (
    <AppShell title="Control room" userName={name} userRole="operator">
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <OperatorNav />
        <div className="min-w-0 flex-1 grid gap-4">{children}</div>
      </div>
    </AppShell>
  );
}
