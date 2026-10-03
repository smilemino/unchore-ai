-- Growth wheel (plan v11 §13 A·B · owner «build everything that can be built» 2026-09-30): where a member came from, and who sent them.
-- source = first touch, written once when the account is made: "ref:<code>", "utm:<source>/<campaign>" or "site:<host>".
alter table users add column if not exists source text;
alter table users add column if not exists ref_by uuid references users(id) on delete set null;
alter table users add column if not exists ref_code text unique;   -- this member's own share code, made the first time they share
create index if not exists users_ref_by on users(ref_by) where ref_by is not null;
