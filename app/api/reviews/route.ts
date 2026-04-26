import { NextRequest, NextResponse } from "next/server";

import { createReviewRecord } from "@/lib/data";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      jobId: string;
      status: "approved" | "rejected";
      feedback: string;
      reasonTags: string[];
    };
    const result = await createReviewRecord(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar review." },
      { status: 400 }
    );
  }
}
