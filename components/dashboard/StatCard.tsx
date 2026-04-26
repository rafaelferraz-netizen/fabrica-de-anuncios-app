"use client";

import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
}

export const StatCard = ({ label, value }: StatCardProps) => (
  <div className="border border-[var(--line)] p-6 bg-white shadow-sm">
    <div className="text-[var(--muted)] text-[10px] uppercase tracking-[0.2em] font-bold">{label}</div>
    <div className="mt-2 text-3xl font-bold text-[var(--accent)]">{value}</div>
  </div>
);