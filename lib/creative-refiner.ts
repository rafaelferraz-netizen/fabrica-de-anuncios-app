import type { RefinedCreativeBrief } from "./image-prompt-builder";

export type CreativeRefinerInput = {
  brand: string;
  segment: string;
  product: string;
  offer: string;
  format: string;
  objective: string;
  audience: string;
  angle: string;
  voice: string;
  userPrompt: string;
  productImageDescription: string;
  referenceImageDescription: string;
  hasProductImage: boolean;
  hasReferenceImage: boolean;
};

export const CREATIVE_REFINER_SYSTEM_PROMPT =
  "Você é um diretor de arte sênior, copywriter de performance e estrategista de criativos para Meta Ads. Sua função é transformar pedidos simples de usuários em briefings publicitários completos para geração de imagens. Você nunca gera imagens. Você cria direção criativa, copy, layout e regras para que um modelo de imagem execute o anúncio corretamente. Você deve preservar produtos enviados por imagem, usar referências visuais apenas como inspiração estética e gerar prompts finais claros, específicos e orientados para performance.";

export const PRODUCT_IMAGE_RULE =
  "Use PRODUCT_IMAGE as the mandatory source for the product appearance. Preserve the product shape, color, material, logo, labels, proportions, texture, packaging and all distinctive details. Do not redesign, replace, simplify or invent another version of the product.";

export const STYLE_REFERENCE_RULE =
  "Use STYLE_REFERENCE only as visual inspiration for composition, lighting, color grading, typography hierarchy, mood, atmosphere, background treatment and layout style. Do not copy the product from the reference image. Do not replace the main product.";

const EMPTY_REFINED_BRIEF: RefinedCreativeBrief = {
  interpretedIntent: "",
  creativeStrategy: "",
  headline: "",
  subheadline: "",
  cta: "",
  visualDirection: "",
  layoutDirection: "",
  productPreservationRules: [],
  referenceUsageRules: [],
  negativeRules: [],
  finalImagePrompt: ""
};

function getOpenAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY não configurada na Vercel.");
  }
  return key;
}

function compact(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(compact).filter(Boolean);
}

function extractJsonObject(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return raw;
  }
  return raw.slice(first, last + 1);
}

function safeParseRefinedBrief(raw: string): Partial<RefinedCreativeBrief> {
  try {
    return JSON.parse(raw) as Partial<RefinedCreativeBrief>;
  } catch {
    return JSON.parse(extractJsonObject(raw)) as Partial<RefinedCreativeBrief>;
  }
}

function fallbackBrief(input: CreativeRefinerInput): RefinedCreativeBrief {
  const offerLine = input.offer ? ` Highlight the offer: ${input.offer}.` : "";
  const headline = input.offer ? "Oferta premium" : "Escolha premium";
  const subheadline = input.product
    ? `${input.product} com presença forte e visual de performance.`
    : "Criativo com direção premium e foco em conversão.";
  const cta = input.objective.toLowerCase().includes("convers") ? "Comprar agora" : "Saiba mais";

  return normalizeRefinedBrief(input, {
    interpretedIntent:
      input.userPrompt ||
      `Criar um anúncio ${input.voice || "profissional"} para ${input.product || "o produto"}.`,
    creativeStrategy:
      `Criativo de Meta Ads com foco em ${input.objective || "performance"}, público ${
        input.audience || "prioritário"
      } e ângulo ${input.angle || "de valor"}.${offerLine}`,
    headline,
    subheadline,
    cta,
    visualDirection:
      `Direção visual ${input.voice || "premium"}, com iluminação controlada, contraste alto, produto em destaque e acabamento publicitário para ${input.segment || "o segmento"}.`,
    layoutDirection:
      `Layout no formato ${input.format}, produto como foco principal, headline curta no topo, oferta em destaque secundário, CTA claro e margens seguras.`,
    productPreservationRules: input.hasProductImage ? [PRODUCT_IMAGE_RULE] : [],
    referenceUsageRules: input.hasReferenceImage ? [STYLE_REFERENCE_RULE] : [],
    negativeRules: [
      "Do not create a cluttered layout.",
      "Do not invent extra text.",
      "Do not make typography unreadable.",
      "Do not replace the main product.",
      "Do not copy products from the style reference."
    ],
    finalImagePrompt:
      `Create a finished Meta Ads creative in ${input.format} for ${input.brand || "the brand"}, promoting ${input.product || "the product"}. ` +
      `Use a ${input.voice || "premium"} visual tone, clear hierarchy, readable short headline, objective subheadline, CTA and strong offer area.${offerLine} ` +
      "Make it look like a real paid social ad, not a generic product poster."
  });
}

