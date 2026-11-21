-- Alokasi Faktur: faktur barang masuk pemasok disimpan dulu (semua stok masuk ke toko seperti biasa),
-- lalu Admin / staf berizin Stok Gudang mengatur berapa yang ke gudang. Sisanya otomatis tetap di toko.
-- Admin memeriksa hasil alokasi staf (setuju atau kembalikan dengan catatan).
-- Hanya MENAMBAH kolom/fungsi. Fungsi penerimaan lama dipertahankan (diganti nama menjadi *_core) dan dibungkus.

-- 1. Jumlah per baris faktur yang dialokasikan ke gudang (satuan dasar). Sisanya (qty_dasar - ke_gudang) ada di toko.
alter table supplier_receipt_lines add column if not exists ke_gudang int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_receipt_lines_ke_gudang_chk') then
    alter table supplier_receipt_lines add constraint supplier_receipt_lines_ke_gudang_chk check (ke_gudang >= 0 and ke_gudang <= qty_dasar);
  end if;
end $$;

-- 2. Status alokasi per faktur. Faktur lama otomatis "selesai" (tidak perlu dialokasi ulang).
alter table supplier_receipts add column if not exists alokasi_status text not null default 'selesai';
alter table supplier_receipts alter column alokasi_status set default 'perlu_alokasi';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_receipts_alokasi_status_chk') then
    alter table supplier_receipts add constraint supplier_receipts_alokasi_status_chk
      check (alokasi_status in ('perlu_alokasi', 'menunggu_cek', 'dikembalikan', 'selesai'));
  end if;
end $$;
alter table supplier_receipts add column if not exists status_diubah timestamptz not null default now();
alter table supplier_receipts add column if not exists alokasi_oleh text not null default '';
alter table supplier_receipts add column if not exists alokasi_nama text not null default '';
alter table supplier_receipts add column if not exists alokasi_pada timestamptz;
alter table supplier_receipts add column if not exists alokasi_catatan text not null default '';
alter table supplier_receipts add column if not exists cek_oleh text not null default '';
alter table supplier_receipts add column if not exists cek_nama text not null default '';
alter table supplier_receipts add column if not exists cek_pada timestamptz;
alter table supplier_receipts add column if not exists catatan_kembali text not null default '';
-- Waktu pengingat terakhir untuk faktur yang belum ditindak lebih dari 1 hari (maksimal 1 pengingat per hari).
alter table supplier_receipts add column if not exists pengingat_pada timestamptz;
create index if not exists supplier_receipts_alokasi_status_idx on supplier_receipts (alokasi_status, status_diubah desc);

-- 3. Catatan mutasi gudang yang berasal dari alokasi faktur menyimpan nomor faktur.
alter table gudang_log add column if not exists receipt_id bigint;
create index if not exists gudang_log_receipt_idx on gudang_log (receipt_id) where receipt_id is not null;

-- 4. Pindahkan satu baris faktur ke angka alokasi baru. Stok toko tidak boleh minus, stok gudang tidak boleh minus.
--    delta > 0: toko berkurang, gudang bertambah (MASUK). delta < 0: gudang berkurang, toko bertambah (PINDAH).
create or replace function shop_receipt_apply_line(
  p_line_id bigint, p_new int, p_actor text, p_name text, p_dicek boolean, p_log boolean
) returns void
language plpgsql
as $$
declare
  v_line supplier_receipt_lines%rowtype;
  v_invoice text;
  v_kode text;
  v_nama text;
  v_factor int;
  v_delta int;
  v_abs int;
  v_toko int;
  v_g int;
  v_qty_in int;
  v_unit text;
