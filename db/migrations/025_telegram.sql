-- Talk to Unchore from Telegram (owner 2026-10-01 «1순위»). One official Unchore bot; a member links their own chat once with a
-- short code from Settings (t.me/<bot>?start=<code>). After that, a message in Telegram is a chat turn and reminders arrive there too.
-- Both tables have user_id, so uc_lock_tables() (005) fences them to their owner. The webhook (no member yet) uses the owner connection.
create table if not exists telegram_links (
  user_id uuid primary key references users(id) on delete cascade,
  chat_id bigint not null unique,
  conversation_id uuid references conversations(id) on delete set null,   -- the chat Telegram messages go into
  linked_at timestamptz not null default now()
);
create table if not exists telegram_codes (
  code text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists telegram_codes_user on telegram_codes(user_id);
