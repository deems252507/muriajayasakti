set local lock_timeout = '5s';
-- "Hapus untuk saya": pesan disembunyikan hanya dari tampilan satu orang, tanpa menghapusnya untuk lawan bicara (seperti WhatsApp).
create table if not exists mjs_chat_hidden (
  kind text not null check (kind in ('dm', 'group')),
  message_id bigint not null,
  username text not null references staff (username) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kind, message_id, username)
);
create index if not exists mjs_chat_hidden_user_idx on mjs_chat_hidden (username, kind);
