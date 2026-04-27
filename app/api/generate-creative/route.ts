import { NextRequest, NextResponse } from "next/server";

import { generateCreativeFromRefinedBrief, type GenerateCreativeInput } from "@/lib/generation";
import type { RefinedCreativeBrief } from "@/lib/image-prompt-builder";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRefinedBrief(value: unknown): value is RefinedCreativeBrief {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Record<keyof RefinedCreativeBrief, unknown>>;
  return (
    typeof candidate.interpretedIntent === "string" &&
    typeof candidate.creativeStrategy === "string" &&
    typeof candidate.headline === "string" &&
    typeof candidate.subheadline === "string" &&
    typeof candidate.cta === "string" &&
    typeof candidate.visualDirection === "string" &&
    typeof candidate.layoutDirection === "string" &&
    Array.isArray(candidate.productPreservationRules) &&
    Array.isArray(candidate.referenceUsageRules) &&
    Array.isArray(candidate.negativeRules) &&
    typeof candidate.finalImagePrompt === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isRefinedBrief(body.refinedBrief)) {
      return NextResponse.json(
        { error: "refinedBrief é obrigatório. A geração direta por prompt simples está bloqueada." },
        { status: 400 }
      );
    }

    const input: GenerateCreativeInput = {
      jobId: asString(body.jobId) || undefined,
      brand: asString(body.brand),
      segment: asString(body.segment),
      product: asString(body.product),
      offer: asString(body.offer),
      format: asString(body.format),
      objective: asString(body.objective),
      audience: asString(body.audience),
      angle: asString(body.angle),
      voice: asString(body.voice),
      refinedBrief: body.refinedBrief,
      productImage: asString(body.productImage) || undefined,
      referenceImage: asString(body.referenceImage) || undefined
    };

    const result = await generateCreativeFromRefinedBrief(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar criativo." },
      { status: 400 }
    );
  }
}
