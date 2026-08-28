import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, ErrorState, Field, inputClass, Panel } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({ component: AuthRoute });

function AuthRoute() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/" });
  }, [loading, navigate, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await navigate({ to: "/" });
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim() || null } },
        });
        if (signUpError) throw signUpError;
        if (data.session) await navigate({ to: "/" });
        else
          setNotice("Account created. Check your email if confirmation is enabled, then sign in.");
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Authentication failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (oauthError)
      setError(
        `${oauthError.message}. Enable Google in the Supabase Auth provider settings to use this option.`,
      );
    setBusy(false);
  }

  return (
    <AppShell>
      <div className="mx-auto grid min-h-[calc(100vh-7rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <section className="hidden lg:block">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to emergency dashboard
          </Link>
          <p className="mt-10 font-mono text-xs font-bold tracking-[0.2em] text-primary uppercase">
            SENTINEL / SECURE ACCESS
          </p>
          <h1 className="mt-3 max-w-lg text-5xl font-bold leading-tight">
            Keep your emergency trail with you.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Sign in to submit and track SOS requests, report hazards, and keep queued operations
            private to your account.
          </p>
          <div className="mt-8 grid max-w-md gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface/70 p-3">
              <ShieldCheck className="h-5 w-5 text-safe" />
              <p className="mt-2 text-sm font-semibold">Role protected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Response tools appear only for authorised roles.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface/70 p-3">
              <KeyRound className="h-5 w-5 text-primary" />
              <p className="mt-2 text-sm font-semibold">Offline aware</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your unsent SOS stays on this device until acknowledged.
              </p>
            </div>
          </div>
        </section>
        <Panel className="w-full p-5 sm:p-7">
          <div className="lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
          <p className="mt-5 font-mono text-[11px] tracking-[0.18em] text-primary uppercase">
            {mode === "sign-in" ? "Welcome back" : "Create community account"}
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            {mode === "sign-in" ? "Sign in" : "Join Sentinel"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use an account so emergency actions can be attributed and tracked.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "sign-up" && (
              <Field label="Name">
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClass}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                autoComplete="email"
              />
            </Field>
            <Field label="Password" hint="Use at least 6 characters.">
              <input
                required
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              />
            </Field>
            {error && <ErrorState message={error} />}
            {notice && (
              <p
                role="status"
                className="rounded-lg border border-safe/40 bg-safe/10 p-3 text-sm text-safe"
              >
                {notice}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => void googleSignIn()}
            disabled={busy}
          >
            Continue with Google
          </Button>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "sign-in" ? "New to Sentinel?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "sign-in" ? "Create one" : "Sign in"}
            </button>
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
