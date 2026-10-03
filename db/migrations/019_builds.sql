-- «Build me an app» (owner «yes» 2026-09-30 21:11 — on for every member; tell the owner when a day passes ₩100,000).
-- An answer that ends with <<<build {…}>>> queues one row here; lib/build.ts has the member's own AI write the files,
-- checks and builds them in a throwaway Vercel Sandbox, and puts the result online as its own Vercel project.
-- Has user_id, so uc_lock_tables() (005) fences it to its owner. The spec is stored locked (lib/privacy.ts).
create table if not exists builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null,
  spec text not null,
  status text not null default 'queued',          -- queued · running · done · failed · refused
  model text,
  url text,
  vercel_project text,
  rounds int not null default 0,
  sandbox_ms int not null default 0,
  cost_micro bigint not null default 0,           -- what the sandbox cost Unchore (USD micro, an upper estimate)
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists builds_user_day on builds(user_id, created_at desc);
create index if not exists builds_status on builds(status, created_at);

-- One owner alert per Korean day when the house spend passes the line (lib/build.ts spendAlert). System-only.
create table if not exists spend_alerts (
  day date primary key,
  krw bigint not null,
  sent_at timestamptz not null default now()
);
