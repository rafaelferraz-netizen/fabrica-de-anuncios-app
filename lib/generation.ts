import { Buffer } from "node:buffer";

import { getSupabaseAdmin } from "./supabase";

type GenerationInput = {
  jobId: string;
  client: { name: string; segment: string; brandTone: string } | null;
  briefing: {
    id: string;
    productName: string;
    platform: string;
    format: string;
    adType: "static" | "carousel";
    objective: string;
    funnelStage: string;
    productImageUrl?: string;
    referenceAdUrl?: string;
  };
};

type CreativePlan = {
  headline: string;
  subheadline: string;
  cta: string;
  angle: string;
  imagePrompt: string;
};

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY não configurada na Vercel.");
  }
  return key;
}

function sizeFromFormat(format: string) {
  if (format.includes("1:1")) {
    return "1024x1024";
  }
  if (format.includes("9:16")) {
    return "1024x1536";
  }
  return "1024x1536";
}

async function callOpenAiJson<T>(body: object): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAiKey()}`
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Falha ao chamar a OpenAI.");
  }

  const content = payload?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as T;
}

async function buildCreativePlan(input: GenerationInput): Promise<CreativePlan> {
  const client = input.client;
  return callOpenAiJson<CreativePlan>({
    model: "gpt-5.5",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você é um diretor de criação para anúncios de performance. Responda apenas JSON com as chaves headline, subheadline, cta, angle, imagePrompt."
      },
      {
        role: "user",
        content: JSON.stringify({
          clientName: client?.name ?? "Cliente",
          clientSegment: client?.segment ?? "",
          brandTone: client?.brandTone ?? "",
          productName: input.briefing.productName,
          platform: input.briefing.platform,
          format: input.briefing.format,
          adType: input.briefing.adType,
          objective: input.briefing.objective,
          funnelStage: input.briefing.funnelStage,
          productImageUrl: input.briefing.productImageUrl ?? "",
          referenceAdUrl: input.briefing.referenceAdUrl ?? ""
        })
      }
    ]
  });
}

async function generateImageB64(prompt: string, format: string): Promise<{ b64: string; model: string }> {
  const models = ["gpt-image-2", "gpt-image-1"];
  let lastError = "Falha ao gerar imagem.";

  for (const model of models) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getOpenAiKey()}`
      },
      body: JSON.stringify({
        model,
        prompt,
        size: sizeFromFormat(format)
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      lastError = payload?.error?.message ?? lastError;
      continue;
    }

    const b64 = payload?.data?.[0]?.b64_json;
    if (!b64) {
      lastError = "A OpenAI não retornou imagem em base64.";
      continue;
    }
    return { b64, model };
  }

  throw new Error(lastError);
}

async function ensureBucket() {
  const supabase = getSupabaseAdmin();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === "ad-assets");
  if (!exists) {
    const { error } = await supabase.storage.createBucket("ad-assets", {
      public: true
    });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw error;
    }
  }
}

async function uploadImage(jobId: string, b64: string) {
  await ensureBucket();
  const supabase = getSupabaseAdmin();
  const bytes = Buffer.from(b64, "base64");
  const filePath = `generated/${jobId}.png`;
  const { error } = await supabase.storage.from("ad-assets").upload(filePath, bytes, {
    contentType: "image/png",
    upsert: true
  });
  if (error) {
    throw error;
  }
  const { data } = supabase.storage.from("ad-assets").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function runGenerationJobOnline(input: GenerationInput) {
  const plan = await buildCreativePlan(input);
  const imageResult = await generateImageB64(plan.imagePrompt, input.briefing.format);
  const imageUrl = await uploadImage(input.jobId, imageResult.b64);
  const summary =
    `Geração concluída. Headline: ${plan.headline}. ` +
    `CTA: ${plan.cta}. Modelo: ${imageResult.model}. Imagem: ${imageUrl}`;

  return {
    headline: plan.headline,
    subheadline: plan.subheadline,
    cta: plan.cta,
    angle: plan.angle,
    imageUrl,
    imageModel: imageResult.model,
    summary,
    outputSummary: JSON.stringify({
      summary,
      headline: plan.headline,
      subheadline: plan.subheadline,
      cta: plan.cta,
      angle: plan.angle,
      imageUrl,
      imageModel: imageResult.model
    })
  };
}
