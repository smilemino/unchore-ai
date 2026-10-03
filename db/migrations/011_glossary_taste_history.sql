-- Batch 18 (owner «yes» 2026-09-30 08:55): personal glossary, taste memory, earlier versions of «My instructions», memory history.
-- Texts are stored locked (lib/privacy.ts), like chats and memories.
create table if not exists glossary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  avoid text not null,
  use_word text not null,
  created_at timestamptz not null default now()
);
create index if not exists glossary_user on glossary(user_id, created_at);

-- A yes/no the member gave to a question the AI asked (lib/taste.ts): words of the question lean «yes» or «no», fading 5% a week.
create table if not exists taste_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question text not null,
  yes boolean not null,
  tags text not null,
  created_at timestamptz not null default now()
);
create index if not exists taste_votes_user on taste_votes(user_id, created_at desc);

create table if not exists rules_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists rules_history_user on rules_history(user_id, created_at desc);

-- What was noted, changed or dropped in memory, when, from which chat, by whom (ai | you).
create table if not exists memory_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  memory_id uuid,
  action text not null check (action in ('added','updated','removed')),
  text text not null,
  by_ai boolean not null default false,
  conversation_id uuid references conversations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists memory_log_user on memory_log(user_id, created_at desc);
