-- «🧠 Memory updated» under an answer, kept with that answer (AI Soul MemoryNote): what was added, changed or removed, so the member
-- can open it and see the words — also after reopening the chat. Locked like message text. Added only — nothing changed or removed.
alter table messages add column if not exists memory_note text;
