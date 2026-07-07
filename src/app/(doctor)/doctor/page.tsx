import { redirect } from "next/navigation";
import { requireUser } from "@/server/guard";
import Dashboard from "./dashboard";

// The Doctor view (Doc 2): read-only report card. The server-side check is a
// convenience redirect — real enforcement is the API guard on /api/doctor/*.
export default async function DoctorPage() {
  try {
    const caller = await requireUser(["doctor"]);
    return <Dashboard doctorName={caller.name} />;
  } catch {
    redirect("/login");
  }
}
