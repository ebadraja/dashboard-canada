import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/server/auth";

// Minimal login page — the Foundation only needs "a person can log in and is
// recognised by role" (Doc 0 DoD). Real role-specific screens come in Docs 1-3.
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
        redirectTo: "/",
      });
    } catch (e) {
      // signIn throws a redirect on success; rethrow everything that is not
      // a credentials failure.
      if (e instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw e;
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      {error && <p style={{ color: "crimson" }}>Wrong email or password.</p>}
      <form
        action={login}
        style={{ display: "grid", gap: "0.75rem", justifyItems: "stretch" }}
      >
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          autoComplete="email"
          style={{ padding: "0.6rem", fontSize: "1rem" }}
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete="current-password"
          style={{ padding: "0.6rem", fontSize: "1rem" }}
        />
        <button type="submit" style={{ padding: "0.6rem", fontSize: "1rem" }}>
          Log in
        </button>
      </form>
    </main>
  );
}
