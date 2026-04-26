import { NextRequest, NextResponse } from "next/server";

import { createBriefingRecord } from "@/lib/data";

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
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar briefing." },
      { status: 400 }
    );
  }
}
