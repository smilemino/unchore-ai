-- Voice mode read-back (AI Soul 2619555): the task a voice answer read back («You want me to … — right?»), locked. Only a short
-- «yes» to that same answer within 3 minutes hands it to the member's computer (lib/voice/confirm.ts).
alter table messages add column if not exists voice_confirm text;