begin
  select * into v_line from supplier_receipt_lines where id = p_line_id for update;
  if not found then raise exception 'Baris faktur tidak ditemukan'; end if;
  if p_new < 0 or p_new > v_line.qty_dasar then
    raise exception 'Jumlah ke gudang harus antara 0 dan jumlah di faktur.';
  end if;
  v_delta := p_new - v_line.ke_gudang;
  if v_delta = 0 then return; end if;
  v_abs := abs(v_delta);
  select invoice_no into v_invoice from supplier_receipts where id = v_line.receipt_id;
  select kode, nama into v_kode, v_nama from products where id = v_line.product_id;
  v_factor := greatest(1, v_line.qty_dasar / greatest(v_line.qty, 1));

  if v_delta > 0 then
    update products set stok = stok - v_abs where id = v_line.product_id and stok >= v_abs returning stok into v_toko;
    if not found then
      select stok into v_toko from products where id = v_line.product_id;
      raise exception 'Stok toko % tidak cukup untuk dipindah ke gudang (sisa % di toko).', coalesce(v_nama, 'barang'), coalesce(v_toko, 0);
    end if;
    insert into gudang_items (product_id, ditambah_oleh, ditambah_oleh_nama)
    values (v_line.product_id, coalesce(p_actor, ''), coalesce(p_name, ''))
    on conflict (product_id) do nothing;
    update gudang_items set stok = stok + v_abs, diubah_pada = now() where product_id = v_line.product_id;
  else
    update gudang_items set stok = stok - v_abs, diubah_pada = now()
      where product_id = v_line.product_id and stok >= v_abs returning stok into v_g;
    if not found then
      select stok into v_g from gudang_items where product_id = v_line.product_id;
      raise exception 'Stok gudang % tidak cukup (sisa %). Barang dari faktur % sudah diambil ke toko.', coalesce(v_nama, 'barang'), coalesce(v_g, 0), coalesce(v_invoice, '');
    end if;
    update products set stok = stok + v_abs where id = v_line.product_id;
  end if;

  update supplier_receipt_lines set ke_gudang = p_new where id = p_line_id;

  if p_log then
    if v_factor > 1 and v_abs % v_factor = 0 then
      v_qty_in := v_abs / v_factor; v_unit := 'alt';
    else
      v_qty_in := v_abs; v_unit := 'base';
    end if;
    insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama,
                            dicek, dicek_oleh, dicek_nama, dicek_pada, receipt_id)
    values (v_line.product_id, case when v_delta > 0 then 'MASUK' else 'PINDAH' end, v_abs, v_qty_in, v_unit,
            'Alokasi faktur ' || coalesce(v_invoice, ''), coalesce(p_actor, ''), coalesce(p_name, ''),
            p_dicek, case when p_dicek then coalesce(p_actor, '') else '' end, case when p_dicek then coalesce(p_name, '') else '' end,
            case when p_dicek then now() else null end, v_line.receipt_id);
  end if;
end;
$$;

-- 5. Batalkan seluruh alokasi satu faktur (semua kembali ke toko) dan hapus catatan mutasi yang berasal dari faktur itu.
create or replace function shop_receipt_undo_alokasi(p_id bigint) returns void
language plpgsql
as $$
declare
  v_line record;
begin
  for v_line in select id from supplier_receipt_lines where receipt_id = p_id and ke_gudang > 0 order by id loop
    perform shop_receipt_apply_line(v_line.id, 0, '', '', false, false);
  end loop;
  delete from gudang_log where receipt_id = p_id;
end;
$$;

-- 6. Ubah dan hapus penerimaan: logika lama tetap dipakai, tetapi alokasi gudang dikembalikan dulu ke toko
--    (supaya hitungan stok lama tidak salah), lalu dipasang lagi per barang setelah penerimaan diubah.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'shop_update_supplier_receipt_core') then
    alter function shop_update_supplier_receipt(jsonb) rename to shop_update_supplier_receipt_core;
  end if;
  if not exists (select 1 from pg_proc where proname = 'shop_delete_supplier_receipt_core') then
    alter function shop_delete_supplier_receipt(bigint) rename to shop_delete_supplier_receipt_core;
  end if;
end $$;

