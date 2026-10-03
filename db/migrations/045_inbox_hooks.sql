-- Alerts in (ported from AI Soul's inbox address, 2026-10-02 sync — lib/inbox-hooks.ts): an address per member that their own
-- outside service (a shop, a server, an automation tool) can send a message to; it shows up in the chat the member picked.
-- key_hash: sha256 of the key (the key is shown once). name is locked. win_at/win_n: this hour's count, for the hourly limit.
-- Has user_id, so uc_lock_tables() (005) fences it to its owner. Additive only.
create table if not exists inbox_hooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  key_hash text not null,
  hint text not null,
  conversation_id uuid references conversations(id) on delete set null,
  enabled boolean not null default true,
  per_hour integer not null default 60 check (per_hour between 1 and 600),
  win_at timestamptz not null default now(),
  win_n integer not null default 0,
  last_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inbox_hooks_user on inbox_hooks(user_id, created_at);
