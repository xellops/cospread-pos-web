"use client";

import { AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { signInToBusiness } from "@/lib/auth";
import { useSession } from "@/lib/session";

const LAST_CLIENT_ID = "cospread-pos:last-client-id";

export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [clientId, setClientId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace("/pos");
  }, [session, router]);

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_CLIENT_ID);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
      if (last) setClientId(last);
    } catch {}
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInToBusiness(clientId, email, password);
      try {
        localStorage.setItem(LAST_CLIENT_ID, clientId.trim());
      } catch {}
      router.replace("/pos");
    } catch (err) {
      setError(
        err instanceof ApiError && err.isNetwork
          ? "You're offline. Signing in needs an internet connection the first time."
          : err instanceof Error
            ? err.message
            : "Unable to sign in",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">Use your CoSpread account and your business&apos;s client ID.</p>

      {error && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">
          <AlertCircle className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Client ID" htmlFor="clientId" hint="Ask your business admin if you don't have it.">
          <Input
            id="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="e.g. 3f1c2d9e-…"
            autoComplete="organization"
            required
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
    </>
  );
}