create or replace function shop_update_supplier_receipt(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_status text;
  v_snap jsonb;
  v_res jsonb;
  v_item record;
  v_new record;
begin
  if v_id is null then raise exception 'Penerimaan tidak ditemukan'; end if;
  select alokasi_status into v_status from supplier_receipts where id = v_id for update;
  if not found then raise exception 'Penerimaan pemasok tidak ditemukan'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('pid', product_id, 'n', n)), '[]'::jsonb) into v_snap
  from (select product_id, sum(ke_gudang)::int as n from supplier_receipt_lines
        where receipt_id = v_id group by product_id having sum(ke_gudang) > 0) s;

  perform shop_receipt_undo_alokasi(v_id);
  v_res := shop_update_supplier_receipt_core(p);

  for v_item in select (e->>'pid')::bigint as pid, (e->>'n')::int as n from jsonb_array_elements(v_snap) e loop
    select id, qty_dasar into v_new from supplier_receipt_lines where receipt_id = v_id and product_id = v_item.pid order by id limit 1;
    if found then
      perform shop_receipt_apply_line(v_new.id, least(v_item.n, v_new.qty_dasar), '', 'Ubah faktur', v_status = 'selesai', true);
    end if;
  end loop;
  return v_res;
end;
$$;

create or replace function shop_delete_supplier_receipt(p_id bigint) returns jsonb
language plpgsql
as $$
begin
  perform 1 from supplier_receipts where id = p_id for update;
  if not found then raise exception 'Penerimaan pemasok tidak ditemukan'; end if;
  perform shop_receipt_undo_alokasi(p_id);
  return shop_delete_supplier_receipt_core(p_id);
end;
$$;

