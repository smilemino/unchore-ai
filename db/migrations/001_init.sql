-- Unchore v0.1 — first schema
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  avatar text,
  google_sub text unique,
  lang text not null default 'en',
  tz text not null default 'Asia/Seoul',
  default_model text,
  notify_email boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user on sessions(user_id);

create table if not exists login_tokens (
  token_hash text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists user_keys (
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  enc text not null,
  hint text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists vault (
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  enc text not null,
  hint text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user on conversations(user_id, updated_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv on messages(conversation_id, created_at);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  propose boolean not null,
  method text not null,
  offer text not null default '',
  status text not null default 'shown',
  created_at timestamptz not null default now()
);
create unique index if not exists proposals_message on proposals(message_id);

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  recipe text not null,
  args jsonb not null default '{}'::jsonb,
  schedule text not null default 'daily@08:00',
  condition jsonb not null default '{"kind":"always"}'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','paused','broken')),
  source_message_id uuid references messages(id) on delete set null,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_value double precision,
  last_line text,
  fail_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists automations_due on automations(status, next_run_at);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  value double precision,
  line text,
  why text,
  notified boolean not null default false
);
create index if not exists runs_automation on runs(automation_id, started_at desc);

create table if not exists waitlist (
  email text primary key,
  lang text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists recipe_health (
  id bigserial primary key,
  recipe text not null,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  detail text
);
create index if not exists recipe_health_recent on recipe_health(recipe, checked_at desc);

create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());
