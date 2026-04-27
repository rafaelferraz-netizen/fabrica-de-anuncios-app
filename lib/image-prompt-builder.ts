export type RefinedCreativeBrief = {
  interpretedIntent: string;
  creativeStrategy: string;
  headline: string;
  subheadline: string;
  cta: string;
  visualDirection: string;
  layoutDirection: string;
  productPreservationRules: string[];
  referenceUsageRules: string[];
  negativeRules: string[];
  finalImagePrompt: string;
};

export type FinalImagePromptInput = {
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
};

function listRules(rules: string[]) {
  return rules.length > 0 ? rules.map((rule) => `- ${rule}`).join("\n") : "- None.";
}

export function buildFinalImagePrompt(input: FinalImagePromptInput) {
  const { refinedBrief } = input;

  return `Create a finished advertising creative for Meta Ads.

FORMAT:
${input.format}

BRAND:
${input.brand}

SEGMENT:
${input.segment}

PRODUCT:
${input.product}

OFFER:
${input.offer}

OBJECTIVE:
${input.objective}

AUDIENCE:
${input.audience}

CREATIVE ANGLE:
${input.angle}

BRAND VOICE:
${input.voice}

USER INTENT:
${refinedBrief.interpretedIntent}

CREATIVE STRATEGY:
${refinedBrief.creativeStrategy}

ART DIRECTION:
${refinedBrief.visualDirection}

LAYOUT DIRECTION:
${refinedBrief.layoutDirection}

TEXT TO INCLUDE IN THE IMAGE:
Product title: ${input.product}
Headline: ${refinedBrief.headline}
Subheadline: ${refinedBrief.subheadline}
Offer: ${input.offer}
CTA: ${refinedBrief.cta}

PRODUCT IMAGE RULES:
${listRules(refinedBrief.productPreservationRules)}

STYLE REFERENCE RULES:
${listRules(refinedBrief.referenceUsageRules)}

DESIGN REQUIREMENTS:
Create a complete advertising layout, not just a product photo.
The result must look like a real paid social ad.
Use clear visual hierarchy.
Make all text readable.
Use premium composition.
Keep safe margins.
Use high contrast between text and background.
Make the product the main visual focus.
Avoid excessive text.
Avoid generic stock image style.

NEGATIVE RULES:
${listRules(refinedBrief.negativeRules)}

IMPORTANT:
Do not invent extra text beyond the approved text.
Do not create unreadable typography.
Do not crop important product details.
Do not ignore the product image.
Do not ignore the offer.
Do not create a generic poster.

REFINED IMAGE PROMPT:
${refinedBrief.finalImagePrompt}`;
}
