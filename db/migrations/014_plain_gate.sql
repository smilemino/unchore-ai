-- Batch 20b (owner «yes» 2026-09-30 08:55): plain-words check (lib/plain-gate.ts) — off until the member turns it on (it uses their AI once or twice more).
alter table users add column if not exists plain_gate boolean not null default false;
