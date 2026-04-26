import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

async function ensureBucket() {
  const supabase = getSupabaseAdmin();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = (buckets ?? []).some((bucket) => bucket.name === "ad-assets");

  if (!exists) {
    const { error } = await supabase.storage.createBucket("ad-assets", { public: true });
    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw error;
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") ?? "uploads");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não recebido." }, { status: 400 });
    }

    await ensureBucket();

    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const safeName = `${folder}/${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.storage.from("ad-assets").upload(safeName, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true
    });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage.from("ad-assets").getPublicUrl(safeName);
    return NextResponse.json({ url: data.publicUrl, path: safeName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar arquivo." },
      { status: 400 }
    );
  }
}
