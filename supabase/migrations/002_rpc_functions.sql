-- ============================================
-- Airom — Supabase RPC Functions
-- Run this in Supabase SQL Editor AFTER 001_initial_schema.sql
-- ============================================

-- ── Deduct credits (atomic, floors at 0) ──────────────────────────────────
create or replace function public.deduct_credits(user_id uuid, amount integer)
returns void as $$
begin
  update public.profiles
  set credits = greatest(0, credits - amount)
  where id = user_id;
end;
$$ language plpgsql security definer;

-- ── Add credits (atomic top-up) ───────────────────────────────────────────
create or replace function public.add_credits(user_id uuid, amount integer)
returns void as $$
begin
  update public.profiles
  set credits = credits + amount
  where id = user_id;
end;
$$ language plpgsql security definer;

-- ── Get user credit balance ────────────────────────────────────────────────
create or replace function public.get_credits(user_id uuid)
returns integer as $$
  select credits from public.profiles where id = user_id;
$$ language sql security definer;
