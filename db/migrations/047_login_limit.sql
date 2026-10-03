-- Sign-in e-mail limits (AI Soul lib/server/login-limit.ts): when a link was asked for, and from where — the internet address
-- kept only as a hash — so one place can't send links every few seconds and the whole site can't be used to flood inboxes.
-- Older rows have no «requested_from» and are never counted. Added only — nothing changed or removed.
alter table login_tokens add column if not exists created_at timestamptz not null default now();
alter table login_tokens add column if not exists requested_from text;
create index if not exists login_tokens_recent on login_tokens(created_at) where requested_from is not null;
