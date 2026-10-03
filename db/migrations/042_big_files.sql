-- Files over 50 MB, up to 500 MB (AI Soul big attachments, owner «yes» 2026-10-02 21:40). Such a file keeps its 3.5 MB pieces in
-- upload_parts (locked one by one) and its «files» row points at them; nothing over 50 MB is ever put into one value.
alter table files add column if not exists parts_of uuid;
create index if not exists files_parts_of on files(parts_of) where parts_of is not null;
create index if not exists files_big_by_user on files(user_id) where parts_of is not null;
