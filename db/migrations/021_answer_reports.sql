-- «Report» under an AI answer (Google Play generative-AI rule: people must be able to flag offensive AI output inside the app).
-- One row per report; the answer text is kept locked (lib/privacy.ts) so it can be reviewed even if the chat is deleted later.
-- Has user_id, so uc_lock_tables() (005) fences it to its owner.
create table if not exists answer_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid,
  reason text not null,                -- harmful · false · other
  note text,                           -- locked
  answer text,                         -- locked copy of the answer
  model text,
  created_at timestamptz not null default now()
);
create index if not exists answer_reports_day on answer_reports(created_at desc);
