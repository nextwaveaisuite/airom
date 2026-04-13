-- ============================================
-- Airom — Admin Console Support
-- Run this in Supabase SQL Editor
-- ============================================

-- Admin flag on profiles
alter table public.profiles add column if not exists is_admin boolean default false;

-- Allow admins to read all profiles
create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Allow admins to update any profile (credits, plan, ban)
create policy "Admins can update all profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Allow admins to read all transactions
create policy "Admins can view all transactions"
  on public.transactions for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Allow admins to read all daily usage
create policy "Admins can view all daily usage"
  on public.daily_usage for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- RPC: admin stats overview
create or replace function public.get_admin_stats()
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'total_users',    (select count(*) from public.profiles),
    'free_users',     (select count(*) from public.profiles where plan = 'free'),
    'basic_users',    (select count(*) from public.profiles where plan = 'basic'),
    'pro_users',      (select count(*) from public.profiles where plan = 'pro'),
    'max_users',      (select count(*) from public.profiles where plan = 'max'),
    'total_messages', (select count(*) from public.messages),
    'messages_today', (select coalesce(sum(messages_sent),0) from public.daily_usage where date = current_date),
    'credits_used_today', (select coalesce(sum(credits_used),0) from public.daily_usage where date = current_date),
    'new_users_today',(select count(*) from public.profiles where created_at::date = current_date)
  ) into result;
  return result;
end;
$$ language plpgsql security definer;

-- RPC: manually adjust user credits (admin only)
create or replace function public.admin_set_credits(target_user_id uuid, new_credits integer)
returns void as $$
begin
  update public.profiles set credits = new_credits where id = target_user_id;
end;
$$ language plpgsql security definer;

-- RPC: set user plan (admin only)
create or replace function public.admin_set_plan(target_user_id uuid, new_plan text)
returns void as $$
begin
  update public.profiles set plan = new_plan where id = target_user_id;
end;
$$ language plpgsql security definer;
