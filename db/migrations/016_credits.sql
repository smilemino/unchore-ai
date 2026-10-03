-- Unchore credit (2026-09-30 owner «yes»): members prepay, and AI that runs on Unchore's own account (first: the Defend
-- security analysis) takes what it actually cost from their balance. New members get a small welcome credit; a member
-- who has their own OpenRouter key can use that instead. Amounts are micro-dollars (1 USD = 1,000,000).
-- These three tables are system-only: members never read or write them directly — every change goes through lib/credits.ts
-- on the owner connection (so a missed check in a route can never add money to a balance).
create table if not exists credit_wallets (
  member uuid primary key references users(id) on delete cascade,
  micro bigint not null default 0,
  paid boolean not null default false,          -- has topped up at least once (the welcome-credit day cap no longer applies)
  updated_at timestamptz not null default now()
);
create table if not exists credit_ledger (
  id bigserial primary key,
  member uuid not null references users(id) on delete cascade,
  delta_micro bigint not null,                  -- + welcome/top-up/refund, − use
  kind text not null check (kind in ('welcome', 'topup', 'use', 'refund', 'adjust')),
  cost_micro bigint,                            -- for «use»: what the AI provider charged us (before the margin)
  ref text,                                     -- idempotency: 'welcome', a Stripe checkout id …
  note text,
  created_at timestamptz not null default now(),
  unique (member, ref)
);
create index if not exists credit_ledger_member on credit_ledger(member, created_at desc);
create index if not exists credit_ledger_use_day on credit_ledger(created_at) where kind = 'use';
create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references users(id) on delete cascade,
  hash text not null unique,                    -- sha256 of the token; the token itself is shown once and never stored
  hint text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_tokens_member on api_tokens(member);

-- Member lock again, now with a system-only list (same as 005 otherwise): these tables get no rights at all for members.
create or replace function uc_lock_tables() returns void language plpgsql as $$
declare t text;
begin
  execute 'grant usage, select on all sequences in schema public to unchore_member';
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' order by 1 loop
    if t = 'schema_migrations' then
      continue;
    end if;
    execute format('revoke all on %I from unchore_member', t);
    execute format('drop policy if exists uc_own on %I', t);
    if t in ('credit_wallets', 'credit_ledger', 'api_tokens') then
      null;
    elsif t = 'users' then
      execute 'grant select, update, delete on users to unchore_member';
      execute 'alter table users enable row level security';
      execute 'create policy uc_own on users using (id = uc_me()) with check (id = uc_me())';
    elsif exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('grant select, insert, update, delete on %I to unchore_member', t);
      execute format('alter table %I enable row level security', t);
      execute format('create policy uc_own on %I using (user_id = uc_me()) with check (user_id = uc_me())', t);
    elsif t = 'messages' then
      execute 'grant select, insert, update, delete on messages to unchore_member';
      execute 'alter table messages enable row level security';
      execute 'create policy uc_own on messages using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = uc_me())) with check (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = uc_me()))';
    elsif t = 'runs' then
      execute 'grant select, insert, update, delete on runs to unchore_member';
      execute 'alter table runs enable row level security';
      execute 'create policy uc_own on runs using (exists (select 1 from automations a where a.id = automation_id and a.user_id = uc_me())) with check (exists (select 1 from automations a where a.id = automation_id and a.user_id = uc_me()))';
    else
      execute format('grant insert on %I to unchore_member', t);
    end if;
  end loop;
end $$;

select uc_lock_tables();
