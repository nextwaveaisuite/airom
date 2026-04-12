-- ============================================
-- Airom — Conversations & Rate Limiting
-- Run this in Supabase SQL Editor
-- ============================================

-- ── CONVERSATIONS ─────────────────────────────────────────────────────────
create table public.conversations (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) on delete cascade not null,
  title       text not null default 'New conversation',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── MESSAGES ──────────────────────────────────────────────────────────────
create table public.messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  credits_used    integer default 0,
  created_at      timestamptz not null default now()
);

-- ── DAILY CREDIT USAGE TRACKING ───────────────────────────────────────────
create table public.daily_usage (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) on delete cascade not null,
  date        date not null default current_date,
  credits_used integer not null default 0,
  messages_sent integer not null default 0,
  unique(user_id, date)
);

-- ── INDEXES ───────────────────────────────────────────────────────────────
create index on public.conversations (user_id, updated_at desc);
create index on public.messages (conversation_id, created_at asc);
create index on public.daily_usage (user_id, date);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.daily_usage   enable row level security;

create policy "Users manage own conversations" on public.conversations for all using (auth.uid() = user_id);
create policy "Users manage own messages"      on public.messages      for all using (auth.uid() = user_id);
create policy "Users view own daily usage"     on public.daily_usage   for all using (auth.uid() = user_id);

create policy "Service role conversations" on public.conversations for all using (auth.role() = 'service_role');
create policy "Service role messages"      on public.messages      for all using (auth.role() = 'service_role');
create policy "Service role daily usage"   on public.daily_usage   for all using (auth.role() = 'service_role');

-- ── UPDATED_AT TRIGGER for conversations ──────────────────────────────────
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ── RPC: track daily usage atomically ─────────────────────────────────────
create or replace function public.track_daily_usage(p_user_id uuid, p_credits integer)
returns table(daily_credits integer, daily_messages integer) as $$
begin
  insert into public.daily_usage (user_id, date, credits_used, messages_sent)
  values (p_user_id, current_date, p_credits, 1)
  on conflict (user_id, date)
  do update set
    credits_used  = daily_usage.credits_used + p_credits,
    messages_sent = daily_usage.messages_sent + 1;

  return query
    select credits_used, messages_sent
    from public.daily_usage
    where user_id = p_user_id and date = current_date;
end;
$$ language plpgsql security definer;

-- ── RPC: get today's usage ─────────────────────────────────────────────────
create or replace function public.get_daily_usage(p_user_id uuid)
returns table(daily_credits integer, daily_messages integer) as $$
  select coalesce(credits_used, 0), coalesce(messages_sent, 0)
  from public.daily_usage
  where user_id = p_user_id and date = current_date;
$$ language sql security definer;
