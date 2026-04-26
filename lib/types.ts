export type ClientRecord = {
  id: string;
  name: string;
  segment: string;
  brandTone: string;
  createdAt: string;
};

export type BriefingRecord = {
  id: string;
  clientId: string;
  productName: string;
  platform: string;
  format: string;
  adType: "static" | "carousel";
  objective: string;
  funnelStage: string;
  targetAudience?: string;
  creativeAngle?: string;
  brandVoice?: string;
  productImageUrl?: string;
  referenceAdUrl?: string;
  createdAt: string;
};

export type GenerationJobRecord = {
  id: string;
  briefingId: string;
  status: "queued" | "running" | "approved" | "rejected";
  outputSummary?: string;
  headline?: string;
  subheadline?: string;
  cta?: string;
  angle?: string;
  imageUrl?: string;
  imageModel?: string;
  createdAt: string;
};

export type ReviewRecord = {
  id: string;
  jobId: string;
  status: "approved" | "rejected";
  feedback: string;
  reasonTags: string[];
  createdAt: string;
};

export type DashboardSnapshot = {
  clients: ClientRecord[];
  briefings: BriefingRecord[];
  jobs: GenerationJobRecord[];
  reviews: ReviewRecord[];
  mode: "demo" | "supabase";
};