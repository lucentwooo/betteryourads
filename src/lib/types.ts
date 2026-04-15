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
}

export interface AnalysisInput {
  companyName: string;
  companyUrl: string;
  landingPageUrl?: string;
  productDescription?: string;
  icpDescription?: string;
  competitors: string[];
  notes?: string;
  adContentDescription?: string; // Manual description of video ad content
  uploadedScreenshots?: string[];
}

export type JobStatus =
  | "queued"
  | "scraping-website"
  | "extracting-brand"
  | "scraping-ads"
  | "scraping-competitor-ads"
  | "suggesting-competitors"
  | "analyzing"
  | "complete"
  | "error";

export interface ProgressStep {
  step: string;
  detail: string;
  timestamp: string;
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
  diagnosis?: DiagnosisResult;
  error?: string;
  createdAt: string;
  completedAt?: string;
}
