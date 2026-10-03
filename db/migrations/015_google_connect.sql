-- Batch 21 (owner «yes» 2026-09-30 08:55): the member's own Google account — Calendar, Gmail, Drive (AI Soul components/Connectors.tsx).
-- Tokens are stored locked (lib/privacy.ts). An action the AI proposes (add an event, send a mail) runs only after the member's «Yes»,
-- once: google_actions remembers which proposal in which answer was done.
create table if not exists connections (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  email text,
  scopes text not null default '',
  refresh text,
  access text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
create table if not exists google_actions (
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  idx int not null,
  result text,
  done_at timestamptz not null default now(),
  primary key (message_id, idx)
);
