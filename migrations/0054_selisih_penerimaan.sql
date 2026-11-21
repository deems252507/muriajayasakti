-- Selisih penerimaan: jumlah barang yang BENAR-BENAR diterima bisa lebih sedikit dari jumlah di faktur (kurang / rusak).
-- Baris faktur dibagi tiga: ke gudang + selisih (kurang/rusak) + sisanya di toko. Stok toko mengikuti fisik, jumlah faktur tidak diubah
-- (faktur tetap dokumen pembelian apa adanya), sehingga selisih bisa dipakai sebagai bukti klaim ke pemasok.
-- Migrasi ini aman dijalankan walau 0053 sudah/ belum terpasang: semua kolom memakai "if not exists".

alter table supplier_receipts add column if not exists pengingat_pada timestamptz;

alter table supplier_receipt_lines add column if not exists selisih int not null default 0;
alter table supplier_receipt_lines add column if not exists selisih_catatan text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_receipt_lines_selisih_chk') then
    alter table supplier_receipt_lines add constraint supplier_receipt_lines_selisih_chk
      check (selisih >= 0 and ke_gudang + selisih <= qty_dasar);
  end if;
end $$;

-- Pindahkan satu baris faktur ke angka alokasi gudang baru (versi 0053 + pengaman: gudang + selisih tidak boleh melebihi faktur).
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
  if p_new < 0 or p_new + v_line.selisih > v_line.qty_dasar then
    raise exception 'Jumlah ke gudang ditambah selisih tidak boleh melebihi jumlah di faktur.';
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

-- Catat selisih (kurang / rusak) satu baris faktur. Stok toko berkurang sebesar selisih (stok mengikuti fisik).
create or replace function shop_receipt_set_selisih(p_line_id bigint, p_new int, p_catatan text) returns void
language plpgsql
as $$
declare
  v_line supplier_receipt_lines%rowtype;
  v_nama text;
  v_delta int;
  v_abs int;
  v_toko int;
  v_cat text := left(btrim(coalesce(p_catatan, '')), 300);
begin
  select * into v_line from supplier_receipt_lines where id = p_line_id for update;
  if not found then raise exception 'Baris faktur tidak ditemukan'; end if;
  if p_new < 0 or p_new + v_line.ke_gudang > v_line.qty_dasar then
    raise exception 'Jumlah ke gudang ditambah selisih tidak boleh melebihi jumlah di faktur.';
  end if;
  if p_new > 0 and v_cat = '' then
    raise exception 'Catatan selisih wajib diisi (mis. rusak, kurang kirim).';
  end if;
  v_delta := p_new - v_line.selisih;
  if v_delta <> 0 then
    v_abs := abs(v_delta);
    select nama into v_nama from products where id = v_line.product_id;
    if v_delta > 0 then
      update products set stok = stok - v_abs where id = v_line.product_id and stok >= v_abs returning stok into v_toko;
      if not found then
        select stok into v_toko from products where id = v_line.product_id;
        raise exception 'Stok toko % tidak cukup untuk mencatat selisih (sisa % di toko).', coalesce(v_nama, 'barang'), coalesce(v_toko, 0);
      end if;
    else
      update products set stok = stok + v_abs where id = v_line.product_id;
    end if;
  end if;
  update supplier_receipt_lines set selisih = p_new, selisih_catatan = case when p_new > 0 then v_cat else '' end where id = p_line_id;
end;
$$;

-- Batalkan seluruh alokasi dan selisih satu faktur (semua kembali ke toko penuh) dan hapus mutasi gudang dari faktur itu.
create or replace function shop_receipt_undo_alokasi(p_id bigint) returns void
language plpgsql
as $$
declare
  v_line record;
begin
  for v_line in select id from supplier_receipt_lines where receipt_id = p_id and selisih > 0 order by id loop
    perform shop_receipt_set_selisih(v_line.id, 0, '');
  end loop;
  for v_line in select id from supplier_receipt_lines where receipt_id = p_id and ke_gudang > 0 order by id loop
    perform shop_receipt_apply_line(v_line.id, 0, '', '', false, false);
  end loop;
  delete from gudang_log where receipt_id = p_id;
end;
$$;

