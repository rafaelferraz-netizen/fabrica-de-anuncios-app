"use client";

import { useState, useTransition } from "react";
import { RefreshCw, History, Maximize2, Download, ShieldCheck, Target, Zap } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { StatCard } from "./StatCard";
import { JobCard } from "./JobCard";
import { ImageModal } from "./ImageModal";

type Props = { initialData: DashboardSnapshot };

const CLIENT_SEGMENTS = ["Moda", "Beleza", "Estética", "Saúde", "E-commerce", "Infoproduto", "Serviço local", "Outro"] as const;
const OBJECTIVES = ["Conversão", "Leads", "Engajamento", "Reconhecimento"] as const;
const FUNNEL_STAGES = ["Topo", "Meio", "Fundo"] as const;
const AUDIENCES = ["Frio (Não conhece)", "Morno (Já viu)", "Quente (Pronto p/ comprar)"] as const;
const ANGLES = ["Transformação", "Autoridade", "Prova Social", "Escassez", "Curiosidade"] as const;
const VOICES = ["Inspirador", "Urgente", "Técnico", "Casual/UGC", "Agressivo (Oferta)"] as const;

const PLACEMENTS = {
  "Instagram Feed (4:5)": { platform: "Instagram", format: "4:5 (1080x1350px)" },
  "Instagram Stories (9:16)": { platform: "Instagram", format: "9:16 (1080x1920px)" },
  "Instagram Square (1:1)": { platform: "Instagram", format: "1:1 (1080x1080px)" },
  "TikTok Ads (9:16)": { platform: "TikTok", format: "9:16 (1080x1920px)" },
} as const;

type PlacementKey = keyof typeof PLACEMENTS;

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function uploadAsset(file: File, folder: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ url: string }>;
}

