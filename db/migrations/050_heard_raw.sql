-- Voice mode: what the speech recognizer wrote before repeated words were made one (lib/voice/unrepeat.ts, AI Soul heard_raw),
-- kept with the question so what was taken out can be seen. Locked like message text. Added only — nothing changed or removed.
alter table messages add column if not exists heard_raw text;
