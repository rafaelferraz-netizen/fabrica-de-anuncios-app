"use client";

import React from 'react';
import { Loader2, ExternalLink, Image as ImageIcon } from 'lucide-react';
import type { GenerationJobRecord, BriefingRecord } from '@/lib/types';

interface JobCardProps {
  job: GenerationJobRecord;
  briefing?: BriefingRecord;
  onReview: (jobId: string, status: "approved" | "rejected") => Promise<void>;
  reviewDraft: { feedback: string; tags: string[] };
  onDraftChange: (jobId: string, next: Partial<{ feedback: string; tags: string[] }>) => void;
  isPending: boolean;
}

const REVIEW_TAGS = [
  "foco em ROI",
  "mais agressivo",
  "clean/v4 style",
  "copy fraca",
  "visual premium",
  "ajuste de cor"
];

export const JobCard = ({ 
  job, 
  briefing, 
  onReview, 
  reviewDraft, 
  onDraftChange,
  isPending 
}: JobCardProps) => {
  const toggleTag = (tag: string) => {
    const active = reviewDraft.tags;
    onDraftChange(job.id, {
      tags: active.includes(tag) ? active.filter((item) => item !== tag) : [...active, tag]
    });
  };

  return (
    <article className="border border-[var(--line)] bg-white p-8 mb-8 shadow-sm border-t-4 border-t-[var(--ink)]">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-10">
        <div className="space-y-4">
          <div className="relative aspect-[4/5] bg-[#f8f8f8] border border-[var(--line)] overflow-hidden">
            {job.imageUrl ? (
              <img src={job.imageUrl} alt={briefing?.productName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)] p-8 text-center">
                {job.status === 'running' ? <Loader2 className="animate-spin mb-3 text-[var(--accent)]" /> : <ImageIcon className="mb-3 opacity-20" size={40} />}
                <span className="text-sm font-bold uppercase tracking-widest opacity-50">Processando Criativo</span>
              </div>
            )}
          </div>
          {job.imageUrl && (
            <a href={job.imageUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] flex items-center gap-2 hover:text-[var(--accent)] transition-colors">
              <ExternalLink size={12} /> Abrir em nova aba
            </a>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className="eyebrow m-0 text-[var(--accent)]">Performance Output</div>
              <h3 className="text-3xl font-serif font-bold mt-1">{briefing?.productName || "Campanha s/ Nome"}</h3>
            </div>
            <span className={`pill font-bold ${job.status === 'approved' ? 'success' : job.status === 'rejected' ? 'danger' : ''}`}>
              {job.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {[briefing?.platform, briefing?.adType, briefing?.format, briefing?.objective].filter(Boolean).map((meta, i) => (
              <span key={i} className="pill bg-[#f5f5f5]">{meta}</span>
            ))}
          </div>

          {(job.headline || job.cta) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
              {job.headline && (
                <div className="p-5 border-l-2 border-[var(--accent)] bg-[#fcfcfc]">
                  <span className="block text-[10px] font-bold uppercase text-[var(--muted)] mb-3 tracking-widest">Headline de Impacto</span>
                  <strong className="text-xl font-serif leading-tight">{job.headline}</strong>
                </div>
              )}
              {job.cta && (
                <div className="p-5 border-l-2 border-[var(--ink)] bg-[#fcfcfc]">
                  <span className="block text-[10px] font-bold uppercase text-[var(--muted)] mb-3 tracking-widest">Botão de Ação (CTA)</span>
                  <strong className="text-xl font-serif leading-tight">{job.cta}</strong>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto pt-8 border-t border-[var(--line)]">
            <textarea
              className="w-full p-4 text-sm border border-[var(--line)] bg-[#fafafa] focus:border-[var(--accent)] focus:outline-none mb-5 min-h-[120px] font-sans"
              placeholder="Descreva os ajustes necessários para otimizar o ROI..."
              value={reviewDraft.feedback}
              onChange={(e) => onDraftChange(job.id, { feedback: e.target.value })}
            />
            <div className="flex flex-wrap gap-2 mb-8">
              {REVIEW_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`choice text-[11px] font-bold uppercase tracking-tight ${reviewDraft.tags.includes(tag) ? 'active' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button
                disabled={isPending || job.status === 'running'}
                onClick={() => onReview(job.id, "approved")}
                className="button flex-1 bg-[var(--accent)] hover:bg-[#c11515]"
              >
                Aprovar para Veiculação
              </button>
              <button
                disabled={isPending || job.status === 'running'}
                onClick={() => onReview(job.id, "rejected")}
                className="button secondary flex-1"
              >
                Solicitar Nova Versão
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};