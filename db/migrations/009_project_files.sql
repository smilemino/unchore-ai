-- Batch 16 (owner «yes» 2026-09-30 08:55): projects like AI Soul's — files every chat in the project reads, the project's own AI, archive.
alter table projects add column if not exists default_model text;
alter table projects add column if not exists archived boolean not null default false;
-- A project file has project_id set and no chat/message (a chat's own attachments keep project_id null).
alter table files add column if not exists project_id uuid references projects(id) on delete cascade;
create index if not exists files_project on files(project_id) where project_id is not null;
