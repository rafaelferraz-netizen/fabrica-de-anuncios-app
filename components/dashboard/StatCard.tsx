"use client";

import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
}

export const StatCard = ({ label, value }: StatCardProps) => (
  <div className="border border-[#d6ccb9] p-4 bg-white/55 transition-all hover:bg-white/80">
    <div className="text-[#6c655c] text-[13px] uppercase tracking-widest">{label}</div>
    <div className="mt-2 text-2xl font-serif">{value}</div>
  </div>
);