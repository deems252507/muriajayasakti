-- Komentar tidak lagi hanya untuk barang: bisa dipasang di nota, mitra, barang masuk, retur, shift kas.
alter table item_comments add column if not exists kind text not null default 'barang';
alter table item_comments add column if not exists ref text;
alter table item_comments add column if not exists label text not null default '';
update item_comments set ref = product_id::text where ref is null;
alter table item_comments alter column ref set not null;
alter table item_comments alter column product_id drop not null;
create index if not exists item_comments_ref_idx on item_comments (kind, ref, id);
