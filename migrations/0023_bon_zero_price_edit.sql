-- Nota manual Bon boleh disimpan dengan harga Rp 0 (harga diisi/diedit nanti dari menu Bon / Piutang).
-- Nama pelanggan tetap wajib. Pelunasan ditolak selama total masih Rp 0.
-- Ditambah: shop_edit_manual_bon untuk edit nama pelanggan, qty, dan harga nota Bon manual.

create or replace function shop_manual(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_prod products%rowtype;
  v_qty int;
  v_is_alt boolean;
  v_konv int;
  v_dasar int;
  v_satuan text;
  v_jenis text;
  v_inv_id bigint;
  v_nomor text;
  v_line_id bigint;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_first_tujuan text := '';
  v_harga bigint;
  v_bruto bigint;
  v_total bigint := 0;
  v_custom text;
  v_bon boolean := coalesce(nullif(p->>'bon', '')::boolean, false);
  v_tax_status text;
  v_ket text := '';
begin
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Nota kosong';
  end if;

  v_tax_status := case when v_bon then 'Bon' else 'Lunas' end;

  loop
    v_nomor := 'MNL.' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from invoices where nomor = v_nomor);
  end loop;

  insert into invoices (nomor, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, total)
  values (v_nomor, '', '', 'Manual', coalesce(p->>'kasir', ''), 'Lunas', '-', 0)
  returning id into v_inv_id;

  for v_item in select value from jsonb_array_elements(p->'items')
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    v_jenis := coalesce(v_item->>'jenis', '');
    if v_qty <= 0 or v_jenis not in ('MASUK', 'KELUAR') then
      raise exception 'Baris nota tidak valid';
    end if;
    if v_bon and v_jenis <> 'KELUAR' then
      raise exception 'Bon hanya untuk barang keluar. Pisahkan barang masuk ke nota lain.';
    end if;
    if v_first_tujuan = '' then
      v_first_tujuan := btrim(coalesce(v_item->>'tujuan', ''));
    end if;
    if v_ket = '' then
      v_ket := btrim(coalesce(v_item->>'keterangan', ''));
    end if;

    v_custom := nullif(btrim(coalesce(v_item->>'custom', '')), '');
    if v_custom is not null then
      -- Barang custom: tidak ada di katalog, stok tidak berubah.
      v_satuan := left(coalesce(nullif(btrim(v_item->>'satuan'), ''), 'Item'), 20);
      v_harga := case when v_jenis = 'KELUAR' then greatest(coalesce(nullif(v_item->>'harga', '')::bigint, 0), 0) else 0 end;
      v_bruto := v_harga * v_qty;
      v_total := v_total + v_bruto;
      insert into invoice_lines (
        invoice_id, product_id, custom_item, jenis, jumlah, satuan, jumlah_dasar, harga_satuan,
        part_numbers_alt, merek
      ) values (
        v_inv_id, null, left(v_custom, 200), v_jenis, v_qty, v_satuan, v_qty, v_harga, '', ''
      ) returning id into v_line_id;
      -- Barang custom tidak punya kode pajak, jadi tidak dicatat ke laporan pajak.
      continue;
    end if;

    select * into v_prod from products where id = (v_item->>'productId')::bigint for update;
    if not found then
      raise exception 'Barang tidak ditemukan';
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
    v_harga := case when v_jenis = 'KELUAR' then greatest(coalesce(nullif(v_item->>'harga', '')::bigint, 0), 0) else 0 end;
    v_bruto := v_harga * v_qty;
    v_total := v_total + v_bruto;
    if v_jenis = 'KELUAR' and v_prod.stok < v_dasar then
      raise exception 'Stok % tidak cukup. Tersedia % %', v_prod.nama, v_prod.stok, v_prod.satuan;
    end if;
    insert into invoice_lines (
      invoice_id, product_id, jenis, jumlah, satuan, jumlah_dasar, harga_satuan,
      part_numbers_alt, merek
    ) values (
      v_inv_id, v_prod.id, v_jenis, v_qty, v_satuan, v_dasar, v_harga,
      v_prod.part_numbers_alt, v_prod.merek
    ) returning id into v_line_id;

    update products
    set stok = stok + case when v_jenis = 'MASUK' then v_dasar else -v_dasar end
    where id = v_prod.id;

    if v_jenis = 'KELUAR' then
      v_persen := pajak_persen(v_prod.kategori);
      select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_bruto, v_persen);
      insert into tax_lines (
        line_id, nomor, tanggal, part_number, nama, kategori, merek, kode_pajak,
        status_bayar, pelanggan, jumlah, satuan, harga_satuan, dpp, persentase, nilai_pajak
      ) values (
        v_line_id, v_nomor, coalesce(nullif(p->>'tanggal', '')::timestamptz, now()),
        v_prod.part_number, v_prod.nama, v_prod.kategori, v_prod.merek, v_prod.kode_pajak,
        v_tax_status, coalesce(nullif(btrim(v_item->>'tujuan'), ''), 'Umum'), v_qty, v_satuan, v_harga,
        v_dpp, v_persen, v_pajak
      );
    end if;
  end loop;

  if v_bon then
    if v_first_tujuan = '' or lower(v_first_tujuan) = 'umum' then
      raise exception 'Untuk Bon, wajib isi nama pelanggan';
    end if;
  end if;

  update invoices
  set tujuan = coalesce(nullif(v_first_tujuan, ''), 'Umum'),
      keterangan = case
        when v_bon then 'Bon (Hutang)' || case when v_ket <> '' then ': ' || v_ket else '' end
        else coalesce(nullif(v_ket, ''), 'Transaksi manual')
      end,
      status_bayar = case when v_bon then 'Bon' else 'Lunas' end,
      metode_bayar = case when v_bon then 'Bon' else '-' end,
      total = v_total,
      tanggal = coalesce(nullif(p->>'tanggal', '')::timestamptz, now())
  where id = v_inv_id;

  return jsonb_build_object('nomor', v_nomor, 'bon', v_bon, 'total', v_total);
