"use client";

import { useState, useTransition } from "react";

import type { DashboardSnapshot } from "@/lib/types";

type Props = {
  initialData: DashboardSnapshot;
};

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

export function Dashboard({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [pending, startTransition] = useTransition();
  const [clientForm, setClientForm] = useState({
    name: "",
    segment: "",
    brandTone: ""
  });
  const [briefingForm, setBriefingForm] = useState({
    clientId: initialData.clients[0]?.id ?? "",
    productName: "",
    platform: "Instagram",
    format: "4:5 (1080x1350px)",
    adType: "static",
    objective: "",
    funnelStage: "",
    productImageUrl: "",
    referenceAdUrl: ""
  });
  const [reviewForm, setReviewForm] = useState({
    jobId: initialData.jobs[0]?.id ?? "",
    status: "approved",
    feedback: "",
    reasonTags: ""
  });

  function refreshSnapshot() {
    startTransition(async () => {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const nextData = (await response.json()) as DashboardSnapshot;
      setData(nextData);
      setBriefingForm((current) => ({
        ...current,
        clientId: nextData.clients[0]?.id ?? current.clientId
      }));
      setReviewForm((current) => ({
        ...current,
        jobId: nextData.jobs[0]?.id ?? current.jobId
      }));
    });
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <div>
          <div className="eyebrow">Fábrica de Anúncios</div>
          <h1>Do briefing à aprovação, num app pronto para GitHub, Vercel e Supabase.</h1>
          <p>
            Esta base já organiza clientes, briefings, fila de geração e reviews. O motor Python
            atual continua preservado no repositório e pode ser conectado à fila de jobs na próxima
            etapa.
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
              />
            </div>
            <div className="field">
              <label>Segmento</label>
              <input
                value={clientForm.segment}
                onChange={(event) => setClientForm({ ...clientForm, segment: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Tom da marca</label>
              <input
                value={clientForm.brandTone}
                onChange={(event) => setClientForm({ ...clientForm, brandTone: event.target.value })}
              />
            </div>
            <div className="button-row">
              <button
                className="button"
                disabled={pending}
                onClick={async () => {
                  await postJson("/api/clients", clientForm);
                  setClientForm({ name: "", segment: "", brandTone: "" });
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
              />
            </div>
            <div className="field">
              <label>Plataforma</label>
              <input
                value={briefingForm.platform}
                onChange={(event) => setBriefingForm({ ...briefingForm, platform: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Formato</label>
              <input
                value={briefingForm.format}
                onChange={(event) => setBriefingForm({ ...briefingForm, format: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Tipo</label>
              <select
                value={briefingForm.adType}
                onChange={(event) =>
                  setBriefingForm({
                    ...briefingForm,
                    adType: event.target.value as "static" | "carousel"
                  })
                }
              >
                <option value="static">Static</option>
                <option value="carousel">Carousel</option>
              </select>
            </div>
            <div className="field">
              <label>Objetivo</label>
              <input
                value={briefingForm.objective}
                onChange={(event) => setBriefingForm({ ...briefingForm, objective: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Funil</label>
              <input
                value={briefingForm.funnelStage}
                onChange={(event) => setBriefingForm({ ...briefingForm, funnelStage: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Foto do produto (opcional)</label>
              <input
                value={briefingForm.productImageUrl}
                onChange={(event) =>
                  setBriefingForm({ ...briefingForm, productImageUrl: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Anúncio de referência (opcional)</label>
              <input
                value={briefingForm.referenceAdUrl}
                onChange={(event) =>
                  setBriefingForm({ ...briefingForm, referenceAdUrl: event.target.value })
                }
              />
            </div>
            <div className="button-row">
              <button
                className="button"
                disabled={pending}
                onClick={async () => {
                  await postJson("/api/briefings", briefingForm);
                  setBriefingForm({
                    ...briefingForm,
                    productName: "",
                    objective: "",
                    funnelStage: "",
                    productImageUrl: "",
                    referenceAdUrl: ""
                  });
                  refreshSnapshot();
                }}
              >
                Criar briefing
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">3. Review</div>
            <h2>Aprovar ou reprovar</h2>
            <div className="field">
              <label>Job</label>
              <select
                value={reviewForm.jobId}
                onChange={(event) => setReviewForm({ ...reviewForm, jobId: event.target.value })}
              >
                <option value="">Selecione</option>
                {data.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.id.slice(0, 8)} · {job.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select
                value={reviewForm.status}
                onChange={(event) =>
                  setReviewForm({
                    ...reviewForm,
                    status: event.target.value as "approved" | "rejected"
                  })
                }
              >
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
            <div className="field">
              <label>Feedback</label>
              <textarea
                value={reviewForm.feedback}
                onChange={(event) => setReviewForm({ ...reviewForm, feedback: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Tags</label>
              <input
                value={reviewForm.reasonTags}
                onChange={(event) => setReviewForm({ ...reviewForm, reasonTags: event.target.value })}
              />
            </div>
            <div className="button-row">
              <button
                className="button"
                disabled={pending}
                onClick={async () => {
                  await postJson("/api/reviews", {
                    ...reviewForm,
                    reasonTags: reviewForm.reasonTags
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  });
                  setReviewForm({ ...reviewForm, feedback: "", reasonTags: "" });
                  refreshSnapshot();
                }}
              >
                Salvar review
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
            <div className="eyebrow">Briefings e fila</div>
            <h2>Operação</h2>
            <div className="list">
              {data.jobs.length === 0 ? (
                <div className="empty">Nenhum job na fila.</div>
              ) : (
                data.jobs.map((job) => {
                  const briefing = data.briefings.find((item) => item.id === job.briefingId);
                  return (
                    <article className="item" key={job.id}>
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
                        {briefing?.productImageUrl ? <span className="pill">com foto</span> : null}
                        {briefing?.referenceAdUrl ? <span className="pill">com referência</span> : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">Reviews</div>
            <h2>Aprendizado</h2>
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

          <div className="footer-note">
            Esta UI já está pronta para subir no GitHub e conectar à Vercel. Com Supabase configurado,
            o modo sai de demo e passa a persistir em Postgres.
          </div>
        </div>
      </div>
    </div>
  );
}
