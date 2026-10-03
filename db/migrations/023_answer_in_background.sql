-- Answers keep going when the member closes the window or goes to another site (2026-10-01 owner: «the chat can be closed,
-- the work goes on and we tell them when it's done»). Only ■ Stop stops an answer now, by its own turn number.
-- conversations.answering_since: set while an answer is being made, so a chat opened again shows «thinking» and fetches it when done.
-- users.stop_turn: the turn ■ Stop asked to stop (a new turn has a new number, so a late stop never hits the next answer).
alter table conversations add column if not exists answering_since timestamptz;
alter table users add column if not exists stop_turn uuid;