end;
$$;

-- Pelunasan Bon: sekarang juga untuk nota manual yang dicatat sebagai Bon.
create or replace function shop_payoff(nomor text, actor text) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
begin
  select * into v_inv from invoices
  where invoices.nomor = shop_payoff.nomor
    and (source = 'Kasir' or (source = 'Manual' and metode_bayar = 'Bon'))
  for update;
  if not found then
    raise exception 'Invoice tidak ditemukan';
  end if;
  if v_inv.status_bayar <> 'Bon' then
    raise exception 'Invoice sudah lunas';
  end if;
  if v_inv.total <= 0 then
    raise exception 'Harga Bon masih Rp 0. Edit harga bon dulu sebelum dilunasi.';
  end if;

  update invoices
  set status_bayar = 'Lunas', keterangan = 'Bon (Lunas)', tanggal_lunas = now()
  where id = v_inv.id;

  update tax_lines set status_bayar = 'Lunas' where tax_lines.nomor = v_inv.nomor;

  insert into cash_moves (jenis, jumlah, keterangan, kasir, shift_id)
  values ('MASUK', v_inv.total, 'Pelunasan Bon: ' || v_inv.nomor, coalesce(nullif(v_inv.kasir, ''), actor), null);

  return jsonb_build_object('nomor', v_inv.nomor, 'total', v_inv.total);
end;
$$;

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
      raise exception 'Jumlah barang tidak valid';
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

  select coalesce(sum(harga_satuan * jumlah), 0) into v_total from invoice_lines where invoice_id = v_inv.id;

  update invoices
  set tujuan = v_tujuan, total = v_total
  where id = v_inv.id;
  update tax_lines set pelanggan = v_tujuan where nomor = v_inv.nomor;

  return jsonb_build_object('nomor', v_inv.nomor, 'total', v_total, 'tujuan', v_tujuan);
end;
$$;
