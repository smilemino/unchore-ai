-- «Is it really done?» (lib/keep-going.ts): after a piece of work, the member's own strong AI checks the answer and, when it can do
-- more by itself, the chat gets one more turn. users.keep_going: the member's switch (Settings). messages.auto_turn: a member-side message
-- Unchore wrote by itself (not counted as the member speaking). Added only — nothing changed or removed.
alter table users add column if not exists keep_going boolean not null default true;
alter table messages add column if not exists auto_turn boolean not null default false;
