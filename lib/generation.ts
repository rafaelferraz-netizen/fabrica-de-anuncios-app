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
    targetAudience?: string;
    creativeAngle?: string;
    brandVoice?: string;
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
  if (!key) throw new Error("OPENAI_API_KEY não configurada.");
  return key;
}

function sizeFromFormat(format: string) {
  if (format.includes("1:1")) return "1024x1024";
  if (format.includes("9:16")) return "1024x1792";
  return "1024x1792";
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
  if (!response.ok) throw new Error(payload?.error?.message || "Erro OpenAI");
  return JSON.parse(payload?.choices?.[0]?.message?.content || "{}") as T;
}

async function buildCreativePlan(input: GenerationInput): Promise<CreativePlan> {
  const { briefing, client } = input;
  
  // PROMPT OCULTO: O "cérebro" da agência
  const systemPrompt = `Você é um Diretor de Criação Sênior da V4 Company, focado em ROI e Performance.
Seu objetivo é criar um anúncio que pareça editorial, premium e humano, evitando clichês de IA.

REGRAS DE OURO:
1. Headline: Máximo 5 palavras. Foco no benefício ou dor.
2. Imagem: Descreva uma cena real, com iluminação natural, texturas tangíveis e composição fotográfica (ex: regra dos terços, profundidade de campo).
3. Público: Se o público for '${briefing.targetAudience}', use linguagem condizente.
4. Ângulo: O ângulo '${briefing.creativeAngle}' deve guiar a promessa central.

Responda apenas JSON: { headline, subheadline, cta, angle, imagePrompt }`;

  const userPrompt = `Briefing:
Produto: ${briefing.productName}
Cliente: ${client?.name} (${client?.segment})
Objetivo: ${briefing.objective}
Ângulo: ${briefing.creativeAngle}
Público: ${briefing.targetAudience}
Voz da Marca: ${briefing.brandVoice}
Plataforma: ${briefing.platform}
Estágio do Funil: ${briefing.funnelStage}`;

  return callOpenAiJson<CreativePlan>({
    model: "gpt-4o", // Usando modelo mais recente disponível para melhores prompts
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });
}

async function generateImageB64(prompt: string, format: string): Promise<{ b64: string; model: string }> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAiKey()}`
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: `Advertising photography for ${prompt}. High-end commercial style, cinematic lighting, 8k resolution, photorealistic, avoid text in image.`,
      size: sizeFromFormat(format),
      quality: "hd",
      response_format: "b64_json"
    })
  });
  
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Erro DALL-E");
  return { b64: payload.data[0].b64_json, model: "dall-e-3" };
}

async function uploadImage(jobId: string, b64: string) {
  const supabase = getSupabaseAdmin();
  const bytes = Buffer.from(b64, "base64");
  const filePath = `generated/${jobId}.png`;
  const { error } = await supabase.storage.from("ad-assets").upload(filePath, bytes, {
    contentType: "image/png",
    upsert: true
  });
  if (error) throw error;
  const { data } = supabase.storage.from("ad-assets").getPublicUrl(filePath);
  return data.publicUrl;
}

export async function runGenerationJobOnline(input: GenerationInput) {
  const plan = await buildCreativePlan(input);
  const imageResult = await generateImageB64(plan.imagePrompt, input.briefing.format);
  const imageUrl = await uploadImage(input.jobId, imageResult.b64);
  
  const summary = `Gerado com ângulo de ${plan.angle}. Headline: ${plan.headline}`;

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