export function Dashboard({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [clientForm, setClientForm] = useState({ name: "", segment: CLIENT_SEGMENTS[0], brandTone: "Premium" });
  
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementKey>("Instagram Feed (4:5)");
  
  const [briefingForm, setBriefingForm] = useState({
    clientId: initialData.clients[0]?.id ?? "",
    productName: "",
    platform: PLACEMENTS["Instagram Feed (4:5)"].platform,
    format: PLACEMENTS["Instagram Feed (4:5)"].format,
    adType: "static" as const,
    objective: OBJECTIVES[0],
    funnelStage: FUNNEL_STAGES[0],
    targetAudience: AUDIENCES[0],
    creativeAngle: ANGLES[0],
    brandVoice: VOICES[0],
    productImageUrl: "",
    referenceAdUrl: ""
  });

  const handlePlacementChange = (key: PlacementKey) => {
    setSelectedPlacement(key);
    const config = PLACEMENTS[key];
    setBriefingForm(prev => ({ ...prev, platform: config.platform, format: config.format }));
  };

  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { feedback: string; tags: string[] }>>({});

  const refreshSnapshot = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      setData(await response.json());
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReview = async (jobId: string, status: "approved" | "rejected") => {
    const draft = reviewDrafts[jobId] ?? { feedback: "", tags: [] };
    startTransition(async () => {
      await postJson("/api/reviews", { jobId, status, feedback: draft.feedback, reasonTags: draft.tags });
      setReviewDrafts(p => { const n = {...p}; delete n[jobId]; return n; });
      await refreshSnapshot();
    });
  };

  return (
    <div className="page-shell space-y-6">
      {zoomedImage && <ImageModal url={zoomedImage} onClose={() => setZoomedImage(null)} />}
      
      <header className="hero">
        <div>
          <div className="eyebrow">Fábrica de Anúncios</div>
          <h1>Direção criativa & Performance editorial.</h1>
          <p>Briefing técnico v4 com prompts estratégicos ocultos para geração de criativos de alta conversão.</p>
        </div>
        <div className="hero-stats">
          <StatCard label="Modo" value={data.mode} />
          <StatCard label="Clientes" value={data.clients.length} />
          <StatCard label="Jobs" value={data.jobs.length} />
        </div>
      </header>

      <div className="grid">
        <div className="stack">
          <section className="panel">
            <div className="eyebrow">Novo Cliente</div>
            <div className="field">
              <label>Marca</label>
              <input value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} placeholder="Ex: Spy Eyewear" />
            </div>
            <button className="button w-full" disabled={pending || !clientForm.name} onClick={async () => { await postJson("/api/clients", clientForm); setClientForm({name: "", segment: CLIENT_SEGMENTS[0], brandTone: "Premium"}); refreshSnapshot(); }}>Salvar Marca</button>
          </section>

          <section className="panel">
            <div className="eyebrow">Briefing Estratégico</div>
            
            <div className="space-y-6">
              <div className="field">
                <label>Cliente</label>
                <select value={briefingForm.clientId} onChange={e => setBriefingForm({...briefingForm, clientId: e.target.value})}>
                  {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Produto</label>
                <input value={briefingForm.productName} onChange={e => setBriefingForm({...briefingForm, productName: e.target.value})} placeholder="Ex: Óculos Spy 45" />
              </div>

              <div className="field">
                <label className="flex items-center gap-2"><Target size={14} className="text-[var(--accent)]" /> Posicionamento</label>
                <select value={selectedPlacement} onChange={e => handlePlacementChange(e.target.value as PlacementKey)}>
                  {(Object.keys(PLACEMENTS) as PlacementKey[]).map(key => <option key={key} value={key}>{key}</option>)}
                </select>
              </div>

              <div className="field">
                <label className="flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--accent)]" /> Público & Ângulo</label>
                <div className="grid grid-cols-1 gap-2">
                  <select value={briefingForm.targetAudience} onChange={e => setBriefingForm({...briefingForm, targetAudience: e.target.value})}>
                    {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select value={briefingForm.creativeAngle} onChange={e => setBriefingForm({...briefingForm, creativeAngle: e.target.value})}>
                    {ANGLES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="flex items-center gap-2"><Zap size={14} className="text-[var(--accent)]" /> Voz da Marca</label>
                <select value={briefingForm.brandVoice} onChange={e => setBriefingForm({...briefingForm, brandVoice: e.target.value})}>
                  {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Assets</label>
                <div className="grid grid-cols-2 gap-2">
                  <button className={`dropzone ${briefingForm.productImageUrl ? 'filled' : ''}`} onClick={() => document.getElementById('up-p')?.click()}>
                    {briefingForm.productImageUrl ? "Produto OK" : "+ Foto"}
                  </button>
                  <button className={`dropzone ${briefingForm.referenceAdUrl ? 'filled' : ''}`} onClick={() => document.getElementById('up-r')?.click()}>
                    {briefingForm.referenceAdUrl ? "Ref OK" : "+ Ref"}
                  </button>
                  <input id="up-p" type="file" hidden onChange={async e => { const f = e.target.files?.[0]; if(f){ const r = await uploadAsset(f, 'product-images'); setBriefingForm({...briefingForm, productImageUrl: r.url}); }}} />
                  <input id="up-r" type="file" hidden onChange={async e => { const f = e.target.files?.[0]; if(f){ const r = await uploadAsset(f, 'reference-ads'); setBriefingForm({...briefingForm, referenceAdUrl: r.url}); }}} />
                </div>
              </div>

              <button className="button w-full" disabled={pending || !briefingForm.productName} onClick={async () => { await postJson("/api/briefings", briefingForm); setBriefingForm({...briefingForm, productName: "", productImageUrl: "", referenceAdUrl: ""}); refreshSnapshot(); }}>
                Disparar Geração Inteligente
              </button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="flex justify-between items-center mb-6 border-b border-[var(--line)] pb-4">
              <div className="eyebrow m-0">Fila de Produção</div>
              <button onClick={refreshSnapshot} className="text-[var(--muted)] hover:text-[var(--ink)]">
                <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </div>
            {data.jobs.length === 0 ? (
              <div className="italic text-[var(--muted)] py-10 text-center">Nenhum job em andamento.</div>
            ) : (
              data.jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  briefing={data.briefings.find(b => b.id === job.briefingId)}
                  onReview={handleReview}
                  reviewDraft={reviewDrafts[job.id] ?? { feedback: "", tags: [] }}
                  onDraftChange={(id, n) => setReviewDrafts(p => ({ ...p, [id]: { ...(p[id] ?? { feedback: "", tags: [] }), ...n } }))}
                  isPending={pending}
                  onZoom={(url) => setZoomedImage(url)}
                />
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}