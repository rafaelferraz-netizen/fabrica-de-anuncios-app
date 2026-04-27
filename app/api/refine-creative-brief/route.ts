import { NextRequest, NextResponse } from "next/server";

import { refineCreativeBrief, type CreativeRefinerInput } from "@/lib/creative-refiner";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInput(body: Record<string, unknown>): CreativeRefinerInput {
  return {
    brand: asString(body.brand),
    segment: asString(body.segment),
    product: asString(body.product),
    offer: asString(body.offer),
    format: asString(body.format),
    objective: asString(body.objective),
    audience: asString(body.audience),
    angle: asString(body.angle),
    voice: asString(body.voice),
    userPrompt: asString(body.userPrompt),
    productImageDescription: asString(body.productImageDescription),
    referenceImageDescription: asString(body.referenceImageDescription),
    hasProductImage: Boolean(body.hasProductImage),
    hasReferenceImage: Boolean(body.hasReferenceImage)
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = normalizeInput(body);
    const refinedBrief = await refineCreativeBrief(input);

    return NextResponse.json(refinedBrief);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao refinar briefing criativo." },
      { status: 400 }
    );
  }
}