-- Ubah penerimaan: alokasi dan selisih dikembalikan dulu, logika lama berjalan, lalu dipasang lagi per barang.
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

  select coalesce(jsonb_agg(jsonb_build_object('pid', product_id, 'n', n, 's', s, 'c', c)), '[]'::jsonb) into v_snap
  from (select product_id, sum(ke_gudang)::int as n, sum(selisih)::int as s, max(selisih_catatan) as c
        from supplier_receipt_lines where receipt_id = v_id group by product_id
        having sum(ke_gudang) > 0 or sum(selisih) > 0) x;

  perform shop_receipt_undo_alokasi(v_id);
  v_res := shop_update_supplier_receipt_core(p);

  for v_item in select (e->>'pid')::bigint as pid, (e->>'n')::int as n, (e->>'s')::int as s, e->>'c' as c from jsonb_array_elements(v_snap) e loop
    select id, qty_dasar into v_new from supplier_receipt_lines where receipt_id = v_id and product_id = v_item.pid order by id limit 1;
    if found then
      if v_item.n > 0 then
        perform shop_receipt_apply_line(v_new.id, least(v_item.n, v_new.qty_dasar), '', 'Ubah faktur', v_status = 'selesai', true);
      end if;
      if v_item.s > 0 then
        perform shop_receipt_set_selisih(v_new.id,
          least(v_item.s, v_new.qty_dasar - (select ke_gudang from supplier_receipt_lines where id = v_new.id)),
          coalesce(nullif(v_item.c, ''), 'Selisih dari faktur sebelum diubah'));
      end if;
    end if;
  end loop;
  return v_res;
end;
$$;

-- Simpan alokasi faktur: ke gudang + selisih (kurang/rusak) per baris, dalam satuan baris faktur (mis. Dus).
-- lines: [{lineId, keGudang, selisih, selisihCatatan}]. Admin: status "selesai". Staf berizin: "menunggu_cek".
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
  v_raw_s numeric;
  v_new int;
  v_new_s int;
  v_factor int;
  v_n int := 0;
  v_ns int := 0;
  v_cur_s int;
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
    v_factor := greatest(1, v_line.qty_dasar / greatest(v_line.qty, 1));
    if v_in is null then
      v_new := v_line.ke_gudang;
      v_new_s := v_line.selisih;
    else
      v_raw := coalesce((v_in->>'keGudang')::numeric, 0);
      v_raw_s := coalesce((v_in->>'selisih')::numeric, 0);
      if v_raw < 0 or v_raw <> floor(v_raw) or v_raw_s < 0 or v_raw_s <> floor(v_raw_s) then
        raise exception 'Jumlah ke gudang dan selisih harus bilangan bulat 0 atau lebih.';
      end if;
      if v_raw + v_raw_s > v_line.qty then
        raise exception 'Jumlah ke gudang ditambah selisih melebihi jumlah di faktur.';
      end if;
      v_new := v_raw::int * v_factor;
      v_new_s := v_raw_s::int * v_factor;
    end if;

    -- Urutan per baris: selisih yang turun dulu, lalu gudang, lalu selisih yang naik (aturan jumlah tetap terjaga di tiap langkah).
    v_cur_s := v_line.selisih;
    if v_new_s < v_cur_s then
      perform shop_receipt_set_selisih(v_line.id, v_new_s, coalesce(v_in->>'selisihCatatan', v_line.selisih_catatan));
      v_cur_s := v_new_s;
    end if;
    perform shop_receipt_apply_line(v_line.id, v_new, v_actor, v_name, v_admin, true);
    if v_new_s > v_cur_s or (v_new_s > 0 and coalesce(v_in->>'selisihCatatan', '') <> v_line.selisih_catatan and v_in is not null) then
      perform shop_receipt_set_selisih(v_line.id, v_new_s, coalesce(v_in->>'selisihCatatan', v_line.selisih_catatan));
    end if;
    if v_new > 0 then v_n := v_n + 1; end if;
    if v_new_s > 0 then v_ns := v_ns + 1; end if;
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
    'status', case when v_admin then 'selesai' else 'menunggu_cek' end, 'barangKeGudang', v_n, 'barangSelisih', v_ns);
end;
$$;
