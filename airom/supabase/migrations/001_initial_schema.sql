-- ============================================
-- Airom — Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES ──────────────────────────────────
-- Extends Supabase auth.users with app-specific data
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text,
  plan        text not null default 'free'
                check (plan in ('free','basic','pro','max')),
  credits     integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── TRANSACTIONS ──────────────────────────────
-- Logs every credit purchase and usage
create table public.transactions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.profiles(id) on delete cascade not null,
  type            text not null check (type in ('purchase','usage','refund')),
  credits_delta   integer not null,
  amount_cents    integer default 0,
  stripe_session  text,
  description     text,
  created_at      timestamptz not null default now()
);

-- ── ROW LEVEL SECURITY ────────────────────────
alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;

-- Profiles: users can only read/update their own row
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Transactions: users can only view their own
create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

-- Service role can do everything (used by Netlify functions)
create policy "Service role full access to profiles"
  on public.profiles for all
  using (auth.role() = 'service_role');

create policy "Service role full access to transactions"
  on public.transactions for all
  using (auth.role() = 'service_role');

-- ── INDEXES ───────────────────────────────────
create index on public.transactions (user_id, created_at desc);
create index on public.profiles (plan);

-- ── UPDATED_AT TRIGGER ────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
