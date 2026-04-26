"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Image as ImageIcon, Download, Maximize2, Clock } from 'lucide-react';
import type { GenerationJobRecord, BriefingRecord } from '@/lib/types';

interface JobCardProps {
  job: GenerationJobRecord;
  briefing?: BriefingRecord;
  onReview: (jobId: string, status: "approved" | "rejected") => Promise<void>;
  reviewDraft: { feedback: string; tags: string[] };
  onDraftChange: (jobId: string, next: Partial<{ feedback: string; tags: string[] }>) => void;
  isPending: boolean;
  onZoom: (url: string) => void;
}

const REVIEW_TAGS = ["foco em ROI", "mais agressivo", "clean/v4 style", "copy fraca", "visual premium", "ajuste de cor"];

export const JobCard = ({ 
  job, 
  briefing, 
  onReview, 
  reviewDraft, 
  onDraftChange,
  isPending,
  onZoom
}: JobCardProps) => {
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (job.status === 'running') {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [job.status]);

  const toggleTag = (tag: string) => {
    const active = reviewDraft.tags;
    onDraftChange(job.id, {
      tags: active.includes(tag) ? active.filter((item) => item !== tag) : [...active, tag]
    });
  };

  const handleDownload = async () => {
    if (!job.imageUrl) return;
    const response = await fetch(job.imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `v4-criativo-${job.id}.png`;
    link.click();
  };

  return (
    <article className="border border-[var(--line)] bg-white p-8 mb-8 shadow-sm border-t-4 border-t-[var(--ink)]">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-10">
        <div className="space-y-4">
          <div className="relative aspect-[4/5] bg-[#f8f8f8] border border-[var(--line)] overflow-hidden group">
            {job.imageUrl ? (
              <>
                <img src={job.imageUrl} alt={briefing?.productName} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button onClick={() => onZoom(job.imageUrl!)} className="bg-white p-3 rounded-full text-black hover:bg-[var(--accent)] hover:text-white transition-all shadow-xl">
                    <Maximize2 size={20} />
                  </button>
                  <button onClick={handleDownload} className="bg-white p-3 rounded-full text-black hover:bg-[var(--accent)] hover:text-white transition-all shadow-xl">
                    <Download size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)] p-8 text-center bg-gradient-to-b from-white to-[#f5f5f5]">
                {job.status === 'running' ? (
                  <div className="space-y-4">
                    <div className="relative">
                       <Loader2 className="animate-spin text-[var(--accent)]" size={48} />
                       <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                         {timer}s
                       </div>
                    </div>
                    <div>
                      <div className="text-sm font-bold uppercase tracking-widest text-black">Gerando...</div>
                      <div className="text-[10px] uppercase tracking-tighter opacity-50 mt-1">Estimativa: 25-40s</div>
                    </div>
                    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[var(--accent)] transition-all duration-500" 
                        style={{ width: `${Math.min((timer / 30) * 100, 95)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="mb-3 opacity-20" size={40} />
                    <span className="text-sm font-bold uppercase tracking-widest opacity-50">Fila de Espera</span>
                  </>
                )}
              </div>
            )}
          </div>
          {job.imageUrl && (
            <div className="flex justify-between items-center">
              <button onClick={() => onZoom(job.imageUrl!)} className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] flex items-center gap-2 hover:text-[var(--accent)]">
                <Maximize2 size={12} /> Ampliar
              </button>
              <button onClick={handleDownload} className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] flex items-center gap-2 hover:underline">
                <Download size={12} /> Baixar
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className="eyebrow m-0 text-[var(--accent)]">Performance Output</div>
              <h3 className="text-3xl font-serif font-bold mt-1">{briefing?.productName || "Campanha s/ Nome"}</h3>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`pill font-bold ${job.status === 'approved' ? 'success' : job.status === 'rejected' ? 'danger' : ''}`}>
                {job.status}
              </span>
              {job.status === 'running' && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <Clock size={12} className="animate-pulse" />
                  <span className="text-[10px] font-bold tabular-nums">T-PLUS: {timer}s</span>
                </div>
              )}
            </div>
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
                  <span className="block text-[10px] font-bold uppercase text-[var(--muted)] mb-3 tracking-widest">Headline</span>
                  <strong className="text-xl font-serif leading-tight">{job.headline}</strong>
                </div>
              )}
              {job.cta && (
                <div className="p-5 border-l-2 border-[var(--ink)] bg-[#fcfcfc]">
                  <span className="block text-[10px] font-bold uppercase text-[var(--muted)] mb-3 tracking-widest">CTA</span>
                  <strong className="text-xl font-serif leading-tight">{job.cta}</strong>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto pt-8 border-t border-[var(--line)]">
            <textarea
              className="w-full p-4 text-sm border border-[var(--line)] bg-[#fafafa] focus:border-[var(--accent)] focus:outline-none mb-5 min-h-[120px] font-sans"
              placeholder="Feedback para otimização..."
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
                className="button flex-1 bg-[var(--accent)] hover:bg-[#c11515] disabled:opacity-30"
              >
                Aprovar Criativo
              </button>
              <button
                disabled={isPending || job.status === 'running'}
                onClick={() => onReview(job.id, "rejected")}
                className="button secondary flex-1 disabled:opacity-30"
              >
                Pedir Ajuste
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};