function normalizeRefinedBrief(
  input: CreativeRefinerInput,
  value: Partial<RefinedCreativeBrief>
): RefinedCreativeBrief {
  const negativeRules = compactList(value.negativeRules);
  const productPreservationRules = compactList(value.productPreservationRules);
  const referenceUsageRules = compactList(value.referenceUsageRules);

  if (input.hasProductImage && !productPreservationRules.includes(PRODUCT_IMAGE_RULE)) {
    productPreservationRules.unshift(PRODUCT_IMAGE_RULE);
  }
  if (input.hasReferenceImage && !referenceUsageRules.includes(STYLE_REFERENCE_RULE)) {
    referenceUsageRules.unshift(STYLE_REFERENCE_RULE);
  }

  const headline = compact(value.headline) || (input.offer ? "Oferta premium" : "Performance premium");
  const subheadline =
    compact(value.subheadline) || (input.offer ? `Aproveite ${input.offer}.` : "Design forte para quem exige mais.");
  const cta = compact(value.cta) || (input.objective.toLowerCase().includes("convers") ? "Comprar agora" : "Saiba mais");
  const interpretedIntent = compact(value.interpretedIntent) || input.userPrompt || `Anunciar ${input.product}.`;
  const creativeStrategy =
    compact(value.creativeStrategy) ||
    `Peça de performance para ${input.objective || "Meta Ads"} com foco em ${input.angle || "valor percebido"}.`;
  const visualDirection =
    compact(value.visualDirection) ||
    `Visual ${input.voice || "profissional"}, produto em destaque, luz premium e acabamento de anúncio.`;
  const layoutDirection =
    compact(value.layoutDirection) ||
    `Formato ${input.format}, hierarquia clara, produto principal, headline curta, oferta e CTA legíveis.`;

  return {
    ...EMPTY_REFINED_BRIEF,
    interpretedIntent,
    creativeStrategy,
    headline,
    subheadline,
    cta,
    visualDirection,
    layoutDirection,
    productPreservationRules,
    referenceUsageRules,
    negativeRules:
      negativeRules.length > 0
        ? negativeRules
        : [
            "Do not create a cluttered layout.",
            "Do not invent extra text beyond the approved copy.",
            "Do not create unreadable typography.",
            "Do not replace the main product.",
            "Do not create a generic stock image style."
          ],
    finalImagePrompt:
      compact(value.finalImagePrompt) ||
      `${creativeStrategy} ${visualDirection} ${layoutDirection} Include only the approved ad text: ${headline}, ${subheadline}, ${input.offer}, ${cta}.`
  };
}

export async function refineCreativeBrief(input: CreativeRefinerInput): Promise<RefinedCreativeBrief> {
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5.5";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAiKey()}`
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: CREATIVE_REFINER_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Transforme o pedido simples em um briefing publicitário completo. Responda somente JSON válido no formato solicitado.",
            requiredFormat: EMPTY_REFINED_BRIEF,
            rules: [
              "Nunca envie o prompt simples do usuário diretamente para imagem.",
              "Sempre transforme a ideia simples em direção de arte profissional.",
              "Sempre crie uma peça publicitária finalizada, não apenas uma imagem bonita.",
              "Sempre gere headline curta, subheadline objetiva e CTA.",
              "Sempre destaque a oferta quando houver oferta.",
              "Sempre respeite o formato selecionado.",
              "Sempre use linguagem de anúncio de performance.",
              "Sempre crie hierarquia visual clara.",
              "Sempre preserve o produto quando houver imagem de produto.",
              "Sempre use a referência visual apenas como inspiração estética.",
              "Nunca copie o produto da referência visual.",
              "Nunca substitua o produto principal.",
              "Nunca invente muitos textos.",
              "Nunca gere layout poluído.",
              "Nunca deixe o modelo decidir livremente o que é importante.",
              "Se faltar informação, inferir com base no segmento, objetivo, público e ângulo.",
              "Não perguntar nada ao usuário, apenas gerar a melhor versão possível."
            ],
            mandatoryProductImageRule: input.hasProductImage ? PRODUCT_IMAGE_RULE : "",
            mandatoryStyleReferenceRule: input.hasReferenceImage ? STYLE_REFERENCE_RULE : "",
            input
          })
        }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Falha ao chamar o Creative Refiner.");
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return fallbackBrief(input);
  }

  try {
    return normalizeRefinedBrief(input, safeParseRefinedBrief(content));
  } catch {
    return fallbackBrief(input);
  }
}
