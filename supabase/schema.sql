create extension if not exists pgcrypto;

create table if not exists public.email_registrations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ordered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ordered_at timestamptz
);

create table if not exists public.ebook_orders (
  id uuid primary key default gen_random_uuid(),
  email text not null unique references public.email_registrations(email) on delete cascade,
  ebook_asin text not null,
  ebook_title text not null,
  provider_order_id text not null,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.recharge_cards (
  code text primary key,
  status text not null default 'processing' check (status in ('processing', 'redeemed')),
  provider_request_id text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create table if not exists public.bitrefill_purchases (
  id uuid primary key default gen_random_uuid(),
  requested_by_email text,
  amount numeric not null,
  quantity integer not null,
  provider text not null default 'bitrefill',
  invoice jsonb not null,
  product jsonb not null,
  orders jsonb not null,
  redemption_codes jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_registrations_status on public.email_registrations(status);
create index if not exists idx_bitrefill_purchases_requested_by_email on public.bitrefill_purchases(requested_by_email);
