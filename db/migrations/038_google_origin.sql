-- Google data stays out of «Help improve Unchore» copies (owner 2026-10-02, for Google's app review: the policy must say
-- Google data is used only to give the member the feature). A chat that read their Calendar/Drive, or holds a file picked
-- from Google Drive, is marked; its turns get no improvement copy and copies made before the mark are deleted.
alter table conversations add column if not exists google_data boolean not null default false;
alter table files add column if not exists from_google boolean not null default false;
alter table uploads add column if not exists from_google boolean not null default false;
