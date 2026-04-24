import type { BrandProfile } from "../types";

export type AudienceRegister =
  | "saas-b2b"
  | "luxury-dtc"
  | "youth-student-ugc"
  | "parent-facing-service"
  | "professional-b2b-service"
  | "unassigned";

export interface LockedVisualSystem {
  backgroundAesthetic?: string;
  typographyFont?: string;
  headlineWeight?: number;
  headlineAccentColor?: string;
  accentWordPattern?: string;
  overlayGradient?: string;
  ctaStyle?: string;
  wordmarkStyle?: string;
  [key: string]: unknown;
}

export interface BrandRecord {
  slug: string;
  displayName: string;
  website: string;
  category?: string;
  audienceRegister: AudienceRegister;
  brandProfile?: BrandProfile;
  proofPoints?: Record<string, unknown>;
  locked?: {
    visualSystem?: LockedVisualSystem;
    _note?: string;
  };
  jobHistory: Array<{ jobId: string; completedAt: string }>;
  updatedAt: string;
}
