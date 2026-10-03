-- Images and videos made on the member's OWN Higgsfield account (vault HIGGSFIELD_KEY) after they pressed «Yes» on a card in the
-- answer (lib/higgsfield.ts, owner 2026-10-02: a member asks for a video → made on their Higgsfield account). One row per card, so each
-- card is made once; the minute tick (app/api/cron/tick) asks Higgsfield until it's done and then tells the member.
create table if not exists hf_jobs (
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  idx int not null,
  request_id text,
  model text not null,
  usd numeric(10,4),
  status text not null default 'sent',   -- sent | done | failed
  url text,
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (message_id, idx)
);
create index if not exists hf_jobs_open on hf_jobs(created_at) where status = 'sent';
