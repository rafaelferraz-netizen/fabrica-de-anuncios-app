"use client";

import { useState, useTransition } from "react";
import { RefreshCw, LayoutDashboard, Users, Target, ShieldCheck, Zap, Briefcase, Plus, ImageIcon, CheckCircle2, UserCircle } from "lucide-react";
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
  const [activeView, setActiveView] = useState<"general" | "client">("general");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [clientForm, setClientForm] = useState({ name: "", segment: CLIENT_SEGMENTS[0], brandTone: "Premium" });
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

  const postJson = async (path: string, body: unknown) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };

  const handleReview = async (jobId: string, status: "approved" | "rejected") => {
    const draft = reviewDrafts[jobId] ?? { feedback: "", tags: [] };
    startTransition(async () => {
      await postJson("/api/reviews", { jobId, status, feedback: draft.feedback, reasonTags: draft.tags });
      setReviewDrafts(p => { const n = {...p}; delete n[jobId]; return n; });
      await refreshSnapshot();
    });
  };

  const selectedClient = data.clients.find(c => c.id === selectedClientId);
  const clientJobs = data.jobs.filter(j => {
    const briefing = data.briefings.find(b => b.id === j.briefingId);
    return briefing?.clientId === selectedClientId;
  });

  return (
    <div className="app-container">
      {zoomedImage && <ImageModal url={zoomedImage} onClose={() => setZoomedImage(null)} />}

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="flex items-center gap-2 text-white mb-2">
            <Briefcase className="text-[var(--accent)]" size={24} />
            <span className="font-serif font-bold text-xl tracking-tight">FÁBRICA DE ANÚNCIOS</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#52525b] font-bold">Barbosa Souza & Co | V4 Company</div>
        </div>

        <nav className="sidebar-nav">
          <div 
            className={`nav-item ${activeView === 'general' ? 'active' : ''}`}
            onClick={() => { setActiveView('general'); setSelectedClientId(null); }}
          >
            <LayoutDashboard size={18} /> Painel Geral
          </div>
          
          <div className="client-list-header">Clientes & Marcas</div>
          {data.clients.map(client => (
            <div 
              key={client.id}
              className={`nav-item ${selectedClientId === client.id ? 'active' : ''}`}
              onClick={() => { setActiveView('client'); setSelectedClientId(client.id); }}
            >
              <Users size={18} /> {client.name}
            </div>
          ))}

          <div 
            className="nav-item mt-4 border border-dashed border-[#27272a] hover:border-[var(--accent)]"
            onClick={() => { setActiveView('general'); setSelectedClientId(null); }}
          >
            <Plus size={18} /> Adicionar Marca
          </div>
        </nav>
      </aside>

      <main className="main-content">
        {activeView === 'general' ? (
          <div className="space-y-12">
            <header className="flex justify-between items-end border-b border-[var(--line)] pb-8">
              <div>
                <div className="eyebrow">Dashboard Global</div>
                <h1 className="text-5xl font-serif font-bold">Barbosa Souza & Co</h1>
                <p className="text-[var(--muted)] mt-2 italic">Fábrica de Anúncios de Alta Performance</p>
              </div>
              <div className="flex gap-4">
                <StatCard label="Em Produção" value={data.jobs.filter(j => j.status === 'running').length} />
                <StatCard label="Marcas Ativas" value={data.clients.length} />
              </div>
            </header>

            <div className="dashboard-grid">
              <div className="stack">
                <section className="panel">
                  <div className="eyebrow">Onboarding</div>
                  <h3 className="text-xl font-bold mb-6">Nova Marca</h3>
                  <div className="field">
                    <label>Nome do Cliente</label>
                    <input 
                      value={clientForm.name} 
                      onChange={e => setClientForm({...clientForm, name: e.target.value})} 
                      placeholder="Ex: Spy Eyewear"
                    />
                  </div>
                  <button 
                    className="button w-full" 
                    disabled={pending || !clientForm.name}
                    onClick={async () => {
                      await postJson("/api/clients", clientForm);
                      setClientForm({name: "", segment: CLIENT_SEGMENTS[0], brandTone: "Premium"});
                      refreshSnapshot();
                    }}
                  >
                    Registrar Cliente
                  </button>
                </section>

                <section className="panel">
                  <div className="eyebrow">Briefing Estratégico Completo</div>
                  <div className="space-y-6">
                    <div className="field">
                      <label>Cliente</label>
                      <select 
                        value={briefingForm.clientId} 
                        onChange={e => setBriefingForm({...briefingForm, clientId: e.target.value})}
                      >
                        {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Produto/Oferta</label>
                      <input 
                        value={briefingForm.productName} 
                        onChange={e => setBriefingForm({...briefingForm, productName: e.target.value})} 
                        placeholder="Ex: Tênis Air Max v2"
                      />
                    </div>

                    <div className="field">
                      <label className="flex items-center gap-2"><Target size={14} className="text-[var(--accent)]" /> Posicionamento</label>
                      <select 
                        value={Object.keys(PLACEMENTS).find(k => PLACEMENTS[k as PlacementKey].platform === briefingForm.platform && PLACEMENTS[k as PlacementKey].format === briefingForm.format)} 
                        onChange={e => {
                          const config = PLACEMENTS[e.target.value as PlacementKey];
                          setBriefingForm({...briefingForm, platform: config.platform, format: config.format});
                        }}
                      >
                        {Object.keys(PLACEMENTS).map(key => <option key={key} value={key}>{key}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label className="flex items-center gap-2"><UserCircle size={14} className="text-[var(--accent)]" /> Público Alvo</label>
                      <select value={briefingForm.targetAudience} onChange={e => setBriefingForm({...briefingForm, targetAudience: e.target.value})}>
                        {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label className="flex items-center gap-2"><ShieldCheck size={14} className="text-[var(--accent)]" /> Ângulo Criativo</label>
                      <select value={briefingForm.creativeAngle} onChange={e => setBriefingForm({...briefingForm, creativeAngle: e.target.value})}>
                        {ANGLES.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label className="flex items-center gap-2"><Zap size={14} className="text-[var(--accent)]" /> Voz da Marca</label>
                      <select value={briefingForm.brandVoice} onChange={e => setBriefingForm({...briefingForm, brandVoice: e.target.value})}>
                        {VOICES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>

                    <div className="field">
                      <label>Assets Estratégicos</label>
                      <div className="grid grid-cols-2 gap-2">
                        <div 
                          className={`dropzone ${briefingForm.productImageUrl ? 'filled' : ''}`} 
                          onClick={() => document.getElementById('up-p')?.click()}
                        >
                          {briefingForm.productImageUrl ? <CheckCircle2 className="dropzone-icon" size={18} /> : <ImageIcon className="dropzone-icon" size={18} />}
                          <span>{briefingForm.productImageUrl ? "Produto OK" : "Foto Produto"}</span>
                        </div>
                        <div 
                          className={`dropzone ${briefingForm.referenceAdUrl ? 'filled' : ''}`} 
                          onClick={() => document.getElementById('up-r')?.click()}
                        >
                          {briefingForm.referenceAdUrl ? <CheckCircle2 className="dropzone-icon" size={18} /> : <ImageIcon className="dropzone-icon" size={18} />}
                          <span>{briefingForm.referenceAdUrl ? "Ref OK" : "Referência"}</span>
                        </div>
                        <input id="up-p" type="file" hidden onChange={async e => { const f = e.target.files?.[0]; if(f){ const r = await uploadAsset(f, 'product-images'); setBriefingForm({...briefingForm, productImageUrl: r.url}); }}} />
                        <input id="up-r" type="file" hidden onChange={async e => { const f = e.target.files?.[0]; if(f){ const r = await uploadAsset(f, 'reference-ads'); setBriefingForm({...briefingForm, referenceAdUrl: r.url}); }}} />
                      </div>
                    </div>

                    <button 
                      className="button w-full" 
                      disabled={pending || !briefingForm.productName}
                      onClick={async () => {
                        await postJson("/api/briefings", briefingForm);
                        setBriefingForm(prev => ({ ...prev, productName: "", productImageUrl: "", referenceAdUrl: "" }));
                        refreshSnapshot();
                      }}
                    >
                      Disparar Geração V4
                    </button>
                  </div>
                </section>
              </div>

              <div className="stack">
                <section className="panel">
                  <div className="flex justify-between items-center mb-8 border-b pb-4">
                    <div className="eyebrow m-0">Fila Global de Produção</div>
                    <button onClick={refreshSnapshot} className="text-[var(--muted)] hover:text-black">
                      <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                    </button>
                  </div>
                  {data.jobs.length === 0 ? (
                    <div className="text-center py-20 text-[var(--muted)] italic">Aguardando novos briefings...</div>
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
                        onZoom={url => setZoomedImage(url)}
                      />
                    ))
                  )}
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            <header className="flex justify-between items-end border-b border-[var(--line)] pb-8">
              <div>
                <div className="eyebrow">Memória Criativa</div>
                <h1 className="text-5xl font-serif font-bold">{selectedClient?.name}</h1>
                <p className="text-[var(--muted)] mt-2">{selectedClient?.segment} • Posicionamento {selectedClient?.brandTone}</p>
              </div>
              <div className="flex gap-4">
                <StatCard label="Aprovados" value={clientJobs.filter(j => j.status === 'approved').length} />
                <StatCard label="Taxa de Aprovação" value={`${clientJobs.length ? Math.round((clientJobs.filter(j => j.status === 'approved').length / clientJobs.length) * 100) : 0}%`} />
              </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <section className="panel">
                <div className="eyebrow">Histórico de Criativos</div>
                <div className="space-y-6">
                  {clientJobs.length === 0 ? (
                    <div className="text-center py-20 text-[var(--muted)]">Nenhum criativo gerado para esta marca.</div>
                  ) : (
                    clientJobs.map(job => (
                      <JobCard
                        key={job.id}
                        job={job}
                        briefing={data.briefings.find(b => b.id === job.briefingId)}
                        onReview={handleReview}
                        reviewDraft={reviewDrafts[job.id] ?? { feedback: "", tags: [] }}
                        onDraftChange={(id, n) => setReviewDrafts(p => ({ ...p, [id]: { ...(p[id] ?? { feedback: "", tags: [] }), ...n } }))}
                        isPending={pending}
                        onZoom={url => setZoomedImage(url)}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="panel h-fit">
                <div className="eyebrow">Aprendizados da IA</div>
                <div className="grid grid-cols-1 gap-6">
                  {data.reviews.filter(r => clientJobs.some(j => j.id === r.jobId)).map(review => (
                    <div key={review.id} className="p-4 bg-[var(--bg)] border-l-4 border-[var(--ink)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`pill ${review.status === 'approved' ? 'success' : 'danger'}`}>{review.status}</span>
                        <span className="text-[10px] font-bold text-[var(--muted)]">{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm italic font-serif">"{review.feedback || 'Aprovação sem comentários.'}"</p>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {review.reasonTags.map(tag => (
                          <span key={tag} className="text-[9px] uppercase tracking-tighter bg-white px-2 py-0.5 border border-[var(--line)]">{tag}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {data.reviews.filter(r => clientJobs.some(j => j.id === r.jobId)).length === 0 && (
                    <div className="text-center py-10 text-[var(--muted)] text-sm">Aguardando primeiros feedbacks para mapear padrões.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}