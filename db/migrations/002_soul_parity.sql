-- Soul parity 1: projects, pins, per-chat model, personal rules, memory, files, reminders.
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  instructions text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists projects_user on projects(user_id, sort);

alter table conversations add column if not exists project_id uuid references projects(id) on delete set null;
alter table conversations add column if not exists pinned boolean not null default false;
alter table conversations add column if not exists model text;
alter table conversations add column if not exists effort text;
alter table conversations add column if not exists done boolean not null default false;
alter table conversations add column if not exists titled boolean not null default false;
create index if not exists conversations_project on conversations(project_id);

alter table users add column if not exists instructions text not null default '';
alter table users add column if not exists memory_on boolean not null default true;
alter table users add column if not exists web_search boolean not null default true;
alter table users add column if not exists theme text not null default 'auto';

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  source_conversation uuid references conversations(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists memories_user on memories(user_id, created_at desc);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  name text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  text_extract text,
  made boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists files_conv on files(conversation_id, created_at);
create index if not exists files_msg on files(message_id);

-- Reminders reuse automations: recipe = 'prompt', args = {prompt, conversationId}; schedule may be once@<iso>.
alter table automations add column if not exists ends_at timestamptz;
alter table automations drop constraint if exists automations_status_check;
alter table automations add constraint automations_status_check check (status in ('draft','active','paused','broken','done'));
