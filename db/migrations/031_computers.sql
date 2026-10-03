-- «Connect your computer» (owner 2026-10-02: «everything I do in AI Soul has to work with Unchore's own features»).
-- A member runs one small program on their own computer or server (public/unchore-computer.mjs). It asks Unchore for work,
-- runs the member's own Claude Code there (their files, their tools, their sign-in) and sends the answer back into the chat.
-- Picked like an AI: «🖥 <name>» in the chat's or the project's AI list (model id «computer:<id>»). Unchore never opens a
-- connection into the computer — the computer always calls out. Only the token's sha256 is kept; the token is shown once.
create table if not exists computers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  hint text not null,
  info jsonb not null default '{}'::jsonb,   -- what the program says about itself: system, Claude Code version, folder
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index if not exists computers_user on computers(user_id) where revoked_at is null;

-- One piece of work for a computer: the question (and what the AI should know), the answer as it grows, and how it ended.
-- prompt, system, out and note are chat text — locked like messages (lib/privacy.ts).
create table if not exists computer_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  computer_id uuid not null references computers(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  question_id uuid references messages(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'stopped')),
  prompt text not null,
  system text not null default '',
  out text not null default '',
  note text,
  session text,                                 -- the computer's Claude Code session, so the next question in the chat continues it
  deferred boolean not null default false,      -- the chat's answer ended before this did: the result arrives later as its own message
  stop boolean not null default false,          -- ■ Stop: the program sees it on its next report and stops Claude Code
  message_id uuid references messages(id) on delete set null,
  file_ids uuid[] not null default '{}',        -- what the member attached to the question: the program fetches them onto the computer
  made_ids uuid[] not null default '{}',        -- files the computer sent back ([[attach: …]]): put on the answer's message
  created_at timestamptz not null default now(),
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz
);
create index if not exists computer_jobs_next on computer_jobs(computer_id, status, created_at);
create index if not exists computer_jobs_conv on computer_jobs(conversation_id, created_at desc);
