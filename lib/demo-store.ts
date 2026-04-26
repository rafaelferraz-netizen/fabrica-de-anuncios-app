import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type {
  BriefingRecord,
  ClientRecord,
  DashboardSnapshot,
  GenerationJobRecord,
  ReviewRecord
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".app-data");
const DATA_FILE = path.join(DATA_DIR, "dashboard.json");

type StoreShape = DashboardSnapshot;

async function ensureStore(): Promise<StoreShape> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    const seed: StoreShape = {
      mode: "demo",
      clients: [],
      briefings: [],
      jobs: [],
      reviews: []
    };
    await writeFile(DATA_FILE, JSON.stringify(seed, null, 2), "utf-8");
    return seed;
  }
}

async function persist(data: StoreShape) {
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function getDemoSnapshot(): Promise<DashboardSnapshot> {
  return ensureStore();
}

export async function createDemoClient(input: {
  name: string;
  segment: string;
  brandTone: string;
}): Promise<ClientRecord> {
  const data = await ensureStore();
  const client: ClientRecord = {
    id: randomUUID(),
    name: input.name,
    segment: input.segment,
    brandTone: input.brandTone,
    createdAt: new Date().toISOString()
  };
  data.clients.unshift(client);
  await persist(data);
  return client;
}

export async function createDemoBriefing(input: {
  clientId: string;
  productName: string;
  platform: string;
  format: string;
  adType: "static" | "carousel";
  objective: string;
  funnelStage: string;
  productImageUrl?: string;
  referenceAdUrl?: string;
}): Promise<{ briefing: BriefingRecord; job: GenerationJobRecord }> {
  const data = await ensureStore();
  const briefing: BriefingRecord = {
    id: randomUUID(),
    clientId: input.clientId,
    productName: input.productName,
    platform: input.platform,
    format: input.format,
    adType: input.adType,
    objective: input.objective,
    funnelStage: input.funnelStage,
    productImageUrl: input.productImageUrl,
    referenceAdUrl: input.referenceAdUrl,
    createdAt: new Date().toISOString()
  };
  const job: GenerationJobRecord = {
    id: randomUUID(),
    briefingId: briefing.id,
    status: "queued",
    outputSummary: "Fila criada. Integração com o motor de geração já pode ser conectada aqui.",
    createdAt: new Date().toISOString()
  };
  data.briefings.unshift(briefing);
  data.jobs.unshift(job);
  await persist(data);
  return { briefing, job };
}

export async function createDemoReview(input: {
  jobId: string;
  status: "approved" | "rejected";
  feedback: string;
  reasonTags: string[];
}): Promise<ReviewRecord> {
  const data = await ensureStore();
  const review: ReviewRecord = {
    id: randomUUID(),
    jobId: input.jobId,
    status: input.status,
    feedback: input.feedback,
    reasonTags: input.reasonTags,
    createdAt: new Date().toISOString()
  };
  data.reviews.unshift(review);
  data.jobs = data.jobs.map((job) =>
    job.id === input.jobId
      ? {
          ...job,
          status: input.status
        }
      : job
  );
  await persist(data);
  return review;
}
