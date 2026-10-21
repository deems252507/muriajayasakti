-- Nota manual: barang KELUAR boleh punya harga jual (tercatat di nota & pajak).
-- Nilai invoice Manual tidak masuk kas/omzet dashboard (semua query kas memfilter source = 'Kasir').

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
begin
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Nota kosong';
  end if;

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
    if v_first_tujuan = '' then
      v_first_tujuan := coalesce(v_item->>'tujuan', '');
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
        'Lunas', coalesce(nullif(v_item->>'tujuan', ''), 'Umum'), v_qty, v_satuan, v_harga,
        v_dpp, v_persen, v_pajak
      );
    end if;
  end loop;

  update invoices
  set tujuan = coalesce(nullif(v_first_tujuan, ''), 'Umum'),
      keterangan = 'Transaksi manual',
      total = v_total,
      tanggal = coalesce(nullif(p->>'tanggal', '')::timestamptz, now())
  where id = v_inv_id;

  return jsonb_build_object('nomor', v_nomor);
end;
$$;

create or replace function shop_edit_manual(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_item jsonb;
  v_line invoice_lines%rowtype;
  v_prod products%rowtype;
  v_qty int;
  v_jenis text;
  v_konv int;
  v_dasar int;
  v_stok int;
  v_delta int;
  v_new_id bigint;
  v_is_alt boolean;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_total bigint;
begin
  select * into v_inv from invoices where nomor = p->>'nomor' and source = 'Manual' for update;
  if not found then
    raise exception 'Nota manual tidak ditemukan';
  end if;

  update invoices
  set tujuan = coalesce(nullif(trim(p->>'tujuan'), ''), tujuan),
      keterangan = coalesce(p->>'keterangan', keterangan)
  where id = v_inv.id;

  for v_item in select value from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    select * into v_line from invoice_lines where id = (v_item->>'id')::bigint and invoice_id = v_inv.id for update;
    if not found then
      raise exception 'Baris nota tidak ditemukan';
    end if;
    v_qty := coalesce((v_item->>'qty')::int, v_line.jumlah);
    v_jenis := coalesce(nullif(v_item->>'jenis', ''), v_line.jenis);
    v_new_id := nullif(v_item->>'productId', '')::bigint;
    v_is_alt := coalesce((v_item->>'isAlt')::boolean, false);
    if v_qty <= 0 or v_jenis not in ('MASUK', 'KELUAR') then
      raise exception 'Jumlah atau jenis tidak valid';
    end if;

    if v_new_id is not null and v_new_id is distinct from v_line.product_id then
      if v_line.product_id is not null then
        v_delta := case when v_line.jenis = 'MASUK' then -v_line.jumlah_dasar else v_line.jumlah_dasar end;
        update products set stok = stok + v_delta where id = v_line.product_id returning stok into v_stok;
        if v_stok < 0 then
          raise exception 'Perubahan membuat stok minus';
        end if;
      end if;
      select * into v_prod from products where id = v_new_id for update;
      if not found then
        raise exception 'Barang pengganti tidak ditemukan';
      end if;
      if v_is_alt then
        if v_prod.isi_satuan_alt <= 0 then
          raise exception 'Barang % tidak punya satuan dus', v_prod.nama;
        end if;
        v_konv := v_prod.isi_satuan_alt;
      else
        v_konv := 1;
      end if;
      v_dasar := v_qty * v_konv;
      update products
      set stok = stok + case when v_jenis = 'MASUK' then v_dasar else -v_dasar end
      where id = v_prod.id
      returning stok into v_stok;
      if v_stok < 0 then
        raise exception 'Stok % tidak cukup', v_prod.nama;
      end if;
      update invoice_lines
      set product_id = v_prod.id,
          jumlah = v_qty,
          satuan = case when v_is_alt then v_prod.satuan_alt else v_prod.satuan end,
          jumlah_dasar = v_dasar,
          jenis = v_jenis,
          merek = v_prod.merek,
          part_numbers_alt = v_prod.part_numbers_alt
      where id = v_line.id;
      if v_jenis = 'MASUK' then
        delete from tax_lines where line_id = v_line.id;
      else
        v_persen := pajak_persen(v_prod.kategori);
        select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_line.harga_satuan * v_qty, v_persen);
        update tax_lines
        set jumlah = v_qty, part_number = v_prod.part_number, nama = v_prod.nama,
            kategori = v_prod.kategori, merek = v_prod.merek, kode_pajak = v_prod.kode_pajak,
            satuan = case when v_is_alt then v_prod.satuan_alt else v_prod.satuan end,
            dpp = v_dpp, persentase = v_persen, nilai_pajak = v_pajak
        where line_id = v_line.id;
      end if;
    else
      v_konv := case when v_line.jumlah = 0 then 1 else greatest(v_line.jumlah_dasar / v_line.jumlah, 1) end;
      v_dasar := v_qty * v_konv;
      if v_line.product_id is not null then
        v_delta :=
          (case when v_line.jenis = 'MASUK' then -v_line.jumlah_dasar else v_line.jumlah_dasar end)
          + (case when v_jenis = 'MASUK' then v_dasar else -v_dasar end);
        update products set stok = stok + v_delta where id = v_line.product_id returning stok into v_stok;
        if v_stok < 0 then
          raise exception 'Perubahan membuat stok minus';
        end if;
      end if;
      update invoice_lines set jumlah = v_qty, jumlah_dasar = v_dasar, jenis = v_jenis where id = v_line.id;
      if v_jenis = 'MASUK' then
        delete from tax_lines where line_id = v_line.id;
      else
        select persentase into v_persen from tax_lines where line_id = v_line.id;
        if v_persen is null then
          select pajak_persen(kategori) into v_persen from products where id = v_line.product_id;
        end if;
        select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_line.harga_satuan * v_qty, coalesce(v_persen, 0));
        update tax_lines set jumlah = v_qty, dpp = v_dpp, nilai_pajak = v_pajak where line_id = v_line.id;
      end if;
    end if;
  end loop;

  select coalesce(sum(harga_satuan * jumlah), 0) into v_total from invoice_lines where invoice_id = v_inv.id and jenis = 'KELUAR';
  update invoices set total = v_total where id = v_inv.id;

  return jsonb_build_object('ok', true, 'nomor', v_inv.nomor);
end;
$$;

