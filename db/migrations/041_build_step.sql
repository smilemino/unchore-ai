-- The «working» line above the chat input (AI Soul WindowBadge → components/BuildLine.tsx): which step a running app build is on
-- (write:<try> · check · browser · deploy · open), so the member sees progress instead of waiting blind. Added only.
alter table builds add column if not exists step text;
