-- BetterYourAds initial schema.
--
-- Design notes:
--   * one brand per user in v1 (unique constraint on user_id). Multi-brand
--     is deferred to v2 — when we relax it, drop the unique and add a
--     `brands.is_default` flag instead.
--   * every child table has brand_id with cascade delete, so wiping a
--     brand cleans up its derived data automatically.
--   * RLS is on for everything. Users can only read/write rows whose
--     brand belongs to them. Backend-only writes (the analyze pipeline
--     running under Vercel) use the service-role key which bypasses RLS.
--   * jsonb is used liberally for things we don't want to schema-pin yet
--     (style breakdowns, diagnosis, concept lists). Easy to query, easy
--     to evolve without migrations.

-- ──────────────────────────────────────────────────────────────────────
-- BRANDS
-- ──────────────────────────────────────────────────────────────────────
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text,
  business_type text check (business_type in ('saas-b2b', 'saas-b2c', 'dtc', 'service', 'other')),
  -- extracted from the brand's website by the existing brand-extractor.
  -- shape: { primary, secondary, accent, neutral } as hex strings
  colors jsonb,
  -- shape: { primary, secondary, weights[] } from the same extractor
  fonts jsonb,
  logo_url text,
  -- resolved during onboarding from the brand's FB page (Apify scraper)
  facebook_page_id text,
  facebook_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ──────────────────────────────────────────────────────────────────────
-- VOICE OF CUSTOMER quotes (Reddit, reviews, forums)
-- ──────────────────────────────────────────────────────────────────────
create table public.voc_quotes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  quote text not null,
  source text not null,        -- 'reddit' | 'g2' | 'trustpilot' | 'forum' | ...
  source_label text,           -- e.g. "r/saas · 2024-12-01"
  url text,
  signal_score numeric,        -- pipeline's relevance score
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────
-- COMPETITOR ADS (scraped via Apify)
-- ──────────────────────────────────────────────────────────────────────
create table public.competitor_ads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  competitor_name text not null,
  image_url text not null,
  copy_text text,
  ad_type text check (ad_type in ('image', 'video')),
  source_page_id text,         -- the FB page id we scraped from
  created_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────
-- STYLE REFERENCES (the loved ads from the Tinder-style quiz)
-- ──────────────────────────────────────────────────────────────────────
create table public.style_references (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  image_url text not null,
  source text check (source in ('competitor', 'curated', 'uploaded')),
  -- the JSON Prompt Generator output (palette, lighting, composition,
  -- materials, typography, conversion_anatomy, ...) used during stitching
  breakdown jsonb,
  loved_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────
-- REPORTS (diagnosis runs — one per onboarding for now, multi in v2)
-- ──────────────────────────────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  -- ties back to the existing job id in Upstash, so we can keep using the
  -- progress-polling UI without rewriting the job system.
  job_id text not null,
  diagnosis jsonb,             -- the full DiagnosisResult shape
  concepts jsonb,              -- the ranked concept array
  created_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────
-- CREATIVES (every generated ad)
-- ──────────────────────────────────────────────────────────────────────
create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  -- v2 variations point back to their parent. nullable for top-level creatives.
  parent_creative_id uuid references public.creatives(id) on delete set null,
  image_url text not null,
  copy_text text,
  awareness_stage text,
  concept_name text,
  generated_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────
-- Indexes (RLS uses brand_id lookups heavily — hot paths get indexed)
-- ──────────────────────────────────────────────────────────────────────
create index idx_voc_quotes_brand on public.voc_quotes(brand_id);
create index idx_competitor_ads_brand on public.competitor_ads(brand_id);
create index idx_style_references_brand on public.style_references(brand_id);
create index idx_reports_brand on public.reports(brand_id);
create index idx_creatives_brand on public.creatives(brand_id);
create index idx_creatives_parent on public.creatives(parent_creative_id);

-- ──────────────────────────────────────────────────────────────────────
-- updated_at auto-bump for brands
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────
alter table public.brands enable row level security;
alter table public.voc_quotes enable row level security;
alter table public.competitor_ads enable row level security;
alter table public.style_references enable row level security;
alter table public.reports enable row level security;
alter table public.creatives enable row level security;

-- Brands: direct user_id check
create policy "users manage own brands"
  on public.brands
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Child tables: ownership flows through the brand. Same policy shape
-- everywhere — readable, writable, deletable iff the user owns the brand.
create policy "users manage own voc_quotes"
  on public.voc_quotes
  for all
  using (auth.uid() = (select user_id from public.brands where id = brand_id))
  with check (auth.uid() = (select user_id from public.brands where id = brand_id));

create policy "users manage own competitor_ads"
  on public.competitor_ads
  for all
  using (auth.uid() = (select user_id from public.brands where id = brand_id))
  with check (auth.uid() = (select user_id from public.brands where id = brand_id));

create policy "users manage own style_references"
  on public.style_references
  for all
  using (auth.uid() = (select user_id from public.brands where id = brand_id))
  with check (auth.uid() = (select user_id from public.brands where id = brand_id));

create policy "users manage own reports"
  on public.reports
  for all
  using (auth.uid() = (select user_id from public.brands where id = brand_id))
  with check (auth.uid() = (select user_id from public.brands where id = brand_id));

create policy "users manage own creatives"
  on public.creatives
  for all
  using (auth.uid() = (select user_id from public.brands where id = brand_id))
  with check (auth.uid() = (select user_id from public.brands where id = brand_id));
