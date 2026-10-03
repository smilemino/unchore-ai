-- The answer as written so far, while it is being made (AI Soul: the same chat open in another tab or on the phone shows the
-- answer growing, not only «thinking» until it is saved). lib/turn.ts writes it about every 1.5 s, locked like all chat text
-- (lib/privacy.ts), and clears it with answering_since when the answer is saved. Additive only.
alter table conversations add column if not exists answering_text text;
