-- «A 480p draft, then the same shot in 1080p» (Seedance 2.5 Draft Mode — what Artlist/Picsart sell; owner 2026-10-02: «bring the
-- Artlist feature to Unchore»). Higgsfield has no draft/seed field, so a member who saved a fal key (vault FAL_KEY) gets video cards
-- made on fal as drafts; the card then offers the same shot in 1080p (row idx = 100 + the card's idx, same table). lib/fal-video.ts
alter table hf_jobs add column if not exists provider text not null default 'higgsfield';   -- higgsfield | fal
alter table hf_jobs add column if not exists draft_id text;                                  -- fal draft, completable for 7 days
