-- Grup khusus staff: chat grup + catatan bersama. Hanya anggota yang bisa melihat isinya.
create table if not exists chat_groups (
  id bigserial primary key,
  nama text not null check (char_length(btrim(nama)) between 1 and 60),
  deskripsi text not null default '' check (char_length(deskripsi) <= 300),
  created_by text references staff (username) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists chat_group_members (
  group_id bigint not null references chat_groups (id) on delete cascade,
  username text not null references staff (username) on delete cascade,
  last_read_id bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (group_id, username)
);
create index if not exists chat_group_members_user_idx on chat_group_members (username);

create table if not exists chat_group_messages (
  id bigserial primary key,
  group_id bigint not null references chat_groups (id) on delete cascade,
  sender text not null references staff (username) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists chat_group_messages_group_idx on chat_group_messages (group_id, id desc);

create table if not exists chat_group_notes (
  id bigserial primary key,
  group_id bigint not null references chat_groups (id) on delete cascade,
  judul text not null default '' check (char_length(judul) <= 120),
  isi text not null default '' check (char_length(isi) <= 10000),
  pinned boolean not null default false,
  created_by text references staff (username) on delete set null,
  updated_by text references staff (username) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_group_notes_group_idx on chat_group_notes (group_id, pinned desc, updated_at desc);
