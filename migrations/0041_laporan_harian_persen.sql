-- Persen diskon per baris (hanya untuk layar input Laporan Harian, tidak ikut cetak).
alter table lh_baris add column if not exists persen numeric not null default 11;
