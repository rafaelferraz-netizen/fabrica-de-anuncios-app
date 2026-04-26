"use client";

import { ChangeEvent, DragEvent, useRef, useState, useTransition } from "react";
import { PlusCircle, RefreshCw, Users, FileText, Play, History, CheckCircle, XCircle } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { StatCard } from "./StatCard";
import { JobCard } from "./JobCard";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Props = {
  initialData: DashboardSnapshot;
};

type ReviewStatus = "approved" | "rejected";
type ClientSegment = (typeof CLIENT_SEGMENTS)[number];
type BrandTone = (typeof BRAND_TONES)[number];
type Platform = (typeof PLATFORMS)[number];
type FormatOption = (typeof FORMATS)[number];
type AdType = (typeof AD_TYPES)[number];
type Objective = (typeof OBJECTIVES)[number];
type FunnelStage = (typeof FUNNEL_STAGES)[number];

const CLIENT_SEGMENTS = ["Moda", "Beleza", "Estética", "Saúde", "E-commerce", "Infoproduto", "Serviço local", "Imobiliário", "Educação", "Outro"] as const;
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

async function uploadAsset(file: File, folder: "product-images" | "reference-ads") {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const response = await fetch("/api/uploads", { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ url: string }>;
}

function SelectionGroup<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <label className="text-sm text-[#6c655c]">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={cn(
              "px-3 py-2 text-sm border transition-all",
              value === option 
                ? "bg-[#1e1d1a] text-white border-[#1e1d1a]" 
                : "bg-white/70 text-[#1e1d1a] border-[#d6ccb9] hover:bg-[#f3efe7]"
            )}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Dashboard({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [clientForm, setClientForm] = useState({
    name: "",
    segment: CLIENT_SEGMENTS[0],
    brandTone: BRAND_TONES[0]
  });
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
  const [uploadingField, setUploadingField] = useState<"product" | "reference" | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { feedback: string; tags: string[] }>>({});

  const refreshSnapshot = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const nextData = await response.json();
      setData(nextData);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReview = async (jobId: string, status: ReviewStatus) => {
    const draft = reviewDrafts[jobId] ?? { feedback: "", tags: [] };
    startTransition(async () => {
      await postJson("/api/reviews", {
        jobId,
        status,
        feedback: draft.feedback,
        reasonTags: draft.tags
      });
      setReviewDrafts(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      await refreshSnapshot();
    });
  };

  const handleDropzoneUpload = async (file: File, field: 'productImageUrl' | 'referenceAdUrl') => {
    const type = field === 'productImageUrl' ? 'product' : 'reference';
    setUploadingField(type);
    try {
      const result = await uploadAsset(file, field === 'productImageUrl' ? 'product-images' : 'reference-ads');
      setBriefingForm(prev => ({ ...prev, [field]: result.url }));
    } finally {
      setUploadingField(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-4 md:p-8 space-y-8">
      <header className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8 items-end border border-[#d6ccb9] bg-gradient-to-br from-[#fffaf3]/96 to-[#f7ebde]/96 p-8 relative overflow-hidden">
        <div className="relative z-10">
          <div className="text-[#6c655c] text-xs uppercase tracking-[0.2em] mb-4">Fábrica de Anúncios</div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[0.95] mb-6">
            Direção criativa <br /> de alta performance.
          </h1>
          <p className="text-[#6c655c] text-lg max-w-2xl leading-relaxed font-serif">
            Briefing guiado, geração de assets por IA e aprovação em tempo real. 
            Conecte sua estratégia ao motor de criação mais potente do mercado.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 relative z-10">
          <StatCard label="Modo" value={data.mode} />
          <StatCard label="Clientes" value={data.clients.length} />
          <StatCard label="Briefings" value={data.briefings.length} />
          <StatCard label="Jobs" value={data.jobs.length} />
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-8">
        <aside className="space-y-8">
          <section className="bg-[#fffaf3] border border-[#d6ccb9] p-6 space-y-6">
            <div className="flex items-center gap-2 text-[#6c655c] text-xs uppercase tracking-widest border-b border-[#d6ccb9] pb-4">
              <Users size={14} /> 1. Novo Cliente
            </div>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-[#6c655c]">Nome da Marca</label>
                <input
                  className="w-full p-3 border border-[#d6ccb9] focus:ring-1 focus:ring-[#1e1d1a] outline-none"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  placeholder="Ex.: SPY Sunglasses"
                />
              </div>
              <SelectionGroup
                label="Segmento"
                options={CLIENT_SEGMENTS}
                value={clientForm.segment}
                onChange={(segment) => setClientForm({ ...clientForm, segment })}
              />
              <SelectionGroup
                label="Tom da Marca"
                options={BRAND_TONES}
                value={clientForm.brandTone}
                onChange={(brandTone) => setClientForm({ ...clientForm, brandTone })}
              />
              <button
                className="w-full bg-[#1e1d1a] text-white py-4 px-6 flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-50"
                disabled={pending || !clientForm.name.trim()}
                onClick={async () => {
                  await postJson("/api/clients", clientForm);
                  setClientForm({ name: "", segment: CLIENT_SEGMENTS[0], brandTone: BRAND_TONES[0] });
                  refreshSnapshot();
                }}
              >
                <PlusCircle size={18} /> Cadastrar Cliente
              </button>
            </div>
          </section>

          <section className="bg-[#fffaf3] border border-[#d6ccb9] p-6 space-y-6">
            <div className="flex items-center gap-2 text-[#6c655c] text-xs uppercase tracking-widest border-b border-[#d6ccb9] pb-4">
              <FileText size={14} /> 2. Briefing para IA
            </div>
            <div className="space-y-5">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-[#6c655c]">Cliente Selecionado</label>
                <select
                  className="w-full p-3 border border-[#d6ccb9] bg-white outline-none"
                  value={briefingForm.clientId}
                  onChange={(e) => setBriefingForm({ ...briefingForm, clientId: e.target.value })}
                >
                  <option value="">Selecione o cliente...</option>
                  {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm text-[#6c655c]">Produto</label>
                <input
                  className="w-full p-3 border border-[#d6ccb9] outline-none"
                  value={briefingForm.productName}
                  onChange={(e) => setBriefingForm({ ...briefingForm, productName: e.target.value })}
                  placeholder="Ex.: Óculos Twist Matte Black"
                />
              </div>

              <SelectionGroup label="Plataforma" options={PLATFORMS} value={briefingForm.platform} onChange={(platform) => setBriefingForm({ ...briefingForm, platform })} />
              <SelectionGroup label="Formato" options={FORMATS} value={briefingForm.format} onChange={(format) => setBriefingForm({ ...briefingForm, format })} />
              <SelectionGroup label="Tipo" options={AD_TYPES} value={briefingForm.adType} onChange={(adType) => setBriefingForm({ ...briefingForm, adType })} />
              <SelectionGroup label="Objetivo" options={OBJECTIVES} value={briefingForm.objective} onChange={(objective) => setBriefingForm({ ...briefingForm, objective })} />
              <SelectionGroup label="Funil" options={FUNNEL_STAGES} value={briefingForm.funnelStage} onChange={(funnelStage) => setBriefingForm({ ...briefingForm, funnelStage })} />

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-[#6c655c]">Assets (Imagens ou Links)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      className={cn(
                        "p-4 border border-dashed border-[#d6ccb9] bg-white/50 text-center text-xs space-y-2 hover:bg-[#f3efe7] transition-all",
                        briefingForm.productImageUrl && "border-solid border-[#1e1d1a] bg-[#f3efe7]"
                      )}
                      onClick={() => document.getElementById('product-up')?.click()}
                    >
                      {uploadingField === 'product' ? <RefreshCw className="animate-spin mx-auto" /> : <PlusCircle className="mx-auto" />}
                      <span>{briefingForm.productImageUrl ? "Produto Pronto" : "Foto Produto"}</span>
                    </button>
                    <button 
                      type="button"
                      className={cn(
                        "p-4 border border-dashed border-[#d6ccb9] bg-white/50 text-center text-xs space-y-2 hover:bg-[#f3efe7] transition-all",
                        briefingForm.referenceAdUrl && "border-solid border-[#1e1d1a] bg-[#f3efe7]"
                      )}
                      onClick={() => document.getElementById('ref-up')?.click()}
                    >
                      {uploadingField === 'reference' ? <RefreshCw className="animate-spin mx-auto" /> : <PlusCircle className="mx-auto" />}
                      <span>{briefingForm.referenceAdUrl ? "Referência Pronta" : "Ref. Anúncio"}</span>
                    </button>
                    <input id="product-up" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && handleDropzoneUpload(e.target.files[0], 'productImageUrl')} />
                    <input id="ref-up" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && handleDropzoneUpload(e.target.files[0], 'referenceAdUrl')} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    className="flex-1 bg-[#1e1d1a] text-white py-4 px-6 flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-50"
                    disabled={pending || !briefingForm.clientId || !briefingForm.productName.trim()}
                    onClick={async () => {
                      await postJson("/api/briefings", briefingForm);
                      setBriefingForm(prev => ({ ...prev, productName: "", productImageUrl: "", referenceAdUrl: "" }));
                      refreshSnapshot();
                    }}
                  >
                    <Play size={18} /> Iniciar Geração
                  </button>
                  <button 
                    className="p-4 border border-[#1e1d1a] text-[#1e1d1a] hover:bg-[#f3efe7] transition-all"
                    onClick={() => refreshSnapshot()}
                  >
                    <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={18} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </aside>

        <main className="space-y-8">
          <section className="bg-[#fffaf3] border border-[#d6ccb9] p-6">
            <div className="flex items-center justify-between border-b border-[#d6ccb9] pb-4 mb-6">
              <div className="flex items-center gap-2 text-[#6c655c] text-xs uppercase tracking-widest">
                <Play size={14} className="text-[#c75d2c]" /> 3. Fila de Produção
              </div>
              <div className="text-[10px] text-[#6c655c] flex items-center gap-2">
                Auto-update em tempo real <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-6">
              {data.jobs.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-[#d6ccb9] bg-white/50">
                  <FileText className="mx-auto opacity-20 mb-4" size={48} />
                  <p className="text-[#6c655c] font-serif">Nenhum job na fila de processamento.</p>
                </div>
              ) : (
                data.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    briefing={data.briefings.find(b => b.id === job.briefingId)}
                    onReview={handleReview}
                    reviewDraft={reviewDrafts[job.id] ?? { feedback: "", tags: [] }}
                    onDraftChange={(id, next) => setReviewDrafts(prev => ({
                      ...prev,
                      [id]: { ...(prev[id] ?? { feedback: "", tags: [] }), ...next }
                    }))}
                    isPending={pending}
                  />
                ))
              )}
            </div>
          </section>

          <section className="bg-[#fffaf3] border border-[#d6ccb9] p-6">
            <div className="flex items-center gap-2 text-[#6c655c] text-xs uppercase tracking-widest border-b border-[#d6ccb9] pb-4 mb-6">
              <History size={14} /> Memória Criativa e Decisões
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.reviews.length === 0 ? (
                <div className="col-span-full py-10 text-center text-[#6c655c] text-sm opacity-60">
                  Nenhum histórico registrado.
                </div>
              ) : (
                data.reviews.map((review) => (
                  <div key={review.id} className="p-4 border border-[#d6ccb9] bg-white/70 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        {review.status === 'approved' ? (
                          <CheckCircle className="text-[#1e7a4d]" size={16} />
                        ) : (
                          <XCircle className="text-[#b74332]" size={16} />
                        )}
                        <span className="text-xs font-bold uppercase tracking-tighter">
                          {review.status === 'approved' ? "Aprovado" : "Reprovado"}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#6c655c]">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm italic text-[#1e1d1a]">"{review.feedback || "Sem feedback adicional."}"</p>
                    <div className="flex flex-wrap gap-1">
                      {review.reasonTags.map(tag => (
                        <span key={tag} className="text-[9px] bg-[#f3efe7] px-1.5 py-0.5 border border-[#d6ccb9] text-[#6c655c]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}