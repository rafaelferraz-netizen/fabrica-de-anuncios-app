"use client";

import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
}

export const StatCard = ({ label, value }: StatCardProps) => (
  <div className="border border-[var(--line)] p-5 bg-white/50 backdrop-blur-sm">
    <div className="text-[var(--muted)] text-[12px] uppercase tracking-[0.1em] font-sans">{label}</div>
    <div className="mt-2 text-3xl font-serif text-[var(--ink)]">{value}</div>
  </div>
);