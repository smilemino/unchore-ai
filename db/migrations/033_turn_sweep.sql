-- «Your turn» second look (AI Soul lib/ask-sweep.ts · owner 2026-10-02 «chats sit in "answer" with nothing for me to answer»):
-- when the 30-minute tidy last re-judged this waiting answer with the member's own small AI (lib/turn-sweep.ts). Additive only.
alter table messages add column if not exists turn_swept_at timestamptz;
