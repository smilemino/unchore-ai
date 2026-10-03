create table personal_ui (
  user_id uuid primary key references users(id) on delete cascade,
  revision integer not null default 0, active integer, pending integer,
  used boolean not null default false, tip_hidden boolean not null default false,
  tip_count integer not null default 0 check(tip_count between 0 and 3),
  tip_at timestamptz, updated_at timestamptz not null default now()
);
create table personal_ui_versions (
  user_id uuid not null references users(id) on delete cascade,
  version integer not null, design text not null,
  created_at timestamptz not null default now(), primary key(user_id, version)
);
create table personal_ui_data (
  user_id uuid not null references users(id) on delete cascade,
  key text not null check(length(key) between 1 and 64), value text not null,
  revision integer not null default 1, primary key(user_id, key)
);
