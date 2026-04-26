import { randomUUID } from "node:crypto";

import { createDemoBriefing, createDemoClient, createDemoReview, getDemoSnapshot } from "./demo-store";
import { isDemoMode } from "./env";
import { getSupabaseAdmin } from "./supabase";
import type { DashboardSnapshot, ReviewRecord } from "./types";

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (isDemoMode()) {
    return getDemoSnapshot();
  }

  const supabase = getSupabaseAdmin();
  const [clients, briefings, jobs, reviews] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("briefings").select("*").order("created_at", { ascending: false }),
    supabase.from("generation_jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("reviews").select("*").order("created_at", { ascending: false })
  ]);

  return {
    mode: "supabase",
    clients: (clients.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      segment: row.segment,
      brandTone: row.brand_tone,
      createdAt: row.created_at
    })),
    briefings: (briefings.data ?? []).map((row) => ({
      id: row.id,
      clientId: row.client_id,
      productName: row.product_name,
      platform: row.platform,
      format: row.format,
      adType: row.ad_type,
      objective: row.objective,
      funnelStage: row.funnel_stage,
      productImageUrl: row.product_image_url ?? undefined,
      referenceAdUrl: row.reference_ad_url ?? undefined,
      createdAt: row.created_at
    })),
    jobs: (jobs.data ?? []).map((row) => ({
      id: row.id,
      briefingId: row.briefing_id,
      status: row.status,
      outputSummary: row.output_summary ?? undefined,
      createdAt: row.created_at
    })),
    reviews: (reviews.data ?? []).map((row) => ({
      id: row.id,
      jobId: row.job_id,
      status: row.status,
      feedback: row.feedback ?? "",
      reasonTags: row.reason_tags ?? [],
      createdAt: row.created_at
    }))
  };
}

export async function createClientRecord(input: {
  name: string;
  segment: string;
  brandTone: string;
}) {
  if (isDemoMode()) {
    return createDemoClient(input);
  }

  const supabase = getSupabaseAdmin();
  const payload = {
    id: randomUUID(),
    name: input.name,
    segment: input.segment,
    brand_tone: input.brandTone
  };
  const { data, error } = await supabase.from("clients").insert(payload).select("*").single();
  if (error) {
    throw error;
  }
  return {
    id: data.id,
    name: data.name,
    segment: data.segment,
    brandTone: data.brand_tone,
    createdAt: data.created_at
  };
}

export async function createBriefingRecord(input: {
  clientId: string;
  productName: string;
  platform: string;
  format: string;
  adType: "static" | "carousel";
  objective: string;
  funnelStage: string;
  productImageUrl?: string;
  referenceAdUrl?: string;
}) {
  if (isDemoMode()) {
    return createDemoBriefing(input);
  }

  const supabase = getSupabaseAdmin();
  const briefingPayload = {
    id: randomUUID(),
    client_id: input.clientId,
    product_name: input.productName,
    platform: input.platform,
    format: input.format,
    ad_type: input.adType,
    objective: input.objective,
    funnel_stage: input.funnelStage,
    product_image_url: input.productImageUrl ?? null,
    reference_ad_url: input.referenceAdUrl ?? null
  };

  const { data: briefing, error: briefingError } = await supabase
    .from("briefings")
    .insert(briefingPayload)
    .select("*")
    .single();
  if (briefingError) {
    throw briefingError;
  }

  const jobPayload = {
    id: randomUUID(),
    briefing_id: briefing.id,
    status: "queued",
    output_summary: "Fila criada. Conecte aqui o motor Python de geração."
  };
  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .insert(jobPayload)
    .select("*")
    .single();
  if (jobError) {
    throw jobError;
  }

  return {
    briefing: {
      id: briefing.id,
      clientId: briefing.client_id,
      productName: briefing.product_name,
      platform: briefing.platform,
      format: briefing.format,
      adType: briefing.ad_type,
      objective: briefing.objective,
      funnelStage: briefing.funnel_stage,
      productImageUrl: briefing.product_image_url ?? undefined,
      referenceAdUrl: briefing.reference_ad_url ?? undefined,
      createdAt: briefing.created_at
    },
    job: {
      id: job.id,
      briefingId: job.briefing_id,
      status: job.status,
      outputSummary: job.output_summary ?? undefined,
      createdAt: job.created_at
    }
  };
}

export async function createReviewRecord(input: {
  jobId: string;
  status: "approved" | "rejected";
  feedback: string;
  reasonTags: string[];
}): Promise<ReviewRecord> {
  if (isDemoMode()) {
    return createDemoReview(input);
  }

  const supabase = getSupabaseAdmin();
  const payload = {
    id: randomUUID(),
    job_id: input.jobId,
    status: input.status,
    feedback: input.feedback,
    reason_tags: input.reasonTags
  };
  const { data, error } = await supabase.from("reviews").insert(payload).select("*").single();
  if (error) {
    throw error;
  }
  await supabase
    .from("generation_jobs")
    .update({ status: input.status, output_summary: input.feedback || null })
    .eq("id", input.jobId);

  return {
    id: data.id,
    jobId: data.job_id,
    status: data.status,
    feedback: data.feedback ?? "",
    reasonTags: data.reason_tags ?? [],
    createdAt: data.created_at
  };
}
