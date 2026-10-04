"use client";

import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { requestPasswordReset, resetPassword } from "@/lib/api/endpoints";

type Step = "request" | "reset" | "done";

function errorText(err: unknown) {
  if (err instanceof ApiError && err.isNetwork) return "You're offline. Connect to the internet and try again.";
  return err instanceof Error ? err.message : "Something went wrong";
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setStep("reset");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      await resetPassword(email.trim(), otp.trim(), password);
      setStep("done");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Link href="/login" className="mb-6 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to sign in
      </Link>

      {error && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">
          <AlertCircle className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}

      {step === "request" && (
        <>
          <h1 className="mb-1 text-xl font-semibold">Forgot password</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Enter your CoSpread email. If it has an account, we&apos;ll send a 6-digit reset code.
          </p>
          <form onSubmit={onRequest} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Send reset code
            </Button>
          </form>
        </>
      )}

      {step === "reset" && (
        <>
          <h1 className="mb-1 text-xl font-semibold">Reset password</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            We sent a code to <span className="font-medium text-foreground">{email}</span>.
          </p>
          <form onSubmit={onReset} className="space-y-4">
            <Field label="Reset code" htmlFor="otp">
              <Input
                id="otp"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoComplete="one-time-code"
                className="tracking-[0.4em]"
                required
              />
            </Field>
            <Field label="New password" htmlFor="password" hint="At least 8 characters.">
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm">
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Reset password
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs font-medium text-brand hover:underline"
              onClick={() => {
                setOtp("");
                setStep("request");
              }}
            >
              Didn&apos;t get a code? Send again
            </button>
          </form>
        </>
      )}

      {step === "done" && (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <h1 className="text-xl font-semibold">Password updated</h1>
          <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand text-sm font-medium text-white hover:bg-brand/90"
          >
            Go to sign in
          </Link>
        </div>
      )}
    </>
  );
}
