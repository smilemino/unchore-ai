-- Calls → requests (AI Soul call intake, owner «yes» 2026-10-02 21:40 — lib/call-intake.ts). Off by default: call_intake_at is
-- when the member turned it on after the consent tick (null = off). call_intake_since: calls from then on («yesterday 00:00» the
-- first time). call_imports keeps one row a recording: its words (locked, lib/privacy.ts), never the sound — the file is deleted
-- right after its words are read. seconds count toward the member's 60 minutes a day. Has user_id, so uc_lock_tables() (005)
-- fences it to its owner. Additive only.
alter table users add column if not exists call_intake_at timestamptz;
alter table users add column if not exists call_intake_since text;
create table if not exists call_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  who text not null default '',
  called_at text,
  seconds int not null default 0,
  words text,
  state text not null default 'hearing',
  note_id uuid references notes(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists call_imports_user on call_imports(user_id, state, created_at);
