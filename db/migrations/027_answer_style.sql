-- «How to answer me», learned each night per member (owner 2026-10-02: «every account should learn from what it said»).
-- lib/answer-style.ts: a member whose next message said «simpler, please» or «that's not it» twice or more in a week
-- (at least once yesterday) gets one or two lines in their own memory list, kind 'style', written by a small model on
-- Unchore's account. They show in Settings with the other memories and can be deleted there. Additive, defaults keep old rows.
alter table memories add column if not exists kind text not null default 'fact';
alter table users add column if not exists style_review_at timestamptz;

-- One row per nightly pass (system only — no user_id, so members may add but never read; db/migrations/005).
create table if not exists style_review_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  checked int not null default 0,      -- members whose local night it was and who wrote yesterday
  targeted int not null default 0,     -- of those, members with a repeated «simpler» or «not it»
  wrote int not null default 0,        -- style lines added or updated
  failed int not null default 0,
  cost_micro bigint not null default 0 -- what the small model cost Unchore (USD micro, from OpenRouter's own figure)
);
create index if not exists style_review_runs_time on style_review_runs(ran_at);
