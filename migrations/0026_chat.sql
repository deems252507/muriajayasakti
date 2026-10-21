-- Chat pribadi antar staff (Owner, Admin, Kasir). Satu baris = satu pesan dari pengirim ke penerima.
create table if not exists chat_messages (
  id bigserial primary key,
  sender text not null references staff (username) on delete cascade,
  recipient text not null references staff (username) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists chat_messages_pair_idx on chat_messages (sender, recipient, id desc);
create index if not exists chat_messages_recipient_idx on chat_messages (recipient, id desc);
create index if not exists chat_messages_unread_idx on chat_messages (recipient) where read_at is null;
