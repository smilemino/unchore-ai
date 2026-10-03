-- Company-wide settings the app reads and AI Soul changes after the owner's «yes» (no member column: members can't read them —
-- 005_member_lock.sql makes such tables insert-only for members; the app reads them on the owner connection).
-- First use (owner 2026-10-03 00:59): «computer_free_extra_krw:<YYYY-MM>» — won the owner added to that month's free pool for the
-- cloud computer and browser after being asked (lib/computer-meter.ts, reminder-gates/unchore-computer-cap).
create table if not exists house_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
