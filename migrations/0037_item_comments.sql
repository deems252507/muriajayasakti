-- Komentar pada barang (Daftar Sparepart): tag antar Admin, balasan, hapus.
create table if not exists item_comments (
  id bigserial primary key,
  product_id bigint not null references products (id) on delete cascade,
  parent_id bigint references item_comments (id) on delete cascade,
  author text not null references staff (username) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists item_comments_product_idx on item_comments (product_id, id);
create index if not exists item_comments_parent_idx on item_comments (parent_id);

-- Siapa yang di-tag pada tiap komentar. seen_at kosong = belum dibuka.
create table if not exists item_comment_tags (
  comment_id bigint not null references item_comments (id) on delete cascade,
  username text not null references staff (username) on delete cascade,
  seen_at timestamptz,
  primary key (comment_id, username)
);
create index if not exists item_comment_tags_unseen_idx on item_comment_tags (username) where seen_at is null;
