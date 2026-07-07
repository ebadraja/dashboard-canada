"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({
  action,
  failed,
}: {
  action: (formData: FormData) => Promise<void>;
  failed: boolean;
}) {
  return (
    <form action={action} className="grid gap-4">
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@clinic.com"
        autoComplete="email"
        required
      />
      <Input
        name="password"
        type="password"
        label="Password"
        placeholder="••••••••••"
        autoComplete="current-password"
        required
        error={failed ? "Wrong email or password. Try again." : null}
      />
      <SubmitButton />
    </form>
  );
}
