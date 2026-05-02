"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpInner />
    </Suspense>
  );
}

function SignUpInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/onboarding";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      router.replace(next);
      return;
    }
    setNeedsConfirm(true);
  }

  if (needsConfirm) {
    return (
      <div>
        <h1 className="display text-3xl leading-tight">Check your inbox.</h1>
        <p className="mt-4 text-ink/70">
          We sent a confirmation link to <strong>{email}</strong>. Click it and
          you&apos;ll land back here, signed in and ready to onboard.
        </p>
        <p className="mt-6 text-sm text-ink/50">
          Wrong email?{" "}
          <button onClick={() => setNeedsConfirm(false)} className="link-underline">
            Go back
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow text-ink/55">Create an account</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">
        Start your <span className="display-italic text-coral">diagnosis</span>.
      </h1>
      <p className="mt-3 text-ink/70">
        First 5 founders get it free. No credit card.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-[1.3rem] border hairline bg-card p-5"
      >
        <div className="grid gap-4">
          <div>
            <Label htmlFor="email" className="eyebrow text-ink/50">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <Label htmlFor="password" className="eyebrow text-ink/50">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
              placeholder="at least 8 characters"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-ink/80">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-chunk mt-5 w-full justify-center"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        Already have an account?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="link-underline text-ink">
          Sign in
        </Link>
      </p>
    </div>
  );
}
