-- «Let the AI write new memories» on its own, apart from «Remember things about me» (AI Soul Settings «대화에서 기억을 스스로 적기»):
-- off keeps using the memories already saved and the ones the member adds, but the AI stops adding or changing them after answers.
-- Additive with a default, so every existing member keeps today's behaviour.
alter table users add column if not exists memory_write boolean not null default true;
