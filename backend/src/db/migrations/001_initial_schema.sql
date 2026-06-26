create extension if not exists pgcrypto;
create extension if not exists citext;

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  display_name text not null,
  password_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_email_not_empty check (length(trim(email::text)) > 0),
  constraint users_display_name_not_empty check (length(trim(display_name)) > 0),
  constraint users_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index users_email_active_idx
  on users (email)
  where deleted_at is null;

create index users_created_at_idx
  on users (created_at desc);

create index users_metadata_gin_idx
  on users using gin (metadata);

create table documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users (id) on delete restrict,
  title text not null,
  content text not null default '',
  version bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint documents_title_not_empty check (length(trim(title)) > 0),
  constraint documents_version_non_negative check (version >= 0),
  constraint documents_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index documents_owner_user_id_idx
  on documents (owner_user_id);

create index documents_updated_at_idx
  on documents (updated_at desc);

create index documents_metadata_gin_idx
  on documents using gin (metadata);

create table document_permissions (
  document_id uuid not null references documents (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null,
  granted_by_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (document_id, user_id),
  constraint document_permissions_role_check
    check (role in ('owner', 'editor', 'viewer'))
);

create index document_permissions_user_id_idx
  on document_permissions (user_id);

create index document_permissions_role_idx
  on document_permissions (role);

create table document_metadata (
  document_id uuid primary key references documents (id) on delete cascade,
  character_count integer not null default 0,
  word_count integer not null default 0,
  last_edited_by_user_id uuid references users (id) on delete set null,
  last_edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_metadata_character_count_non_negative
    check (character_count >= 0),
  constraint document_metadata_word_count_non_negative
    check (word_count >= 0)
);

create index document_metadata_last_edited_at_idx
  on document_metadata (last_edited_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_set_updated_at
  before update on users
  for each row
  execute function set_updated_at();

create trigger documents_set_updated_at
  before update on documents
  for each row
  execute function set_updated_at();

create trigger document_permissions_set_updated_at
  before update on document_permissions
  for each row
  execute function set_updated_at();

create trigger document_metadata_set_updated_at
  before update on document_metadata
  for each row
  execute function set_updated_at();
