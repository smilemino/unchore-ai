-- Soul parity 2: phone/desktop notifications (web push) and long-chat summaries.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists push_user on push_subscriptions(user_id);
alter table conversations add column if not exists summary text;
alter table conversations add column if not exists summary_upto int not null default 0;
