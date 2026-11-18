-- Colek staf lewat lonceng di panel Staff online: catatan pengiriman untuk membatasi 1 kali per menit per staf tujuan.
create table if not exists mjs_poke_log (
  id bigserial primary key,
  sender text not null references staff (username) on delete cascade,
  target text not null references staff (username) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists mjs_poke_log_pair_idx on mjs_poke_log (sender, target, created_at desc);
