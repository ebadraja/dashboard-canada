import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";

// Role-based landing (DESIGN.md §5.0/§5.5): everyone goes straight to their
// own screen; logged-out visitors go to login.
export default async function Home() {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user || !user.active) redirect("/login");

  redirect(
    user.role === "va" ? "/va" : user.role === "doctor" ? "/doctor" : "/operator",
  );
}
