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
  "genérico",
  "sem cara da marca",
  "produto fraco",
  "composição ruim",
  "mais clean",
  "mais agressivo"
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
    <article className="border border-[var(--line)] bg-[var(--panel)] p-6 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        <div className="space-y-4">
          <div className="relative aspect-[4/5] bg-white border border-[var(--line)] overflow-hidden">
            {job.imageUrl ? (
              <img src={job.imageUrl} alt={briefing?.productName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)] p-8 text-center italic">
                {job.status === 'running' ? <Loader2 className="animate-spin mb-2" /> : <ImageIcon className="mb-2 opacity-20" />}
                <span className="text-sm">Aguardando geração visual...</span>
              </div>
            )}
          </div>
          {job.imageUrl && (
            <a href={job.imageUrl} target="_blank" rel="noreferrer" className="text-[11px] uppercase tracking-widest text-[var(--muted)] flex items-center gap-2 hover:text-[var(--ink)]">
              <ExternalLink size={12} /> Ver em alta resolução
            </a>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-1">Resultado da Geração</div>
              <h3 className="text-2xl font-serif">{briefing?.productName || "Sem Nome"}</h3>
            </div>
            <span className={`pill ${job.status === 'approved' ? 'success' : job.status === 'rejected' ? 'danger' : ''}`}>
              {job.status}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {[briefing?.platform, briefing?.adType, briefing?.format, briefing?.objective].filter(Boolean).map((meta, i) => (
              <span key={i} className="pill">{meta}</span>
            ))}
          </div>

          {(job.headline || job.cta) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {job.headline && (
                <div className="p-4 border border-[var(--line)] bg-white/40">
                  <span className="block text-[10px] uppercase text-[var(--muted)] mb-2">Headline</span>
                  <strong className="text-lg font-serif leading-tight">{job.headline}</strong>
                </div>
              )}
              {job.cta && (
                <div className="p-4 border border-[var(--line)] bg-white/40">
                  <span className="block text-[10px] uppercase text-[var(--muted)] mb-2">Chamada (CTA)</span>
                  <strong className="text-lg font-serif leading-tight">{job.cta}</strong>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto pt-6 border-t border-[var(--line)]">
            <textarea
              className="w-full p-4 text-sm border border-[var(--line)] bg-white/80 focus:outline-none mb-4 min-h-[100px] font-serif italic"
              placeholder="Notas para o motor criativo..."
              value={reviewDraft.feedback}
              onChange={(e) => onDraftChange(job.id, { feedback: e.target.value })}
            />
            <div className="flex flex-wrap gap-2 mb-6">
              {REVIEW_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`choice text-[12px] ${reviewDraft.tags.includes(tag) ? 'active' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button
                disabled={isPending || job.status === 'running'}
                onClick={() => onReview(job.id, "approved")}
                className="button flex-1"
              >
                Aprovar Design
              </button>
              <button
                disabled={isPending || job.status === 'running'}
                onClick={() => onReview(job.id, "rejected")}
                className="button secondary danger-text flex-1"
              >
                Reprovar e Ajustar
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};