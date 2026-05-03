import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface BrandRow {
  id: string;
  name: string;
  created_at: string;
}

interface ReportRow {
  job_id: string;
  created_at: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Read with the user's RLS-bound client first so we don't accidentally
  // expose another tenant's data through a misuse of the admin client.
  const { data: brandData } = await supabase
    .from("brands")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const brand = brandData as BrandRow | null;

  let latestReport: ReportRow | null = null;
  if (brand) {
    const admin = createAdminClient();
    const { data: reportData } = await admin
      .from("reports")
      .select("job_id, created_at")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestReport = reportData as ReportRow | null;
  }

  const firstName = (user.email ?? "founder").split("@")[0];
  const onboardedDate = brand
    ? new Date(brand.created_at).toLocaleDateString()
    : null;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex w-fit items-baseline gap-[2px] font-serif text-[1.2rem] leading-none"
          >
            <span className="italic">better</span>
            <span className="text-coral italic">your</span>
            <span className="italic">ads</span>
            <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-16">
          <div className="eyebrow text-ink/55">Dashboard</div>
          <h1 className="display mt-3 text-4xl leading-[1.05]">
            Welcome, <span className="display-italic text-coral">{firstName}</span>.
          </h1>

          {!brand ? (
            <div className="mt-8 rounded-[1.3rem] border hairline bg-card p-6">
              <p className="text-ink/75">
                You haven&apos;t onboarded a brand yet. Let&apos;s diagnose your ads.
              </p>
              <a href="/onboarding" className="btn-chunk mt-5 inline-flex">
                Start onboarding
              </a>
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              {/* Brand summary */}
              <div className="rounded-[1.3rem] border hairline bg-card p-6">
                <div className="eyebrow text-ink/55">Your brand</div>
                <div className="mt-2 font-semibold text-2xl">{brand.name}</div>
                <p className="mt-2 text-sm text-ink/55">
                  Onboarded {onboardedDate}.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {latestReport && (
                    <a
                      href={`/analyze/${latestReport.job_id}`}
                      className="inline-flex items-center gap-1.5 text-ink underline underline-offset-4 hover:text-coral"
                    >
                      Open your last diagnosis <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
                  <a
                    href="/onboarding"
                    className="inline-flex items-center gap-1.5 text-ink/70 underline underline-offset-4 hover:text-coral"
                  >
                    Run a new diagnosis
                  </a>
                </div>
              </div>

              {/* Generate-on-demand placeholder — Phase 5 */}
              <div className="rounded-[1.3rem] border hairline bg-card p-6 opacity-70">
                <div className="eyebrow text-ink/55">Generate</div>
                <div className="mt-2 font-semibold text-lg">
                  On-demand creative generation
                </div>
                <p className="mt-1 text-sm text-ink/55">
                  Coming next phase — generate fresh on-brand creatives any time
                  without re-running the whole diagnosis.
                </p>
              </div>
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
