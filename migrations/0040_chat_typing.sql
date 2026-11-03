-- Status "sedang mengetik..." di Chat Staff. Baris dianggap kedaluwarsa otomatis setelah beberapa detik (lihat chatThread).
-- target: username penerima (pesan pribadi) atau "g:<id grup>" (grup).
create table if not exists mjs_chat_typing (
  kind text not null,
  target text not null,
  username text not null,
  at timestamptz not null default now(),
  primary key (kind, target, username)
);
