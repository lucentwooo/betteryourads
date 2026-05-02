"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}

function SignInInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div>
      <div className="eyebrow text-ink/55">Welcome back</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">
        Sign <span className="display-italic text-coral">in</span>.
      </h1>

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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
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
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/60">
        New here?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="link-underline text-ink">
          Create an account
        </Link>
      </p>
    </div>
  );
}
