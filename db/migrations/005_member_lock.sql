-- Member lock: the database itself keeps every member's rows apart, so one missed «and user_id = …» in the app
-- can never show, change or delete another member's data.
-- · API requests run as the role «unchore_member» with app.user_id = the signed-in member (lib/db.ts);
--   Postgres then only lets that member see and touch rows whose owner is that member (row-level security).
-- · Sign-in, cron and other system work keep the owner connection, which is not fenced (same as before).
-- · uc_lock_tables() is re-run by scripts/migrate.mjs after every migration, so tables added later are fenced too:
--   a table with a user_id column → own rows only; messages/runs → through their conversation/automation;
--   users → own row only; any other table → members may add rows but never read them (e.g. usage logs).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'unchore_member') then
    create role unchore_member nologin;
  end if;
end $$;
do $$ begin
  execute format('grant unchore_member to %I', current_user);
exception when others then null; -- a superuser can switch to it anyway
end $$;
grant usage on schema public to unchore_member;
-- A table made later (even before uc_lock_tables runs again) starts as «members may add rows, never read».
alter default privileges in schema public grant insert on tables to unchore_member;
alter default privileges in schema public grant usage, select on sequences to unchore_member;

create or replace function uc_me() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function uc_lock_tables() returns void language plpgsql as $$
declare t text;
begin
  execute 'grant usage, select on all sequences in schema public to unchore_member';
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' order by 1 loop
    if t = 'schema_migrations' then
      continue;
    end if;
    execute format('revoke all on %I from unchore_member', t);
    execute format('drop policy if exists uc_own on %I', t);
    if t = 'users' then
      execute 'grant select, update, delete on users to unchore_member';
      execute 'alter table users enable row level security';
      execute 'create policy uc_own on users using (id = uc_me()) with check (id = uc_me())';
    elsif exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      execute format('grant select, insert, update, delete on %I to unchore_member', t);
      execute format('alter table %I enable row level security', t);
      execute format('create policy uc_own on %I using (user_id = uc_me()) with check (user_id = uc_me())', t);
    elsif t = 'messages' then
      execute 'grant select, insert, update, delete on messages to unchore_member';
      execute 'alter table messages enable row level security';
      execute 'create policy uc_own on messages using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = uc_me())) with check (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = uc_me()))';
    elsif t = 'runs' then
      execute 'grant select, insert, update, delete on runs to unchore_member';
      execute 'alter table runs enable row level security';
      execute 'create policy uc_own on runs using (exists (select 1 from automations a where a.id = automation_id and a.user_id = uc_me())) with check (exists (select 1 from automations a where a.id = automation_id and a.user_id = uc_me()))';
    else
      execute format('grant insert on %I to unchore_member', t);
    end if;
  end loop;
end $$;

select uc_lock_tables();
