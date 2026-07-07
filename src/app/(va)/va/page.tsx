import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import Rail from "./rail";

// The VA view (Doc 1). Server-side role check is a convenience redirect —
// the real enforcement is in the API guard, which every action goes through.
export default async function VaPage() {
  try {
    const caller = await requireUser(["va"]);
    return <Rail vaName={caller.name} />;
  } catch {
    redirect("/login");
  }
}
