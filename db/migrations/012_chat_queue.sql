-- Batch 19 (owner «yes» 2026-09-30 08:55): messages typed while an answer is being written wait here, not only on the screen
-- (AI Soul lib/server/queue.ts). Closing the window keeps them; the next free moment sends them — the screen if it's open,
-- else the minute timer. held = stopped with ■: kept, sent only when the member presses «Send».
create table if not exists chat_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  text text not null,
  file_ids uuid[] not null default '{}',
  held boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_queue_conv on chat_queue(conversation_id, created_at);
create index if not exists chat_queue_due on chat_queue(held, created_at);
