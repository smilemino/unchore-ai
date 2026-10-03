-- Chat import (AI Soul lib/claude-import.ts): each brought-over chat keeps the export's own id («claude:…» / «chatgpt:…»),
-- so uploading the same export again doesn't make a second copy. Added only — nothing changed or removed.
alter table conversations add column if not exists import_uuid text;
create unique index if not exists conversations_import_uuid on conversations(user_id, import_uuid) where import_uuid is not null;
