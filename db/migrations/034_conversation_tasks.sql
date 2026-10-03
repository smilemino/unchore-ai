-- Tasks inside one chat (AI Soul 0017/0018 · owner 2026-10-02 «move everything that helps members»): a member hands several jobs to
-- one chat; the AI ends its answer with a <<<tasks>>> block and lib/conv-tasks-db.ts copies each line here. While a task is left,
-- the chat is not marked done (by [done] or the 30-minute tidy), and the bar above the input shows «3 tasks · 2 done» with each
-- task's history, «Tell the AI about this task only» and «Drop this task». title, note and body are chat text — locked like
-- messages (lib/privacy.ts). Both have user_id, so uc_lock_tables() (005, run by scripts/migrate.mjs) fences them. Additive only.
create table if not exists conversation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  task_key text not null,             -- the AI's short name (t1, t2 …), one per chat
  title text not null,
  status text not null default 'open' check (status in ('open', 'doing', 'waiting', 'done', 'failed', 'dropped')),
  note text,                          -- the last progress or result line
  instr_rev integer not null default 1,   -- +1 each time the member says something about this task
  origin_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, task_key)
);
create index if not exists conversation_tasks_conv on conversation_tasks(conversation_id, created_at);
create table if not exists conversation_task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references conversation_tasks(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'instruct', 'drop', 'refused')),
  by_who text not null check (by_who in ('ai', 'member', 'system')),
  status text,                        -- the task's status after this
  body text,                          -- progress line · what the member said · why a line was not taken
  rev integer,
  message_id uuid,                    -- the answer that wrote it
  created_at timestamptz not null default now()
);
create index if not exists conversation_task_events_task on conversation_task_events(task_id, created_at);
create index if not exists conversation_task_events_conv on conversation_task_events(conversation_id, kind);
