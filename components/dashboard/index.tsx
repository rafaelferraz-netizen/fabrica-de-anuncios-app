"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { StatCard } from "./StatCard";
import { JobCard } from "./JobCard";

type Props = { initialData: DashboardSnapshot };

const CLIENT_SEGMENTS = ["Moda", "Beleza", "Estética", "Saúde", "E-commerce", "Infoproduto", "Serviço local", "Outro"] as const;
const BRAND_TONES = ["Premium", "Popular", "Confiável", "Ousado", "Clean", "Técnico"] as const;
const PLATFORMS = ["Instagram Feed", "Instagram Stories", "Facebook Feed", "LinkedIn", "TikTok"] as const;
const FORMATS = ["1:1 (1080x1080px)", "4:5 (1080x1350px)", "9:16 (1080x1920px)"] as const;
const AD_TYPES = ["static", "carousel"] as const;
const OBJECTIVES = ["Reconhecimento", "Engajamento", "Leads", "Conversão", "Remarketing"] as const;
const FUNNEL_STAGES = ["Topo", "Meio", "Fundo"] as const;

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
  const [pending, startTransition] = useTransition();
  const [clientForm, setClientForm] = useState({ name: "", segment: CLIENT_SEGMENTS[0], brandTone: BRAND_TONES[0] });
  const [briefingForm, setBriefingForm] = useState({
    clientId: initialData.clients[0]?.id ?? "",
    productName: "",
    platform: PLATFORMS[0],
    format: FORMATS[1],
    adType: AD_TYPES[0],
    objective: OBJECTIVES[2],
    funnelStage: FUNNEL_STAGES[0],
    productImageUrl: "",
    referenceAdUrl: ""
  });
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
      <header className="hero">
        <div>
          <div className="eyebrow">Fábrica de Anúncios</div>
          <h1>Direção criativa & Performance editorial.</h1>
          <p>Geração de criativos que não parecem IA. Briefing técnico, curadoria visual e aprovação em tempo real para agências que prezam pela estética.</p>
        </div>
        <div className="hero-stats">
          <StatCard label="Modo" value={data.mode} />
          <StatCard label="Clientes" value={data.clients.length} />
          <StatCard label="Briefings" value={data.briefings.length} />
          <StatCard label="Jobs" value={data.jobs.length} />
        </div>
      </header>

      <div className="grid">
        <div className="stack">
          <section className="panel">
            <div className="eyebrow">Novo Cliente</div>
            <div className="field">
              <label>Nome da Marca</label>
              <input value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} />
            </div>
            <div className="field">
              <label>Segmento</label>
              <div className="selection-group">
                {CLIENT_SEGMENTS.map(s => (
                  <button key={s} className={`choice ${clientForm.segment === s ? 'active' : ''}`} onClick={() => setClientForm({...clientForm, segment: s})}>{s}</button>
                ))}
              </div>
            </div>
            <button className="button w-full" disabled={pending || !clientForm.name} onClick={async () => { await postJson("/api/clients", clientForm); setClientForm({name: "", segment: CLIENT_SEGMENTS[0], brandTone: BRAND_TONES[0]}); refreshSnapshot(); }}>Criar Cliente</button>
          </section>

          <section className="panel">
            <div className="eyebrow">Briefing Criativo</div>
            <div className="field">
              <label>Cliente</label>
              <select value={briefingForm.clientId} onChange={e => setBriefingForm({...briefingForm, clientId: e.target.value})}>
                {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Produto</label>
              <input value={briefingForm.productName} onChange={e => setBriefingForm({...briefingForm, productName: e.target.value})} />
            </div>
            <div className="field">
              <label>Plataforma & Formato</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={briefingForm.platform} onChange={e => setBriefingForm({...briefingForm, platform: e.target.value as any})}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={briefingForm.format} onChange={e => setBriefingForm({...briefingForm, format: e.target.value as any})}>
                  {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Assets (Upload)</label>
              <div className="grid grid-cols-2 gap-2">
                <button className={`dropzone ${briefingForm.productImageUrl ? 'filled' : ''}`} onClick={() => document.getElementById('up-p')?.click()}>
                  {briefingForm.productImageUrl ? "Produto OK" : "+ Foto Produto"}
                </button>
                <button className={`dropzone ${briefingForm.referenceAdUrl ? 'filled' : ''}`} onClick={() => document.getElementById('up-r')?.click()}>
                  {briefingForm.referenceAdUrl ? "Ref OK" : "+ Referência"}
                </button>
                <input id="up-p" type="file" hidden onChange={async e => { const f = e.target.files?.[0]; if(f){ const r = await uploadAsset(f, 'product-images'); setBriefingForm({...briefingForm, productImageUrl: r.url}); }}} />
                <input id="up-r" type="file" hidden onChange={async e => { const f = e.target.files?.[0]; if(f){ const r = await uploadAsset(f, 'reference-ads'); setBriefingForm({...briefingForm, referenceAdUrl: r.url}); }}} />
              </div>
            </div>
            <button className="button w-full" disabled={pending || !briefingForm.productName} onClick={async () => { await postJson("/api/briefings", briefingForm); setBriefingForm({...briefingForm, productName: "", productImageUrl: "", referenceAdUrl: ""}); refreshSnapshot(); }}>Iniciar Geração</button>
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
                />
              ))
            )}
          </section>

          <section className="panel">
            <div className="eyebrow">Memória Recente</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.reviews.map(review => (
                <div key={review.id} className="p-4 border border-[var(--line)] bg-white/40">
                  <div className="flex justify-between mb-2">
                    <span className={`pill ${review.status === 'approved' ? 'success' : 'danger'}`}>{review.status}</span>
                    <span className="text-[10px] text-[var(--muted)]">{new Date(review.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm italic font-serif">"{review.feedback || 'Sem comentários'}"</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}