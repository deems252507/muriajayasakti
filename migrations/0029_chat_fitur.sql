-- Gagal cepat (5 detik) kalau tabel sedang terkunci, supaya deploy tidak menggantung dan menahan seluruh aplikasi.
set local lock_timeout = '5s';

-- Fitur chat lanjutan: lampiran foto/file, balas pesan, bagikan data toko, edit, sematkan, sebut nama, reaksi.
alter table chat_messages drop constraint if exists chat_messages_body_check;
alter table chat_group_messages drop constraint if exists chat_group_messages_body_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_body_len') then
    alter table chat_messages add constraint chat_messages_body_len check (char_length(body) <= 2000);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chat_group_messages_body_len') then
    alter table chat_group_messages add constraint chat_group_messages_body_len check (char_length(body) <= 2000);
  end if;
end $$;

alter table chat_messages
  add column if not exists reply_to bigint,
  add column if not exists edited_at timestamptz,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text,
  add column if not exists att_name text,
  add column if not exists att_type text,
  add column if not exists att_size integer,
  add column if not exists att_data text,
  add column if not exists ref_type text,
  add column if not exists ref_id text,
  add column if not exists ref_label text,
  add column if not exists mentions text[];

alter table chat_group_messages
  add column if not exists reply_to bigint,
  add column if not exists edited_at timestamptz,
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by text,
  add column if not exists att_name text,
  add column if not exists att_type text,
  add column if not exists att_size integer,
  add column if not exists att_data text,
  add column if not exists ref_type text,
  add column if not exists ref_id text,
  add column if not exists ref_label text,
  add column if not exists mentions text[];

-- Reaksi emoji. scope: 'dm' (chat pribadi) atau 'g' (chat grup). Satu reaksi per orang per pesan.
create table if not exists chat_reactions (
  scope text not null check (scope in ('dm', 'g')),
  message_id bigint not null,
  username text not null references staff (username) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (scope, message_id, username)
);
create index if not exists chat_reactions_msg_idx on chat_reactions (scope, message_id);
