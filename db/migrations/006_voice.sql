-- Google voice in voice mode (2026-09-29 owner decision: Unchore pays; each member gets up to 60 minutes of Google voice a day,
-- then the phone's own voice takes over automatically). One row per member per day (the member's own time zone).
create table if not exists voice_usage (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  speak_sec real not null default 0,   -- Google voice read aloud (the 60-minute allowance)
  hear_sec real not null default 0,    -- speech sent to Google to recognise the language of the first words
  calls int not null default 0,
  primary key (user_id, day)
);
create index if not exists voice_usage_day on voice_usage(day);

-- Company-wide total for the safety cap. Members can only see their own rows (member lock), so this returns just one number.
create or replace function uc_voice_total(d date) returns real language sql stable security definer set search_path = public as
$$ select coalesce(sum(speak_sec + hear_sec), 0)::real from voice_usage where day = d $$;
revoke all on function uc_voice_total(date) from public;
grant execute on function uc_voice_total(date) to unchore_member;
