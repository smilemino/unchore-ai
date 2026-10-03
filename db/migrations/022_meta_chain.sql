-- Benchmark batch 2026-09-30 (owner «모두 구현»):
-- 1) meta_actions — which «Yes» card (raise a Meta ad set's daily budget) in which answer was done, so each runs once (like google_actions).
create table if not exists meta_actions (
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  idx int not null,
  result text,
  done_at timestamptz not null default now(),
  primary key (message_id, idx)
);
-- 2) Skill chains: an automation can run right after another one succeeds, and gets that result (lib/automation.ts). Null = on its own schedule.
alter table automations add column if not exists after_id uuid references automations(id) on delete set null;
create index if not exists automations_after on automations(after_id) where after_id is not null;
