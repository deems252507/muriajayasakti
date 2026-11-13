-- 1) Ikon aplikasi (favicon, ikon layar utama HP, ikon notifikasi) mengikuti logo toko.
--    Kolom icon = versi persegi berlatar solid dari logo; kosong = pakai logo / ikon bawaan.
alter table shop_profile add column if not exists icon text not null default '';

-- 2) Jenis pajak baru yang ditambahkan sendiri di Pengaturan harus ikut dihitung dengan benar.
--    Cocokkan nama jenis ke kategori barang (bagian kata); kalau ada beberapa yang cocok,
--    pakai nama jenis yang paling spesifik (paling panjang). Tidak ada yang cocok = "Lainnya".
--    Persentase tiap nota tetap tersimpan di baris nota, jadi nota lama tidak ikut berubah.
create or replace function pajak_persen(kat text) returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select persentase
      from master_pajak
      where aktif
        and btrim(jenis) <> ''
        and lower(btrim(jenis)) <> 'lainnya'
        and lower(coalesce(kat, '')) like '%' || lower(btrim(jenis)) || '%'
      order by length(btrim(jenis)) desc, id
      limit 1
    ),
    (select persentase from master_pajak where lower(btrim(jenis)) = 'lainnya' limit 1),
    11
  );
$$;
