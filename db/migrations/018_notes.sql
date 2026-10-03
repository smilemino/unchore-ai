-- «My notes» (owner «yes» 2026-09-30 15:19): a personal knowledge notebook built from chats, like an Obsidian vault of
-- concept notes. After an answer that settled something, a fast model files it as one note or adds to the note on the
-- same concept; later answers build on it («last time we settled …»). Title, body and tags are stored locked (lib/privacy.ts).
-- Has user_id, so uc_lock_tables() (005) fences it to its owner.
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  tags text not null default '',
  model text,
  source_conversation uuid references conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user on notes(user_id, updated_at desc);
