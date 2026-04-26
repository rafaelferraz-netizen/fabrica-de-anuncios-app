import { NextRequest, NextResponse } from "next/server";

import { createClientRecord } from "@/lib/data";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name: string;
      segment: string;
      brandTone: string;
    };
    const client = await createClientRecord(body);
    return NextResponse.json(client);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar cliente." },
      { status: 400 }
    );
  }
}
