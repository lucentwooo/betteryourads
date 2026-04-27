export interface BrandProfile {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    [key: string]: string;
  };
  typography: {
    primary: string;
    secondary?: string;
    headingWeight: number;
    bodyWeight: number;
  };
  visualStyle: {
    mode: "light" | "dark" | "mixed";
    ctaShape: string;
    corners: string;
    aesthetic: string;
  };
  tone: string;
  logoUrl?: string;
  dosAndDonts: {
    do: string[];
    dont: string[];
  };
}

export interface AdScreenshot {
  screenshotPath: string;
  copyText: string;
  source: "meta-ad-library" | "uploaded";
  adType?: "video" | "image";
  analysis?: string;
}

export interface CompetitorData {
  name: string;
  ads: AdScreenshot[];
  totalAdCount?: number;
  videoAdCount?: number;
  imageAdCount?: number;
  websiteContent?: string;
}

export interface DiagnosisResult {
  tldr: string;
  executiveSummary: string;
  brandProfile: string;
  doingWell: string;
  notWorking: string;
  competitorWins: string;
  missingOpportunities: string;
  awarenessStageAnalysis: string;
  recommendedConcepts: string;
  testPlan: string;
  raw: string;
  qa?: QAResult;
  vocReferences?: VocPatternRef[];
}

/* ───────── QA ───────── */

export interface QAResult {
  pass: boolean;
  score: number;
  issues: string[];
  feedbackForRetry: string;
  retries: number;
  rubric?: Record<string, number>;
}

/* ───────── Voice of Customer ───────── */

export type VocSource =
  | "reddit"
  | "g2"
  | "trustpilot"
  | "capterra"
  | "youtube"
  | "forum"
  | "blog"
  | "other";

export interface VocSnippet {
  source: VocSource;
  url: string;
  sourceLabel: string;
  quote: string;
  signalScore?: number;
  metadata?: Record<string, string | number>;
}

export interface VocPattern {
  name: string;
  description: string;
  snippetRefs: number[];
  frequency?: number;
}

export interface VocPatternRef {
  patternName: string;
  quote: string;
  source: VocSource;
  url: string;
}

export interface VoiceOfCustomer {
  sources: {
    redditSubs: string[];
    reviewSites: string[];
    forums: string[];
  };
  snippets: VocSnippet[];
  languagePatterns: VocPattern[];
  painPoints: VocPattern[];
  desires: VocPattern[];
  objections: VocPattern[];
  reportMd: string;
  generatedAt: string;
  qa?: QAResult;
}

/* ───────── Concepts ───────── */

export type AwarenessStage =
  | "unaware"
  | "problem"
  | "solution"
  | "product"
  | "most";

export type VisualRegister =
  | "editorial"
  | "product-first"
  | "lifestyle"
  | "documentary"
  | "meme"
  | "testimonial"
  | "comparison";

export interface Concept {
  id: string;
  name: string;
  awarenessStage: AwarenessStage;
  angle: string;
  framework: string;
  rationale: string;
  diagnosisFindingRef: string;
  vocPatternRefs: string[];
  priority: number;
  approved: "pending" | "approved" | "rejected";
  userEdits?: Partial<Concept>;
}

/* ───────── Creatives ───────── */

export type Track = "A" | "B";

export interface CreativeCopy {
  primary: string;
  headline: string;
  description: string;
  cta: string;
  vocLanguageUsed: string[];
}

export interface DenseNarrativePrompt {
  raw: Record<string, unknown>;
  negativePrompt: string;
  patternsCited: string[];
  referenceAds: string[];
}

export interface Creative {
  id: string;
  conceptId: string;
  register: VisualRegister;
  track: Track;
  copy: CreativeCopy;
  prompt?: DenseNarrativePrompt;
  imageUrl?: string;
  compositeUrl?: string;
  qa?: QAResult;
  retries: number;
  status: "pending" | "generating" | "qa-review" | "complete" | "failed";
  whyThisCreative?: {
    diagnosisFinding: string;
    vocPattern: VocPatternRef;
    referenceAds: string[];
    frameworksApplied: string[];
  };
}

/* ───────── Input / Job ───────── */

export interface AnalysisInput {
  companyName: string;
  companyUrl: string;
  landingPageUrl?: string;
  productDescription?: string;
  icpDescription?: string;
  competitors: string[];
  notes?: string;
  adContentDescription?: string;
  uploadedScreenshots?: string[];
  testMode?: "cheap";
}

export type JobStatus =
  | "queued"
  | "scraping-website"
  | "extracting-brand"
  | "scraping-ads"
  | "scraping-competitor-ads"
  | "suggesting-competitors"
  | "voc-research"
  | "analyzing"
  | "concept-architecting"
  | "awaiting-approval"
  | "copywriting"
  | "prompt-writing"
  | "image-generating"
  | "packaging"
  | "complete"
  | "error";

export interface ProgressStep {
  step: string;
  detail: string;
  timestamp: string;
  agent?: string;
  qaOutcome?: "pass" | "retry" | "escalate";
}

export interface Job {
  id: string;
  status: JobStatus;
  input: AnalysisInput;
  progress: ProgressStep[];
  websiteScreenshot?: string;
  websiteContent?: string;
  brandProfile?: BrandProfile;
  companyAds?: AdScreenshot[];
  companyAdCount?: number;
  companyVideoCount?: number;
  companyImageCount?: number;
  competitorData?: CompetitorData[];
  voc?: VoiceOfCustomer;
  diagnosis?: DiagnosisResult;
  concepts?: Concept[];
  creatives?: Creative[];
  error?: string;
  createdAt: string;
  completedAt?: string;
  /** ISO timestamp set when a pipeline stage begins; cleared when it ends.
   * Used as a lightweight lock so /api/analyze and /api/jobs/.../advance
   * don't end up running the same stage concurrently (which spawned two
   * Puppeteer browsers and crashed both with TargetCloseError). */
  stageRunningSince?: string | null;
  /** Per-brand scraper diagnostic trace. Keyed by the search term passed to
   * scrapeMetaAdLibrary (company name or competitor name). Persisted to the
   * job so we can diagnose ad-scraping failures without relying on Vercel
   * runtime logs (which silently drop most output under load). */
  scraperTrace?: Record<string, string[]>;
  /** Facebook usernames found in the brand's own website footer/links.
   * Far more reliable than guessing or asking Perplexity. */
  brandFacebookUsernames?: string[];
}
