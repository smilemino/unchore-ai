-- «Unchore can't do that» answers (2026-10-02 owner: a member was told video work can't be done — «what can't be done must be
-- made to work right away, not refused»). lib/gaps.ts: an answer that says it can't, for want of a tool, feature or connection,
-- leaves one row here with a short English name of the missing ability (no names, numbers or other personal details).
-- AI Soul's check (reminder-gates/unchore-gaps) picks up new rows every 30 minutes; the AI there builds the ability, ships it,
-- and calls /api/cron/gap → the member gets a message in that chat that it works now. Has user_id, so uc_lock_tables() (005)
-- fences it to its member. Additive only.
create table if not exists ability_gaps (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  ability text not null,
  lang text,
  model text,
  status text not null default 'new',   -- new · seen (picked up) · built · skip
  note text,                            -- what was built, or why it was skipped
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists ability_gaps_status on ability_gaps(status, created_at);
