-- Chat privacy: «Help improve Unchore» switch (on by default, users can turn it off in Settings),
-- a scrubbed and locked improvement copy with no user id, and content-free usage events for everyone.
alter table users add column if not exists improve boolean not null default true;

create table if not exists improve_samples (
  id bigserial primary key,
  thread text not null,
  lang text,
  model text,
  question text not null,
  answer text not null,
  ok boolean,
  created_at timestamptz not null default now()
);
create index if not exists improve_samples_time on improve_samples(created_at);

create table if not exists usage_events (
  id bigserial primary key,
  user_ref text not null,
  kind text not null,
  model text,
  ms int,
  ok boolean,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_time on usage_events(created_at);
create index if not exists usage_events_kind on usage_events(kind, created_at);
