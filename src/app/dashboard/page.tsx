import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // One brand per user in v1; fetch it so the dashboard knows whether
  // onboarding has happened.
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const firstName = (user.email ?? "founder").split("@")[0];

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between">
          <a href="/" className="inline-flex w-fit items-baseline gap-[2px] font-serif text-[1.2rem] leading-none">
            <span className="italic">better</span>
            <span className="text-coral italic">your</span>
            <span className="italic">ads</span>
            <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
          </a>
          <form action={signOut}>
            <button type="submit" className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-16">
          <div className="eyebrow text-ink/55">Dashboard</div>
          <h1 className="display mt-3 text-4xl leading-[1.05]">
            Welcome, <span className="display-italic text-coral">{firstName}</span>.
          </h1>

          {brand ? (
            <div className="mt-8 rounded-[1.3rem] border hairline bg-card p-6">
              <div className="eyebrow text-ink/55">Your brand</div>
              <div className="font-semibold mt-2 text-2xl">{brand.name}</div>
              <p className="mt-3 text-sm text-ink/60">
                Onboarded {new Date(brand.created_at).toLocaleDateString()}.
                Style quiz and on-demand creative generation are coming next phase.
              </p>
            </div>
          ) : (
            <div className="mt-8 rounded-[1.3rem] border hairline bg-card p-6">
              <p className="text-ink/75">
                You haven&apos;t onboarded a brand yet. Let&apos;s diagnose your ads.
              </p>
              <a href="/onboarding" className="btn-chunk mt-5 inline-flex">
                Start onboarding
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
