-- Notifications for the Android app (android/unchore-app, owner 2026-09-30 «put Unchore on Google Play»).
-- A web view can't receive web push, so the app asks every 15 minutes (and when it opens) for what was sent since it last asked.
-- lib/push.ts pushUser() adds a row here only for members who have the app (a row in app_devices). Rows older than 3 days are dropped.
-- Both tables have user_id, so uc_lock_tables() (005) fences them to their owner.
create table if not exists app_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device text not null,                     -- a random id the app made on first start
  label text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, device)
);
create table if not exists app_inbox (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null,
  tag text,
  created_at timestamptz not null default now()
);
create index if not exists app_inbox_user on app_inbox(user_id, id);
create index if not exists app_inbox_old on app_inbox(created_at);
