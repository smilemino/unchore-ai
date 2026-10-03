-- Night retry (AI Soul's member-AI night re-run · owner 2026-10-02 «move everything that helps members»): an answer that ended in
-- «I don't know / you'll need to check» is asked again at 04:00 local with the member's own strongest model (web search on where it
-- can); if that one answers, the chat gets the answer and a «Remember this?» card (lib/night-retry.ts). Stamps keep each answer and
-- each member to one try. Additive only.
alter table messages add column if not exists night_retry_at timestamptz;
alter table users add column if not exists night_retry_at timestamptz;