-- 7. Simpan alokasi faktur. lines: [{lineId, keGudang}] dengan keGudang dalam satuan baris faktur (mis. 7 Dus).
--    Admin: status langsung "selesai". Staf berizin: status "menunggu_cek" sampai Admin memeriksa.
create or replace function shop_receipt_alokasi(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := (p->>'receiptId')::bigint;
  v_admin boolean := coalesce((p->>'isAdmin')::boolean, false);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_rec supplier_receipts%rowtype;
  v_line supplier_receipt_lines%rowtype;
  v_in jsonb;
  v_raw numeric;
  v_new int;
  v_factor int;
  v_n int := 0;
begin
  select * into v_rec from supplier_receipts where id = v_id for update;
  if not found then raise exception 'Faktur tidak ditemukan.'; end if;
  if v_rec.alokasi_status = 'selesai' and not v_admin then
    raise exception 'Faktur ini sudah selesai. Hanya Admin yang dapat mengubah alokasinya.';
  end if;
  if jsonb_typeof(coalesce(p->'lines', '[]'::jsonb)) <> 'array' then
    raise exception 'Data alokasi tidak valid.';
  end if;

  for v_line in select * from supplier_receipt_lines where receipt_id = v_id order by id loop
    select e into v_in from jsonb_array_elements(p->'lines') e where (e->>'lineId')::bigint = v_line.id limit 1;
    if v_in is null then
      v_new := v_line.ke_gudang;
    else
      v_raw := coalesce((v_in->>'keGudang')::numeric, 0);
      if v_raw < 0 or v_raw <> floor(v_raw) then
        raise exception 'Jumlah ke gudang harus bilangan bulat 0 atau lebih.';
      end if;
      if v_raw > v_line.qty then
        raise exception 'Jumlah ke gudang melebihi jumlah di faktur.';
      end if;
      v_factor := greatest(1, v_line.qty_dasar / greatest(v_line.qty, 1));
      v_new := v_raw::int * v_factor;
    end if;
    perform shop_receipt_apply_line(v_line.id, v_new, v_actor, v_name, v_admin, true);
    if v_new > 0 then v_n := v_n + 1; end if;
  end loop;

  update supplier_receipts set
    alokasi_status = case when v_admin then 'selesai' else 'menunggu_cek' end,
    status_diubah = now(),
    alokasi_oleh = v_actor, alokasi_nama = v_name, alokasi_pada = now(), alokasi_catatan = v_catatan,
    cek_oleh = case when v_admin then v_actor else '' end,
    cek_nama = case when v_admin then v_name else '' end,
    cek_pada = case when v_admin then now() else null end,
    catatan_kembali = ''
  where id = v_id;

  if v_admin then
    update gudang_log set dicek = true, dicek_oleh = v_actor, dicek_nama = v_name, dicek_pada = now()
      where receipt_id = v_id and tipe in ('MASUK', 'PINDAH') and not dicek;
  end if;

  return jsonb_build_object('ok', true, 'invoiceNo', v_rec.invoice_no,
    'status', case when v_admin then 'selesai' else 'menunggu_cek' end, 'barangKeGudang', v_n);
end;
$$;

-- 8. Admin memeriksa alokasi dari staf: setuju (selesai) atau kembalikan dengan catatan.
create or replace function shop_receipt_review(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := (p->>'receiptId')::bigint;
  v_aksi text := coalesce(p->>'aksi', '');
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 300);
  v_actor text := coalesce(p->>'actor', '');
  v_name text := coalesce(p->>'actorName', '');
  v_rec supplier_receipts%rowtype;
begin
  select * into v_rec from supplier_receipts where id = v_id for update;
  if not found then raise exception 'Faktur tidak ditemukan.'; end if;
  if v_rec.alokasi_status <> 'menunggu_cek' then
    raise exception 'Faktur ini tidak sedang menunggu pengecekan.';
  end if;

  if v_aksi = 'setuju' then
    update supplier_receipts set alokasi_status = 'selesai', status_diubah = now(),
      cek_oleh = v_actor, cek_nama = v_name, cek_pada = now(), catatan_kembali = ''
      where id = v_id;
    update gudang_log set dicek = true, dicek_oleh = v_actor, dicek_nama = v_name, dicek_pada = now()
      where receipt_id = v_id and tipe in ('MASUK', 'PINDAH') and not dicek;
  elsif v_aksi = 'kembalikan' then
    if v_catatan = '' then raise exception 'Catatan wajib diisi saat mengembalikan ke staf.'; end if;
    update supplier_receipts set alokasi_status = 'dikembalikan', status_diubah = now(),
      cek_oleh = v_actor, cek_nama = v_name, cek_pada = now(), catatan_kembali = v_catatan
      where id = v_id;
  else
    raise exception 'Aksi tidak dikenal.';
  end if;

  return jsonb_build_object('ok', true, 'invoiceNo', v_rec.invoice_no, 'aksi', v_aksi,
    'alokasiOleh', v_rec.alokasi_oleh, 'alokasiNama', v_rec.alokasi_nama);
end;
$$;

-- 9. Catatan mutasi yang berasal dari alokasi faktur tidak boleh diubah/dihapus dari Riwayat Mutasi gudang,
--    karena angka alokasi di faktur ikut berubah. Ubah lewat menu Alokasi Faktur.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'shop_gudang_edit_core') then
    alter function shop_gudang_edit(jsonb) rename to shop_gudang_edit_core;
  end if;
  if not exists (select 1 from pg_proc where proname = 'shop_gudang_hapus_log_core') then
    alter function shop_gudang_hapus_log(jsonb) rename to shop_gudang_hapus_log_core;
  end if;
end $$;

create or replace function shop_gudang_edit(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_rid bigint;
begin
  select receipt_id into v_rid from gudang_log where id = (p->>'logId')::bigint;
  if v_rid is not null then
    raise exception 'Catatan ini berasal dari alokasi faktur. Ubah lewat menu Alokasi Faktur.';
  end if;
  return shop_gudang_edit_core(p);
end;
$$;

create or replace function shop_gudang_hapus_log(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_rid bigint;
begin
  select receipt_id into v_rid from gudang_log where id = (p->>'logId')::bigint;
  if v_rid is not null then
    raise exception 'Catatan ini berasal dari alokasi faktur. Ubah lewat menu Alokasi Faktur.';
  end if;
  return shop_gudang_hapus_log_core(p);
end;
$$;
