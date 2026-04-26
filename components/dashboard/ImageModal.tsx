"use client";

import React from 'react';
import { X, Download } from 'lucide-react';

interface ImageModalProps {
  url: string;
  onClose: () => void;
}

export const ImageModal = ({ url, onClose }: ImageModalProps) => {
  const handleDownload = async () => {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `criativo-v4-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200">
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 text-white hover:text-[var(--accent)] transition-colors"
      >
        <X size={32} />
      </button>
      
      <div className="relative max-w-5xl w-full flex flex-col items-center">
        <img 
          src={url} 
          alt="Visualização Ampliada" 
          className="max-h-[85vh] object-contain shadow-2xl border border-white/10"
        />
        
        <button 
          onClick={handleDownload}
          className="mt-6 flex items-center gap-2 bg-white text-black px-8 py-3 font-bold uppercase tracking-widest hover:bg-[var(--accent)] hover:text-white transition-all"
        >
          <Download size={20} /> Baixar Criativo
        </button>
      </div>
    </div>
  );
};