-- Interval cek berkala Stok Opname (dalam bulan).
-- kategori_key '*' = interval untuk semua kategori; baris lain = interval khusus satu kategori (huruf kecil).
create table if not exists opname_interval (
  kategori_key text primary key,
  interval_bulan int not null check (interval_bulan in (1, 2, 3, 6))
);
