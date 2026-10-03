-- Batch 20 (owner «yes» 2026-09-30 08:55): files over 4 MB (AI Soul components/chunk-upload.ts). Vercel takes at most 4.5 MB per
-- request, so the browser sends pieces of 3.5 MB; the last call puts them together into one «files» row and drops the pieces.
-- Pieces left half-way are dropped after a day (nightly). No outside storage — nothing extra to pay.
create table if not exists upload_parts (
  upload_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  idx int not null,
  data bytea not null,
  created_at timestamptz not null default now(),
  primary key (upload_id, idx)
);
create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  mime text not null,
  size int not null,
  parts int not null,
  conversation_id uuid references conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);
