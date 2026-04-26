import { NextRequest, NextResponse } from "next/server";

import { createBriefingRecord, updateGenerationJob } from "@/lib/data";

function buildPipelineBriefing(input: {
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
}) {
  return {
    meta: { briefing_id: input.briefing.id },
    campanha: {
      objetivo: input.briefing.objective,
      formato: input.briefing.format,
      canal: input.briefing.platform,
      plataforma: input.briefing.platform,
      tipo_peca: input.briefing.adType,
      momento_funil: input.briefing.funnelStage
    },
    produto: {
      nome: input.briefing.productName,
      categoria: input.client?.segment ?? ""
    },
    marca: {
      nome: input.client?.name ?? "Cliente",
      segmento: input.client?.segment ?? "",
      estilo_visual: input.client?.brandTone ?? ""
    },
    publico_alvo: {
      perfil: "",
      dor_principal: "",
      desejo: ""
    },
    estrategia_criativa: {
      angulo_criativo: "",
      objecao_alvo: "",
      tom_emocional: input.client?.brandTone
        ? [input.client.brandTone]
        : []
    },
    oferta: {
      headline: ""
    },
    visual: {
      elementos_obrigatorios: [],
      restricoes: [],
      objetivo_visual: ""
    },
    carousel: {
      card_count: input.briefing.adType === "carousel" ? 5 : 1,
      structure: ""
    },
    _referencias: {
      product_image_input: input.briefing.productImageUrl ?? "",
      existing_ad_reference: input.briefing.referenceAdUrl ?? "",
      link_ref: input.briefing.referenceAdUrl ?? "",
      site_url: "",
      instagram_handle: ""
    }
  };
}

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
      productImageUrl?: string;
      referenceAdUrl?: string;
    };
    const result = await createBriefingRecord(body);
    try {
      await updateGenerationJob({
        jobId: result.job.id,
        status: "running",
        outputSummary: "Geração iniciada pelo motor Python."
      });

      const generationResponse = await fetch(`${request.nextUrl.origin}/api/python-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: result.job.id,
          briefing: buildPipelineBriefing({
            client: result.client,
            briefing: result.briefing
          })
        })
      });

      const generationPayload = await generationResponse.json();
      if (!generationResponse.ok) {
        await updateGenerationJob({
          jobId: result.job.id,
          status: "rejected",
          outputSummary:
            generationPayload.error ?? "Falha ao executar o motor Python de geração."
        });
        return NextResponse.json(
          {
            ...result,
            generation: generationPayload
          }
        );
      }

      await updateGenerationJob({
        jobId: result.job.id,
        status: "running",
        outputSummary:
          generationPayload.summary ??
          "Geração concluída. Revise o job para aprovar ou reprovar."
      });

      return NextResponse.json({
        ...result,
        generation: generationPayload
      });
    } catch (generationError) {
      await updateGenerationJob({
        jobId: result.job.id,
        status: "rejected",
        outputSummary:
          generationError instanceof Error
            ? generationError.message
            : "Falha ao conectar o app ao motor Python."
      });
      return NextResponse.json(
        {
          ...result,
          error:
            generationError instanceof Error
              ? generationError.message
              : "Falha ao conectar o app ao motor Python."
        }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar briefing." },
      { status: 400 }
    );
  }
}
