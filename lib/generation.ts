import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { refineCreativeBrief, type CreativeRefinerInput } from "./creative-refiner";
import { buildFinalImagePrompt, type RefinedCreativeBrief } from "./image-prompt-builder";
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
    targetAudience?: string;
    creativeAngle?: string;
    brandVoice?: string;
    offer?: string;
    audience?: string;
    angle?: string;
    voice?: string;
    userPrompt?: string;
    productImageDescription?: string;
    referenceImageDescription?: string;
    productImageUrl?: string;
    referenceAdUrl?: string;
  };
};

export type GenerateCreativeInput = {
  jobId?: string;
  brand: string;
  segment: string;
  product: string;
  offer: string;
  format: string;
  objective: string;
  audience: string;
  angle: string;
  voice: string;
  refinedBrief: RefinedCreativeBrief;
  productImage?: string;
  referenceImage?: string;
};

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  return key;
}

function sizeFromFormat(format: string) {
  if (format.includes("1:1")) {
    return "1024x1024";
  }
  if (format.includes("9:16")) {
    return "1024x1792";
  }
  return "1024x1792";
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

async function fetchImageFile(url: string, fileName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem ${fileName}: ${response.status}`);
  }

  const blob = await response.blob();
  const contentType = response.headers.get("content-type") || blob.type || "image/png";
  return new File([blob], fileName, { type: contentType });
}

async function generateImageB64WithReferences(input: {
  prompt: string;
  format: string;
  productImage?: string;
  referenceImage?: string;
}): Promise<{ b64: string; model: string }> {
  const imageUrls = [
    input.productImage ? { url: input.productImage, fileName: "PRODUCT_IMAGE.png" } : null,
    input.referenceImage ? { url: input.referenceImage, fileName: "STYLE_REFERENCE.png" } : null
  ].filter(Boolean) as { url: string; fileName: string }[];

  if (imageUrls.length === 0) {
    return generateImageB64(input.prompt, input.format);
  }

  const models = ["gpt-image-2", "gpt-image-1"];
  let lastError = "Falha ao gerar imagem com referências.";
  const files = await Promise.all(imageUrls.map((image) => fetchImageFile(image.url, image.fileName)));

  for (const model of models) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", input.prompt);
    form.append("size", sizeFromFormat(input.format));
    for (const file of files) {
      form.append("image", file);
    }

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAiKey()}`
      },
      body: form
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

export async function generateCreativeFromRefinedBrief(input: GenerateCreativeInput) {
  const finalImagePrompt = buildFinalImagePrompt(input);
  const imageResult = await generateImageB64WithReferences({
    prompt: finalImagePrompt,
    format: input.format,
    productImage: input.productImage,
    referenceImage: input.referenceImage
  });
  const imageUrl = await uploadImage(input.jobId ?? randomUUID(), imageResult.b64);

  return {
    imageUrl,
    imageModel: imageResult.model,
    finalImagePrompt
  };
}

function toRefinerInput(input: GenerationInput): CreativeRefinerInput {
  const client = input.client;
  return {
    brand: client?.name ?? "Cliente",
    segment: client?.segment ?? "",
    product: input.briefing.productName,
    offer: input.briefing.offer ?? "",
    format: input.briefing.format,
    objective: input.briefing.objective,
    audience: input.briefing.audience ?? input.briefing.targetAudience ?? input.briefing.funnelStage,
    angle: input.briefing.angle ?? input.briefing.creativeAngle ?? input.briefing.funnelStage,
    voice: input.briefing.voice ?? input.briefing.brandVoice ?? client?.brandTone ?? "",
    userPrompt: input.briefing.userPrompt ?? "",
    productImageDescription: input.briefing.productImageDescription ?? "",
    referenceImageDescription: input.briefing.referenceImageDescription ?? "",
    hasProductImage: Boolean(input.briefing.productImageUrl),
    hasReferenceImage: Boolean(input.briefing.referenceAdUrl)
  };
}

export async function runGenerationJobOnline(input: GenerationInput) {
  const refinerInput = toRefinerInput(input);
  const refinedBrief = await refineCreativeBrief(refinerInput);
  const creative = await generateCreativeFromRefinedBrief({
    jobId: input.jobId,
    brand: refinerInput.brand,
    segment: refinerInput.segment,
    product: refinerInput.product,
    offer: refinerInput.offer,
    format: refinerInput.format,
    objective: refinerInput.objective,
    audience: refinerInput.audience,
    angle: refinerInput.angle,
    voice: refinerInput.voice,
    refinedBrief,
    productImage: input.briefing.productImageUrl,
    referenceImage: input.briefing.referenceAdUrl
  });
  const summary =
    `Geração concluída com Creative Refiner. Headline: ${refinedBrief.headline}. ` +
    `CTA: ${refinedBrief.cta}. Modelo: ${creative.imageModel}. Imagem: ${creative.imageUrl}`;

  return {
    headline: refinedBrief.headline,
    subheadline: refinedBrief.subheadline,
    cta: refinedBrief.cta,
    angle: refinerInput.angle,
    imageUrl: creative.imageUrl,
    imageModel: creative.imageModel,
    refinedBrief,
    finalImagePrompt: creative.finalImagePrompt,
    summary,
    outputSummary: JSON.stringify({
      summary,
      headline: refinedBrief.headline,
      subheadline: refinedBrief.subheadline,
      cta: refinedBrief.cta,
      angle: refinerInput.angle,
      imageUrl: creative.imageUrl,
      imageModel: creative.imageModel,
      refinedBrief,
      finalImagePrompt: creative.finalImagePrompt
    })
  };
}
