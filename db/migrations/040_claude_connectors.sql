-- Owner «yes» 2026-10-02 21:40: a Claude plan answer may read the member's own claude.ai connectors (Notion, Slack…), read-only
-- (worker/connector-guard.mjs), each turn in its own folder (worker/claude.mjs turnHome) — off until the member turns it on.
alter table users add column if not exists claude_connectors boolean not null default false;
