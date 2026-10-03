-- «Did a screen get this answer?» (2026-10-01 · follows 023). The open page says so when it shows the answer (POST /api/chat/got);
-- an answer nobody's screen took within a few seconds gets the «your answer is ready» notification. Measured on unchore.ai: the server
-- is not told when the browser leaves, so «the page went away» can't be the sign.
alter table conversations add column if not exists got_at timestamptz;
