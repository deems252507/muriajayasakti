-- Fitur chat lanjutan: lampiran foto/file, balas pesan, ubah pesan, bagikan data toko,
-- sematkan pesan, reaksi emoji. Semua kolom opsional sehingga pesan lama tetap berlaku.

create table if not exists mjs_chat_files (
  id bigserial primary key,
  owner text references staff (username) on delete set null,
  name text not null,
  mime text not null,
  size int not null default 0,
  data text not null,
  created_at timestamptz not null default now()
);

alter table chat_messages add column if not exists body_auto boolean not null default false;
alter table chat_messages add column if not exists reply_to bigint;
alter table chat_messages add column if not exists file_id bigint references mjs_chat_files (id) on delete set null;
alter table chat_messages add column if not exists share_kind text;
alter table chat_messages add column if not exists share_ref text;
alter table chat_messages add column if not exists share_title text;
alter table chat_messages add column if not exists share_sub text;
alter table chat_messages add column if not exists edited_at timestamptz;
alter table chat_messages add column if not exists pinned_at timestamptz;
alter table chat_messages add column if not exists pinned_by text;

alter table chat_group_messages add column if not exists body_auto boolean not null default false;
alter table chat_group_messages add column if not exists reply_to bigint;
alter table chat_group_messages add column if not exists file_id bigint references mjs_chat_files (id) on delete set null;
alter table chat_group_messages add column if not exists share_kind text;
alter table chat_group_messages add column if not exists share_ref text;
alter table chat_group_messages add column if not exists share_title text;
alter table chat_group_messages add column if not exists share_sub text;
alter table chat_group_messages add column if not exists edited_at timestamptz;
alter table chat_group_messages add column if not exists pinned_at timestamptz;
alter table chat_group_messages add column if not exists pinned_by text;

create index if not exists chat_messages_file_idx on chat_messages (file_id) where file_id is not null;
create index if not exists chat_group_messages_file_idx on chat_group_messages (file_id) where file_id is not null;

-- Satu reaksi emoji per orang per pesan (seperti WhatsApp).
create table if not exists mjs_chat_reactions (
  kind text not null check (kind in ('dm', 'group')),
  message_id bigint not null,
  username text not null references staff (username) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (kind, message_id, username)
);
create index if not exists mjs_chat_reactions_msg_idx on mjs_chat_reactions (kind, message_id);
