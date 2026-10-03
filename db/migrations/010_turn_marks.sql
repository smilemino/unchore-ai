-- Batch 17 (owner «yes» 2026-09-30 08:55): «your turn» like AI Soul's 🟠 — an answer that waits for the member's reply or decision.
-- messages.asks: set on each answer (rule first, then the member's own small AI only when the rule sees a hint and ask_judge is on).
alter table messages add column if not exists asks boolean;
alter table users add column if not exists ask_judge boolean not null default true;
