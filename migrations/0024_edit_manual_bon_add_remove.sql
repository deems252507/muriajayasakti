-- Edit Bon manual: selain ubah nama/qty/harga, kini bisa hapus barang per baris (qty 0) dan tambah barang
-- (katalog atau custom). Stok dan data pajak ikut menyesuaikan. Hanya untuk Bon yang belum lunas.

create or replace function shop_edit_manual_bon(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_item jsonb;
  v_line invoice_lines%rowtype;
  v_prod products%rowtype;
  v_qty int;
  v_harga bigint;
  v_konv int;
  v_dasar int;
  v_delta int;
  v_stok int;
  v_total bigint;
  v_tujuan text;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_is_alt boolean;
  v_satuan text;
  v_custom text;
  v_new_id bigint;
begin
  select * into v_inv from invoices
  where nomor = p->>'nomor' and source = 'Manual' and metode_bayar = 'Bon'
  for update;
  if not found then
    raise exception 'Nota Bon manual tidak ditemukan';
  end if;
  if v_inv.status_bayar <> 'Bon' then
    raise exception 'Bon sudah lunas dan tidak bisa diedit';
  end if;

  v_tujuan := btrim(coalesce(nullif(p->>'tujuan', ''), v_inv.tujuan));
  if v_tujuan = '' or lower(v_tujuan) = 'umum' then
    raise exception 'Untuk Bon, wajib isi nama pelanggan';
  end if;

  -- Baris yang sudah ada: ubah qty/harga, atau hapus bila qty <= 0.
  for v_item in select value from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    select * into v_line from invoice_lines
    where id = (v_item->>'id')::bigint and invoice_id = v_inv.id
    for update;
    if not found then
      raise exception 'Baris nota tidak ditemukan';
    end if;
    v_qty := case when v_item ? 'qty' then coalesce((v_item->>'qty')::int, v_line.jumlah) else v_line.jumlah end;
    v_harga := case when v_item ? 'harga' then greatest(coalesce(nullif(v_item->>'harga', '')::bigint, 0), 0) else v_line.harga_satuan end;

    if v_qty <= 0 then
      if v_line.product_id is not null then
        update products set stok = stok + v_line.jumlah_dasar where id = v_line.product_id;
      end if;
      delete from tax_lines where line_id = v_line.id;
      delete from invoice_lines where id = v_line.id;
      continue;
    end if;

    v_konv := case when v_line.jumlah > 0 then greatest(v_line.jumlah_dasar / v_line.jumlah, 1) else 1 end;
    v_dasar := v_qty * v_konv;
    v_delta := v_dasar - v_line.jumlah_dasar;
    if v_line.product_id is not null and v_delta <> 0 then
      update products set stok = stok - v_delta where id = v_line.product_id returning stok into v_stok;
      if v_stok < 0 then
        raise exception 'Stok tidak cukup untuk jumlah yang baru';
      end if;
    end if;
    update invoice_lines
    set jumlah = v_qty, jumlah_dasar = v_dasar, harga_satuan = v_harga
    where id = v_line.id;

    if v_line.product_id is not null then
      select * into v_prod from products where id = v_line.product_id;
      v_persen := pajak_persen(v_prod.kategori);
      select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_harga * v_qty, v_persen);
      update tax_lines
      set jumlah = v_qty, harga_satuan = v_harga, dpp = v_dpp, persentase = v_persen, nilai_pajak = v_pajak
      where line_id = v_line.id;
    end if;
  end loop;

  -- Barang tambahan (katalog atau custom), selalu berjenis KELUAR.
  for v_item in select value from jsonb_array_elements(coalesce(p->'add', '[]'::jsonb))
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 then
      raise exception 'Jumlah barang tambahan tidak valid';
    end if;
    v_harga := greatest(coalesce(nullif(v_item->>'harga', '')::bigint, 0), 0);
    v_custom := nullif(btrim(coalesce(v_item->>'custom', '')), '');

    if v_custom is not null then
      v_satuan := left(coalesce(nullif(btrim(v_item->>'satuan'), ''), 'Item'), 20);
      insert into invoice_lines (
        invoice_id, product_id, custom_item, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, part_numbers_alt, merek
      ) values (
        v_inv.id, null, left(v_custom, 200), 'KELUAR', v_qty, v_satuan, v_qty, v_harga, '', ''
      );
    else
      select * into v_prod from products where id = nullif(v_item->>'productId', '')::bigint for update;
      if not found then
        raise exception 'Barang tambahan tidak ditemukan';
      end if;
      v_is_alt := coalesce((v_item->>'isAlt')::boolean, false);
      if v_is_alt then
        if v_prod.isi_satuan_alt <= 0 then
          raise exception 'Barang % tidak punya satuan dus', v_prod.nama;
        end if;
        v_konv := v_prod.isi_satuan_alt;
        v_satuan := v_prod.satuan_alt;
      else
        v_konv := 1;
        v_satuan := v_prod.satuan;
      end if;
      v_dasar := v_qty * v_konv;
      if v_prod.stok < v_dasar then
        raise exception 'Stok % tidak cukup. Tersedia % %', v_prod.nama, v_prod.stok, v_prod.satuan;
      end if;
      update products set stok = stok - v_dasar where id = v_prod.id;
      insert into invoice_lines (
        invoice_id, product_id, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, part_numbers_alt, merek
      ) values (
        v_inv.id, v_prod.id, 'KELUAR', v_qty, v_satuan, v_dasar, v_harga, v_prod.part_numbers_alt, v_prod.merek
      ) returning id into v_new_id;
      v_persen := pajak_persen(v_prod.kategori);
      select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_harga * v_qty, v_persen);
      insert into tax_lines (
        line_id, nomor, tanggal, part_number, nama, kategori, merek, kode_pajak,
        status_bayar, pelanggan, jumlah, satuan, harga_satuan, dpp, persentase, nilai_pajak
      ) values (
        v_new_id, v_inv.nomor, v_inv.tanggal, v_prod.part_number, v_prod.nama, v_prod.kategori, v_prod.merek, v_prod.kode_pajak,
        'Bon', v_tujuan, v_qty, v_satuan, v_harga, v_dpp, v_persen, v_pajak
      );
    end if;
  end loop;

  if not exists (select 1 from invoice_lines where invoice_id = v_inv.id) then
    raise exception 'Bon tidak boleh kosong. Gunakan tombol Hapus untuk membatalkan bon.';
  end if;

  select coalesce(sum(harga_satuan * jumlah), 0) into v_total from invoice_lines where invoice_id = v_inv.id;

  update invoices set tujuan = v_tujuan, total = v_total where id = v_inv.id;
  update tax_lines set pelanggan = v_tujuan where nomor = v_inv.nomor;

  return jsonb_build_object('nomor', v_inv.nomor, 'total', v_total, 'tujuan', v_tujuan);
end;
$$;
