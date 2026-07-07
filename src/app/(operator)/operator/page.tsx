import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import ControlRoom from "./control-room";

// The Operator view (Doc 3): the control room. Highest privilege — the
// server-side check is a convenience redirect; the real wall is the guard
// on every /api/operator/* handler.
export default async function OperatorPage() {
  try {
    const caller = await requireUser(["operator"]);
    return <ControlRoom operatorName={caller.name} />;
  } catch {
    redirect("/login");
  }
}
