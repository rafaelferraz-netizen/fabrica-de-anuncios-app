"use client";

import React from 'react';
import { CheckCircle, XCircle, Loader2, ExternalLink, Image as ImageIcon, Type, Target } from 'lucide-react';
import type { GenerationJobRecord, BriefingRecord } from '@/lib/types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  "não conversa com o público",
  "composição ruim",
  "quero algo mais clean",
  "quero algo mais agressivo"
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
    <article className="border border-[#d6ccb9] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <div className="relative group">
          {job.imageUrl ? (
            <div className="relative aspect-[4/5] overflow-hidden border border-[#d6ccb9]">
              <img 
                src={job.imageUrl} 
                alt={briefing?.productName} 
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <a href={job.imageUrl} target="_blank" rel="noreferrer" className="text-white flex items-center gap-2 bg-black/60 px-3 py-2 rounded-full text-sm">
                  <ExternalLink size={16} /> Ver original
                </a>
              </div>
            </div>
          ) : (
            <div className="aspect-[4/5] bg-[#fffaf3] border border-[#d6ccb9] flex flex-col items-center justify-center text-[#6c655c] p-6 text-center">
              {job.status === 'running' ? (
                <>
                  <Loader2 className="animate-spin mb-3" size={32} />
                  <p className="text-sm font-medium">Gerando anúncio...</p>
                </>
              ) : (
                <>
                  <ImageIcon className="mb-3 opacity-40" size={32} />
                  <p className="text-sm">Aguardando geração</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-serif font-semibold">{briefing?.productName || "Novo Job"}</h3>
              <p className="text-[#6c655c] text-sm mt-1">{job.outputSummary || "Briefing enviado para processamento."}</p>
            </div>
            <div className={cn(
              "px-3 py-1 text-[11px] uppercase tracking-wider font-bold rounded-full border",
              job.status === 'approved' && "bg-green-50 text-[#1e7a4d] border-[#1e7a4d]/30",
              job.status === 'rejected' && "bg-red-50 text-[#b74332] border-[#b74332]/30",
              job.status === 'running' && "bg-amber-50 text-amber-700 border-amber-700/30",
              job.status === 'queued' && "bg-gray-50 text-gray-600 border-gray-300"
            )}>
              {job.status}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[briefing?.platform, briefing?.adType, briefing?.format, briefing?.objective].filter(Boolean).map((meta, i) => (
              <span key={i} className="text-[10px] uppercase tracking-tight px-2 py-1 bg-[#f3efe7] border border-[#d6ccb9] text-[#6c655c]">
                {meta}
              </span>
            ))}
            {job.imageModel && (
              <span className="text-[10px] uppercase tracking-tight px-2 py-1 bg-[#1e1d1a] text-white">
                {job.imageModel}
              </span>
            )}
          </div>

          {(job.headline || job.subheadline || job.cta) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#fffaf3] p-3 border border-[#d6ccb9]">
              {job.headline && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-[#6c655c] flex items-center gap-1"><Type size={12} /> Headline</span>
                  <p className="text-sm font-bold leading-tight">{job.headline}</p>
                </div>
              )}
              {job.cta && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-[#6c655c] flex items-center gap-1"><Target size={12} /> CTA</span>
                  <p className="text-sm font-bold leading-tight">{job.cta}</p>
                </div>
              )}
            </div>
          )}

          {job.status === 'running' || job.status === 'queued' ? (
            <div className="mt-auto pt-4 border-t border-[#d6ccb9] flex items-center gap-3 text-[#6c655c] italic text-sm">
              <Loader2 className="animate-spin" size={16} /> 
              O motor de IA está trabalhando na sua peça...
            </div>
          ) : (
            <div className="mt-auto space-y-4 pt-4 border-t border-[#d6ccb9]">
              <div className="space-y-3">
                <textarea
                  className="w-full p-3 text-sm border border-[#d6ccb9] focus:ring-1 focus:ring-[#1e1d1a] outline-none min-h-[80px] bg-[#fdfcfb]"
                  placeholder="Feedback para o motor criativo (ex: cores mais frias, fonte maior...)"
                  value={reviewDraft.feedback}
                  onChange={(e) => onDraftChange(job.id, { feedback: e.target.value })}
                />
                <div className="flex flex-wrap gap-2">
                  {REVIEW_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "px-3 py-1.5 text-xs border transition-colors",
                        reviewDraft.tags.includes(tag) 
                          ? "bg-[#1e1d1a] text-white border-[#1e1d1a]" 
                          : "bg-white text-[#6c655c] border-[#d6ccb9] hover:bg-[#f3efe7]"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  disabled={isPending}
                  onClick={() => onReview(job.id, "approved")}
                  className="flex-1 bg-[#1e7a4d] hover:bg-[#165a39] text-white py-3 px-4 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={18} /> Aprovar Peça
                </button>
                <button
                  disabled={isPending}
                  onClick={() => onReview(job.id, "rejected")}
                  className="flex-1 bg-white border border-[#b74332] text-[#b74332] hover:bg-red-50 py-3 px-4 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <XCircle size={18} /> Reprovar / Tentar Novo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};