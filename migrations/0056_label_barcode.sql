-- 0056: Isi label barcode (nama, harga, dll) disimpan di database supaya berlaku untuk semua akun dan perangkat.
-- Hanya MENAMBAH kolom. Kosong ({}) = semua isi ditampilkan seperti sebelumnya.
alter table shop_profile add column if not exists label_barcode jsonb not null default '{}'::jsonb;
