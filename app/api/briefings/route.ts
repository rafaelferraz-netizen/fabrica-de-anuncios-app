import { NextRequest, NextResponse } from "next/server";

import { createBriefingRecord, updateGenerationJob } from "@/lib/data";
import { runGenerationJobOnline } from "@/lib/generation";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clientId: string;
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

    if (!body.userPrompt?.trim()) {
      return NextResponse.json(
        { error: "userPrompt é obrigatório. Toda geração precisa passar pelo Creative Refiner." },
        { status: 400 }
      );
    }

    const result = await createBriefingRecord(body);
    try {
      await updateGenerationJob({
        jobId: result.job.id,
        status: "running",
        outputSummary: "Geração iniciada."
      });

      const generationPayload = await runGenerationJobOnline({
        jobId: result.job.id,
        client: result.client,
        briefing: result.briefing
      });

      await updateGenerationJob({
        jobId: result.job.id,
        status: "running",
        outputSummary:
          generationPayload.outputSummary ??
          JSON.stringify({
            summary: generationPayload.summary ?? "Geração concluída. Revise o job para aprovar ou reprovar."
          })
      });

      return NextResponse.json({
        ...result,
        generation: generationPayload
      });
    } catch (generationError) {
      const errorMessage =
        generationError instanceof Error ? generationError.message : "Falha ao conectar o app ao motor de geração.";

      await updateGenerationJob({
        jobId: result.job.id,
        status: "rejected",
        outputSummary: errorMessage
      });

      return NextResponse.json({
        ...result,
        error: errorMessage
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar briefing." },
      { status: 400 }
    );
  }
}
