import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { signIn } from "@/server/auth";
import { LoginForm } from "./login-form";

// Login (DESIGN.md §5.1): centered card, inline error, calm type.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/", // home routes by role
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1");
      throw e;
    }
  }

  return (
    <main
      className="min-h-screen grid place-items-center p-4
        bg-[radial-gradient(1200px_600px_at_50%_-10%,var(--accent-soft),var(--bg))]"
    >
      <div className="w-full max-w-[380px] animate-[fade-up_0.32s_cubic-bezier(0.2,0,0,1)]">
        <style>{`@keyframes fade-up { from { opacity: 0; transform: translateY(8px); } }`}</style>
        <div className="flex items-center justify-center gap-2 mb-5">
          <span className="grid place-items-center size-9 rounded-xl bg-accent text-on-accent">
            <Activity className="size-5" aria-hidden />
          </span>
          <span className="text-h2 font-semibold">AI Receptionist</span>
        </div>

        <div className="bg-surface border border-line rounded-xl shadow-sm p-6">
          <h1 className="text-h3 font-semibold mb-1">Sign in</h1>
          <p className="text-body-sm text-ink-3 mb-5">
            Use the credentials your operator gave you.
          </p>
          <LoginForm action={login} failed={!!error} />
        </div>

        <p className="text-center text-caption text-ink-3 mt-4">
          Access is provisioned by your operator.
        </p>
      </div>
    </main>
  );
}
