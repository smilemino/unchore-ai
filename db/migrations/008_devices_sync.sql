-- Owner «yes» 2026-09-30 08:55 (all 19 items that waited for a decision) — batch 15:
-- · a mail sign-in link remembers the language and time zone it was asked from (opened in another browser → still right)
-- · each sign-in knows its device («iPhone · Safari») and when it was last used → sign out one device
-- · unread answers and the order of pinned chats are kept on the server, so every device agrees
alter table login_tokens add column if not exists lang text;
alter table login_tokens add column if not exists tz text;

alter table sessions add column if not exists device text;
alter table sessions add column if not exists last_seen_at timestamptz;

-- How many answers the member has seen in each chat. Existing chats start fully read (no wall of numbers).
alter table conversations add column if not exists seen_ai int;
update conversations c set seen_ai = (select count(*)::int from messages m where m.conversation_id = c.id and m.role = 'assistant') where c.seen_ai is null;
alter table conversations alter column seen_ai set default 0;
alter table conversations alter column seen_ai set not null;

-- Place of a pinned chat in the pinned group (dragged by hand). Projects already have «sort».
alter table conversations add column if not exists pin_sort int not null default 0;
