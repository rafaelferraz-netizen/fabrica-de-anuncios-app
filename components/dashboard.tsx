"use client";

import { ChangeEvent, DragEvent, useRef, useState, useTransition } from "react";

import type { DashboardSnapshot } from "@/lib/types";

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

const CLIENT_SEGMENTS = [
  "Moda",
  "Beleza",
  "Estética",
  "Saúde",
  "E-commerce",
  "Infoproduto",
  "Serviço local",
  "Imobiliário",
  "Educação",
  "Outro"
] as const;

const BRAND_TONES = ["Premium", "Popular", "Confiável", "Ousado", "Clean", "Técnico"] as const;
const PLATFORMS = ["Instagram Feed", "Instagram Stories", "Facebook Feed", "LinkedIn", "TikTok"] as const;
const FORMATS = ["1:1 (1080x1080px)", "4:5 (1080x1350px)", "9:16 (1080x1920px)"] as const;
const AD_TYPES = ["static", "carousel"] as const;
const OBJECTIVES = ["Reconhecimento", "Engajamento", "Leads", "Conversão", "Remarketing"] as const;
const FUNNEL_STAGES = ["Topo", "Meio", "Fundo"] as const;
const REVIEW_TAGS = [
  "genérico",
  "sem cara da marca",
  "produto fraco",
  "não conversa com o público",
  "composição ruim",
  "quero algo mais clean",
  "quero algo mais agressivo"
] as const;

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function uploadAsset(file: File, folder: "product-images" | "reference-ads") {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ url: string }>;
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
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
    <div className="field">
      <label>{label}</label>
      <div className="selection-group">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`choice ${value === option ? "active" : ""}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagPicker({
  tags,
  active,
  onToggle
}: {
  tags: readonly string[];
  active: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="tag-picker">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`chip ${active.includes(tag) ? "active" : ""}`}
          onClick={() => onToggle(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

function AssetDropzone({
  label,
  hint,
  value,
  busy,
  folder,
  onBusyChange,
  onResolved,
  onClear
}: {
  label: string;
  hint: string;
  value: string;
  busy: boolean;
  folder: "product-images" | "reference-ads";
  onBusyChange: (busy: boolean) => void;
  onResolved: (value: string) => Promise<void> | void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  async function resolveTransfer(files: FileList | null, text?: string) {
    if (files?.[0]) {
      onBusyChange(true);
      try {
        const result = await uploadAsset(files[0], folder);
        await onResolved(result.url);
      } finally {
        onBusyChange(false);
      }
      return;
    }

    if (text && isUrl(text)) {
      await onResolved(text.trim());
    }
  }

  async function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    await resolveTransfer(event.dataTransfer.files, uri);
  }

  async function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    onBusyChange(true);
    try {
      const result = await uploadAsset(file, folder);
      await onResolved(result.url);
    } finally {
      onBusyChange(false);
    }
    event.target.value = "";
  }

  return (
    <div className="field">
      <label>{label}</label>
      <button
        type="button"
        className={`dropzone ${dragging ? "dragging" : ""} ${value ? "filled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          void handleDrop(event);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dropzone-title">{busy ? "Enviando..." : value ? "Arquivo pronto" : "Arraste e solte aqui"}</div>
        <div className="dropzone-copy">{value ? "Clique para trocar ou solte uma nova imagem." : hint}</div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => void handleInput(event)} />
      {value ? (
        <div className="asset-preview">
          <img src={value} alt={label} />
          <div className="asset-meta">
            <a href={value} target="_blank" rel="noreferrer">
              Abrir imagem
            </a>
            <button type="button" className="text-button" onClick={onClear}>
              Remover
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Dashboard({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [pending, startTransition] = useTransition();
  const [clientForm, setClientForm] = useState<{
    name: string;
    segment: ClientSegment;
    brandTone: BrandTone;
  }>({
    name: "",
    segment: CLIENT_SEGMENTS[0],
    brandTone: BRAND_TONES[0]
  });
  const [briefingForm, setBriefingForm] = useState<{
    clientId: string;
    productName: string;
    platform: Platform;
    format: FormatOption;
    adType: AdType;
    objective: Objective;
    funnelStage: FunnelStage;
    productImageUrl: string;
    referenceAdUrl: string;
  }>({
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

  function setReviewDraft(jobId: string, next: Partial<{ feedback: string; tags: string[] }>) {
    setReviewDrafts((current) => ({
      ...current,
      [jobId]: {
        feedback: current[jobId]?.feedback ?? "",
        tags: current[jobId]?.tags ?? [],
        ...next
      }
    }));
  }

  function toggleReviewTag(jobId: string, tag: string) {
    const active = reviewDrafts[jobId]?.tags ?? [];
    setReviewDraft(jobId, {
      tags: active.includes(tag) ? active.filter((item) => item !== tag) : [...active, tag]
    });
  }

  function refreshSnapshot() {
    startTransition(async () => {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const nextData = (await response.json()) as DashboardSnapshot;
      setData(nextData);
      setBriefingForm((current) => ({
        ...current,
        clientId: nextData.clients[0]?.id ?? current.clientId
      }));
    });
  }

  async function submitReview(jobId: string, status: ReviewStatus) {
    const draft = reviewDrafts[jobId] ?? { feedback: "", tags: [] };
    await postJson("/api/reviews", {
      jobId,
      status,
      feedback: draft.feedback,
      reasonTags: draft.tags
    });
    setReviewDrafts((current) => ({
      ...current,
      [jobId]: { feedback: "", tags: [] }
    }));
    refreshSnapshot();
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <div>
          <div className="eyebrow">Fábrica de Anúncios</div>
          <h1>Briefing guiado, criação visual e decisão rápida no mesmo painel.</h1>
          <p>
            Agora o operador escolhe plataforma, formato, objetivo e funil por seleção direta,
            sobe referências por arrastar e soltar e aprova ou reprova cada geração sem sair da fila.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-label">Modo atual</div>
            <div className="stat-value">{data.mode}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Clientes</div>
            <div className="stat-value">{data.clients.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Briefings</div>
            <div className="stat-value">{data.briefings.length}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Jobs</div>
            <div className="stat-value">{data.jobs.length}</div>
          </div>
        </div>
      </section>

      <div className="grid">
        <div className="stack">
          <section className="panel">
            <div className="eyebrow">1. Cliente</div>
            <h2>Novo cliente</h2>
            <div className="field">
              <label>Nome</label>
              <input
                value={clientForm.name}
                onChange={(event) => setClientForm({ ...clientForm, name: event.target.value })}
                placeholder="Ex.: Clínica Vida"
              />
            </div>
            <SelectionGroup
              label="Segmento"
              options={CLIENT_SEGMENTS}
              value={clientForm.segment}
              onChange={(segment) => setClientForm({ ...clientForm, segment })}
            />
            <SelectionGroup
              label="Tom da marca"
              options={BRAND_TONES}
              value={clientForm.brandTone}
              onChange={(brandTone) => setClientForm({ ...clientForm, brandTone })}
            />
            <div className="button-row">
              <button
                className="button"
                disabled={pending || !clientForm.name.trim()}
                onClick={async () => {
                  await postJson("/api/clients", clientForm);
                  setClientForm({ name: "", segment: CLIENT_SEGMENTS[0], brandTone: BRAND_TONES[0] });
                  refreshSnapshot();
                }}
              >
                Criar cliente
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">2. Briefing</div>
            <h2>Novo job</h2>
            <div className="field">
              <label>Cliente</label>
              <select
                value={briefingForm.clientId}
                onChange={(event) => setBriefingForm({ ...briefingForm, clientId: event.target.value })}
              >
                <option value="">Selecione</option>
                {data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Produto</label>
              <input
                value={briefingForm.productName}
                onChange={(event) => setBriefingForm({ ...briefingForm, productName: event.target.value })}
                placeholder="Ex.: Sérum facial anti-idade"
              />
            </div>
            <SelectionGroup
              label="Plataforma"
              options={PLATFORMS}
              value={briefingForm.platform}
              onChange={(platform) => setBriefingForm({ ...briefingForm, platform })}
            />
            <SelectionGroup
              label="Formato"
              options={FORMATS}
              value={briefingForm.format}
              onChange={(format) => setBriefingForm({ ...briefingForm, format })}
            />
            <SelectionGroup
              label="Tipo de peça"
              options={AD_TYPES}
              value={briefingForm.adType}
              onChange={(adType) => setBriefingForm({ ...briefingForm, adType })}
            />
            <SelectionGroup
              label="Objetivo"
              options={OBJECTIVES}
              value={briefingForm.objective}
              onChange={(objective) => setBriefingForm({ ...briefingForm, objective })}
            />
            <SelectionGroup
              label="Momento do funil"
              options={FUNNEL_STAGES}
              value={briefingForm.funnelStage}
              onChange={(funnelStage) => setBriefingForm({ ...briefingForm, funnelStage })}
            />
            <AssetDropzone
              label="Foto do produto (opcional)"
              hint="Solte uma imagem local ou arraste um link de imagem para usar como base."
              value={briefingForm.productImageUrl}
              busy={uploadingField === "product"}
              folder="product-images"
              onBusyChange={(busy) => setUploadingField(busy ? "product" : null)}
              onResolved={async (value) => {
                setBriefingForm((current) => ({ ...current, productImageUrl: value }));
              }}
              onClear={() => setBriefingForm((current) => ({ ...current, productImageUrl: "" }))}
            />
            <AssetDropzone
              label="Anúncio de referência (opcional)"
              hint="Solte uma imagem ou um link de anúncio do cliente ou concorrente."
              value={briefingForm.referenceAdUrl}
              busy={uploadingField === "reference"}
              folder="reference-ads"
              onBusyChange={(busy) => setUploadingField(busy ? "reference" : null)}
              onResolved={async (value) => {
                setBriefingForm((current) => ({ ...current, referenceAdUrl: value }));
              }}
              onClear={() => setBriefingForm((current) => ({ ...current, referenceAdUrl: "" }))}
            />
            <div className="button-row">
              <button
                className="button"
                disabled={pending || !briefingForm.clientId || !briefingForm.productName.trim()}
                onClick={async () => {
                  await postJson("/api/briefings", briefingForm);
                  setBriefingForm((current) => ({
                    ...current,
                    productName: "",
                    productImageUrl: "",
                    referenceAdUrl: ""
                  }));
                  refreshSnapshot();
                }}
              >
                Criar briefing
              </button>
              <button className="button secondary" onClick={() => refreshSnapshot()}>
                Atualizar painel
              </button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="eyebrow">Clientes</div>
            <h2>Base ativa</h2>
            <div className="list">
              {data.clients.length === 0 ? (
                <div className="empty">Nenhum cliente ainda.</div>
              ) : (
                data.clients.map((client) => (
                  <article className="item" key={client.id}>
                    <div className="item-top">
                      <div>
                        <h3>{client.name}</h3>
                        <p>{client.segment || "segmento pendente"}</p>
                      </div>
                      <span className="pill">{client.brandTone || "tom pendente"}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">3. Geração e review</div>
            <h2>Fila viva</h2>
            <div className="list">
              {data.jobs.length === 0 ? (
                <div className="empty">Nenhum job na fila.</div>
              ) : (
                data.jobs.map((job) => {
                  const briefing = data.briefings.find((item) => item.id === job.briefingId);
                  const reviewDraft = reviewDrafts[job.id] ?? { feedback: "", tags: [] };

                  return (
                    <article className="item job-card" key={job.id}>
                      <div className="job-layout">
                        <div className="job-visual">
                          {job.imageUrl ? (
                            <img src={job.imageUrl} alt={briefing?.productName ?? "Anúncio gerado"} />
                          ) : (
                            <div className="job-placeholder">A imagem gerada aparece aqui.</div>
                          )}
                        </div>
                        <div className="job-body">
                          <div className="item-top">
                            <div>
                              <h3>{briefing?.productName ?? "Briefing"}</h3>
                              <p>{job.outputSummary ?? "Sem resumo ainda."}</p>
                            </div>
                            <span
                              className={`pill ${
                                job.status === "approved"
                                  ? "success"
                                  : job.status === "rejected"
                                    ? "danger"
                                    : ""
                              }`}
                            >
                              {job.status}
                            </span>
                          </div>

                          <div className="meta">
                            <span className="pill">{briefing?.platform ?? "plataforma"}</span>
                            <span className="pill">{briefing?.adType ?? "tipo"}</span>
                            <span className="pill">{briefing?.format ?? "formato"}</span>
                            <span className="pill">{briefing?.objective ?? "objetivo"}</span>
                            <span className="pill">{briefing?.funnelStage ?? "funil"}</span>
                            {job.imageModel ? <span className="pill">{job.imageModel}</span> : null}
                          </div>

                          {job.headline || job.subheadline || job.cta || job.angle ? (
                            <div className="copy-grid">
                              {job.headline ? (
                                <div className="copy-block">
                                  <span>Headline</span>
                                  <strong>{job.headline}</strong>
                                </div>
                              ) : null}
                              {job.subheadline ? (
                                <div className="copy-block">
                                  <span>Subheadline</span>
                                  <strong>{job.subheadline}</strong>
                                </div>
                              ) : null}
                              {job.cta ? (
                                <div className="copy-block">
                                  <span>CTA</span>
                                  <strong>{job.cta}</strong>
                                </div>
                              ) : null}
                              {job.angle ? (
                                <div className="copy-block">
                                  <span>Ângulo</span>
                                  <strong>{job.angle}</strong>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="review-box">
                            <textarea
                              placeholder="Feedback rápido para orientar o próximo anúncio."
                              value={reviewDraft.feedback}
                              onChange={(event) => setReviewDraft(job.id, { feedback: event.target.value })}
                            />
                            <TagPicker
                              tags={REVIEW_TAGS}
                              active={reviewDraft.tags}
                              onToggle={(tag) => toggleReviewTag(job.id, tag)}
                            />
                            <div className="button-row">
                              <button
                                className="button"
                                disabled={pending}
                                onClick={async () => {
                                  await submitReview(job.id, "approved");
                                }}
                              >
                                Aprovar
                              </button>
                              <button
                                className="button secondary danger-text"
                                disabled={pending}
                                onClick={async () => {
                                  await submitReview(job.id, "rejected");
                                }}
                              >
                                Reprovar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">Reviews</div>
            <h2>Memória do que funciona</h2>
            <div className="list">
              {data.reviews.length === 0 ? (
                <div className="empty">Nenhum review salvo ainda.</div>
              ) : (
                data.reviews.map((review) => (
                  <article className="item" key={review.id}>
                    <div className="item-top">
                      <div>
                        <h3>{review.status}</h3>
                        <p>{review.feedback || "Sem feedback textual."}</p>
                      </div>
                      <span className={`pill ${review.status === "approved" ? "success" : "danger"}`}>
                        {review.status}
                      </span>
                    </div>
                    <div className="meta">
                      {review.reasonTags.map((tag) => (
                        <span className="pill" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
