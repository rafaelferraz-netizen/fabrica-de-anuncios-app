create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default '',
  brand_tone text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  product_name text not null,
  platform text not null default '',
  format text not null default '',
  ad_type text not null check (ad_type in ('static', 'carousel')),
  objective text not null default '',
  funnel_stage text not null default '',
  product_image_url text,
  reference_ad_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'approved', 'rejected')),
  output_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  status text not null check (status in ('approved', 'rejected')),
  feedback text not null default '',
  reason_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
