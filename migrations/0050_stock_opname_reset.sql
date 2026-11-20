-- Cek ulang berkala Stok Opname.
-- Hanya MENAMBAH satu tabel. Tabel products, stock_opname_logs, dan semua fungsi lama tidak diubah.
--
-- Satu baris = satu barang ditandai "perlu cek ulang" pada waktu tertentu.
-- Status barang (dihitung di aplikasi): pemeriksaan terakhir yang LEBIH LAMA dari tanda ini
-- tidak lagi dianggap berlaku, jadi statusnya kembali PERLU_CEK_ULANG. Setelah barang diperiksa
-- lagi, pemeriksaan baru otomatis lebih baru dari tanda ini dan statusnya kembali SUDAH_DICEK.
-- Stok sistem dan riwayat pemeriksaan TIDAK berubah.
--
-- batch_id mengelompokkan barang yang ditandai sekaligus (satu barang, satu kategori, atau semua)
-- supaya satu kali penandaan bisa diurungkan.
create table if not exists stock_opname_reset (
  id bigserial primary key,
  product_id bigint not null references products (id) on delete cascade,
  batch_id text not null,
  cakupan text not null default '',
  reset_pada timestamptz not null default now(),
  oleh text not null default '',
  oleh_nama text not null default ''
);

create index if not exists stock_opname_reset_product_idx
  on stock_opname_reset (product_id, reset_pada desc);
create index if not exists stock_opname_reset_batch_idx
  on stock_opname_reset (batch_id);
