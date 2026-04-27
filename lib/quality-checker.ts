import type { RefinedCreativeBrief } from "./image-prompt-builder";

export type GeneratedCreativeEvaluation = {
  score: number;
  hasReadableText: boolean;
  usedProductCorrectly: boolean;
  followedReferenceStyle: boolean;
  isRealAd: boolean;
  problems: string[];
  adjustmentPrompt: string;
};

const DEFAULT_EVALUATION: GeneratedCreativeEvaluation = {
  score: 0,
  hasReadableText: false,
  usedProductCorrectly: false,
  followedReferenceStyle: false,
  isRealAd: false,
  problems: [],
  adjustmentPrompt: ""
};

function getOpenAiKey() {
  return process.env.OPENAI_API_KEY;
}

function extractJsonObject(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return raw;
  }
  return raw.slice(first, last + 1);
}

function normalizeEvaluation(value: Partial<GeneratedCreativeEvaluation>): GeneratedCreativeEvaluation {
  const score = Number.isFinite(value.score) ? Math.max(0, Math.min(10, Number(value.score))) : 0;
  const problems = Array.isArray(value.problems) ? value.problems.filter((item) => typeof item === "string") : [];
  const adjustmentPrompt =
    typeof value.adjustmentPrompt === "string"
      ? value.adjustmentPrompt
      : score < 7
        ? `Improve the next generation by fixing: ${problems.join("; ") || "readability, product fidelity and ad hierarchy"}.`
        : "";

  return {
    score,
    hasReadableText: Boolean(value.hasReadableText),
    usedProductCorrectly: Boolean(value.usedProductCorrectly),
    followedReferenceStyle: Boolean(value.followedReferenceStyle),
    isRealAd: Boolean(value.isRealAd),
    problems,
    adjustmentPrompt: score < 7 ? adjustmentPrompt : ""
  };
}

export async function evaluateGeneratedCreative(
  generatedImageUrl: string,
  refinedBrief: RefinedCreativeBrief
): Promise<GeneratedCreativeEvaluation> {
  const key = getOpenAiKey();
  if (!key || !generatedImageUrl) {
    return {
      ...DEFAULT_EVALUATION,
      problems: ["Quality checker is not connected to an image URL or OPENAI_API_KEY."],
      adjustmentPrompt:
        "Review the generated image against the refined brief. Improve text readability, product fidelity, reference style usage, offer visibility, headline, CTA, hierarchy and layout cleanliness."
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior creative QA reviewer for Meta Ads. Evaluate generated ad images against the approved brief and return only valid JSON."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  expectedJson: DEFAULT_EVALUATION,
                  criteria: [
                    "Is the text readable?",
                    "Does the product look faithful to the supplied product image?",
                    "Was the visual reference used only as style?",
                    "Does the image look like a real finished ad?",
                    "Does the offer appear correctly?",
                    "Does the headline appear correctly?",
                    "Does the CTA appear correctly?",
                    "Is there clear visual hierarchy?",
                    "Is the layout clean?",
                    "Does it look generic?"
                  ],
                  refinedBrief
                })
              },
              {
                type: "image_url",
                image_url: { url: generatedImageUrl }
              }
            ]
          }
        ]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "Quality checker failed.");
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return DEFAULT_EVALUATION;
    }
    return normalizeEvaluation(JSON.parse(extractJsonObject(content)) as Partial<GeneratedCreativeEvaluation>);
  } catch (error) {
    return {
      ...DEFAULT_EVALUATION,
      problems: [error instanceof Error ? error.message : "Quality checker failed."],
      adjustmentPrompt:
        "Regenerate with clearer typography, stronger product fidelity, cleaner hierarchy, visible offer, correct headline and CTA, and a more finished Meta Ads layout."
    };
  }
}
