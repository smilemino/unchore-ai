-- «Edit and ask again» (AI Soul /api/messages/{id}/edit, owner rule 2026-10-01): the old question and everything after it stay
-- in the chat greyed out, but leave the AI's context. Additive column, default false — existing rows are untouched.
alter table messages add column if not exists superseded boolean not null default false;
