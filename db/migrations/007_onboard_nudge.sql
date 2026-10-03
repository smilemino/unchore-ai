-- First chat and the daily note (plan 10판 §8 · 2026-09-29 owner: «AI speaks first, learns when to stop»).
-- face: which of the five faces this person is (student · worker · shop · builder · senior · general). null = not known yet → first-chat greeting.
alter table users add column if not exists face text;
alter table users add column if not exists onboarded_at timestamptz;
-- Daily note: 0 off (only the user turns it off) · 1 weekly · 2 every other day · 3 daily (start) · 4 twice a day · 5 three times a day.
alter table users add column if not exists nudge_level int not null default 3;
alter table users add column if not exists nudge_at text not null default '08:00';
alter table users add column if not exists nudge_changed_at timestamptz;
alter table users add column if not exists nudge_asked_move_at timestamptz;
alter table users add column if not exists nudge_asked_more_at timestamptz;
-- Tonight's finding for tomorrow's note (locked like chats) and when an idea was last offered.
alter table users add column if not exists nudge_note text;
alter table users add column if not exists nudge_note_at timestamptz;
