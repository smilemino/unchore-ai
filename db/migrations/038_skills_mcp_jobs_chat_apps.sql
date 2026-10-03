-- What Claude Code, Codex and Hermes Agent do, in Unchore itself (owner 2026-10-02: «Unchore has to do all that Claude Code,
-- Codex and Hermes do» — approved the same night: only services the member connects and allows; each member's skills and
-- connections kept apart; nothing billed by Unchore). Every table has user_id, so the member lock fences it (005_member_lock.sql).

-- Skills: how-to recipes the AI writes from finished work and reads next time (lib/skills.ts). name/description/body are locked.
create table if not exists member_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  description text not null,
  body text not null,
  uses integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- MCP servers the member picked (lib/mcp-client.ts): an address, and how to sign in to it — locked (a key, or the tokens an
-- «Authorize» page gave). oauth_state: sha256 of the one-time state while the member is on that page.
create table if not exists mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  url text not null,
  auth text,
  oauth_state text unique,
  tools jsonb not null default '[]'::jsonb,
  last_ok_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- Background jobs (lib/bg-jobs.ts): one question answered in its own chat while the member keeps going; when it ends, a note
-- goes back into the chat that started it. prompt/title are locked.
create table if not exists bg_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  parent_conversation_id uuid not null references conversations(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'stopped')),
  note text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists bg_jobs_user on bg_jobs(user_id, created_at desc);
create index if not exists bg_jobs_open on bg_jobs(status, created_at) where status in ('queued', 'running');

-- Slack and Discord on the member's own app (lib/chat-apps.ts). secrets: locked JSON (bot token, signing secret / public key).
-- owner_ref: the one Slack or Discord user who may talk to it (set by sending the pairing code once).
create table if not exists chat_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('slack', 'discord')),
  secrets text,
  app_ref text,
  owner_ref text,
  pair_code text,
  conversation_id uuid references conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
