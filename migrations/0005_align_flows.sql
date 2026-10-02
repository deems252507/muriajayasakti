alter table invoices add column if not exists retur_id text not null default '';

create or replace function shop_delete_retur(p_id text) returns void
language plpgsql
as $$
declare
  v returs%rowtype;
  v_item jsonb;
  v_line invoice_lines%rowtype;
  v_prod products%rowtype;
  v_qty int;
  v_konv int;
  v_dasar int;
  v_stok int;
  v_sisa int;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_ex_id bigint;
begin
  select * into v from returs where id = p_id for update;
  if not found then
    raise exception 'Nota retur tidak ditemukan';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(v.items, '[]'::jsonb))
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 then
      continue;
    end if;
    select * into v_line from invoice_lines where id = (v_item->>'lineId')::bigint for update;
    if not found then
      raise exception 'Baris nota asal retur tidak ditemukan';
    end if;
    if v_line.returned_qty < v_qty then
      raise exception 'Jumlah retur tidak cocok dengan nota asal';
    end if;
    v_konv := case when v_line.jumlah = 0 then 1 else greatest(v_line.jumlah_dasar / v_line.jumlah, 1) end;
    v_dasar := v_qty * v_konv;
    if v_line.product_id is not null then
      update products set stok = stok - v_dasar where id = v_line.product_id returning stok into v_stok;
      if v_stok < 0 then
        raise exception 'Hapus retur membuat stok minus. Barang itu sudah terjual lagi.';
      end if;
    end if;
    update invoice_lines set returned_qty = returned_qty - v_qty where id = v_line.id returning * into v_line;
    v_sisa := greatest(v_line.jumlah - v_line.returned_qty, 0);
    select * into v_prod from products where id = v_line.product_id;
    v_persen := pajak_persen(coalesce(v_prod.kategori, 'Lainnya'));
    select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_line.harga_satuan * v_sisa, v_persen);
    update tax_lines
    set jumlah = v_sisa, dpp = v_dpp, nilai_pajak = v_pajak
    where line_id = v_line.id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v.exchange_items, '[]'::jsonb))
  loop
    v_dasar := coalesce(nullif(v_item->>'dasar', '')::int, coalesce((v_item->>'qty')::int, 0));
    if coalesce(nullif(v_item->>'productId', '')::bigint, 0) <> 0 and v_dasar > 0 then
      update products set stok = stok + v_dasar where id = (v_item->>'productId')::bigint;
    end if;
  end loop;

  delete from tax_lines where nomor = v.id;

  if v.exchange_value > 0 then
    select id into v_ex_id
    from invoices
    where source = 'Retur'
      and parent_invoice = v.parent_invoice
      and (
        retur_id = v.id
        or (
          retur_id = ''
          and total = v.exchange_value
          and tanggal between v.tanggal - interval '8 seconds' and v.tanggal + interval '8 seconds'
        )
      )
    order by case when retur_id = v.id then 0 else 1 end,
             abs(extract(epoch from (tanggal - v.tanggal)))
    limit 1;
    if v_ex_id is not null then
      delete from tax_lines where line_id in (select id from invoice_lines where invoice_id = v_ex_id);
      delete from invoices where id = v_ex_id;
    end if;
  end if;

  delete from returs where id = v.id;
end;
$$;

create or replace function shop_delete_invoice(nomor text) returns void
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_line invoice_lines%rowtype;
  v_stok int;
  v_retur_id text;
begin
  select * into v_inv from invoices where invoices.nomor = shop_delete_invoice.nomor for update;
  if not found then
    raise exception 'Invoice tidak ditemukan';
  end if;

  if v_inv.source = 'Retur' then
    select id into v_retur_id
    from returs
    where id = v_inv.retur_id
       or (
         parent_invoice = v_inv.parent_invoice
         and exchange_value = v_inv.total
         and tanggal between v_inv.tanggal - interval '8 seconds' and v_inv.tanggal + interval '8 seconds'
       )
    order by case when id = v_inv.retur_id then 0 else 1 end
    limit 1;
    if v_retur_id is null then
      raise exception 'Nota tukar tidak terhubung ke retur';
    end if;
    perform shop_delete_retur(v_retur_id);
    return;
  end if;

  for v_retur_id in select id from returs where parent_invoice = v_inv.nomor
  loop
    perform shop_delete_retur(v_retur_id);
  end loop;

  for v_line in select * from invoice_lines where invoice_id = v_inv.id for update
  loop
    if v_line.product_id is not null then
      update products
      set stok = stok + case when v_line.jenis = 'KELUAR' then v_line.jumlah_dasar else -v_line.jumlah_dasar end
      where id = v_line.product_id
      returning stok into v_stok;
      if v_stok < 0 then
        raise exception 'Penghapusan membuat stok minus';
      end if;
    end if;
  end loop;

  delete from tax_lines where tax_lines.nomor = v_inv.nomor;
  delete from cash_moves where keterangan = 'Pelunasan Bon: ' || v_inv.nomor;
  delete from invoices where id = v_inv.id;
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
        select dpp, nilai into v_dpp, v_pajak from tax_dpp(0, v_persen);
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
        update tax_lines set jumlah = v_qty where line_id = v_line.id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'nomor', v_inv.nomor);
end;
$$;

create or replace function shop_retur(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_shift shifts%rowtype;
  v_item jsonb;
  v_line invoice_lines%rowtype;
  v_prod products%rowtype;
  v_qty int;
  v_konv int;
  v_dasar int;
  v_retur bigint := 0;
  v_ex bigint := 0;
  v_net bigint;
  v_direction text;
  v_method text;
  v_bank text;
  v_cash bigint := 0;
  v_transfer bigint := 0;
  v_drawer bigint;
  v_id text;
  v_returns jsonb := '[]'::jsonb;
  v_exchange jsonb := '[]'::jsonb;
  v_built jsonb;
  v_ex_inv bigint;
  v_ex_nomor text;
  v_line_id bigint;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_bruto bigint;
  v_harga bigint;
  v_satuan text;
  v_is_alt boolean;
begin
  select * into v_shift from shifts where id = p->>'shiftId' and status = 'AKTIF' for update;
  if not found then
    raise exception 'Shift belum aktif';
  end if;
  if coalesce(p->>'role', '') = 'Kasir' and v_shift.username <> coalesce(p->>'actor', '') then
    raise exception 'Shift ini bukan milik Anda';
  end if;

  select * into v_inv from invoices where nomor = p->>'invoice' and source = 'Kasir' for update;
  if not found then
    raise exception 'Nota kasir tidak ditemukan';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p->'returns', '[]'::jsonb))
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 then
      continue;
    end if;
    select * into v_line from invoice_lines where id = (v_item->>'lineId')::bigint and invoice_id = v_inv.id for update;
    if not found then
      raise exception 'Baris nota tidak ditemukan';
    end if;
    if v_line.returned_qty + v_qty > v_line.jumlah then
      raise exception 'Jumlah retur melebihi yang terjual';
    end if;
    v_konv := case when v_line.jumlah = 0 then 1 else v_line.jumlah_dasar / v_line.jumlah end;
    v_dasar := v_qty * v_konv;
    if v_line.product_id is not null then
      update products set stok = stok + v_dasar where id = v_line.product_id;
    end if;
    update invoice_lines set returned_qty = returned_qty + v_qty where id = v_line.id;
    v_retur := v_retur + v_line.harga_satuan * v_qty;
    v_built := jsonb_build_object(
      'lineId', v_line.id,
      'nama', coalesce(v_line.custom_item, (select nama from products where id = v_line.product_id), 'Barang'),
      'qty', v_qty,
      'satuan', v_line.satuan,
      'harga', v_line.harga_satuan,
      'subtotal', v_line.harga_satuan * v_qty
    );
    v_returns := v_returns || jsonb_build_array(v_built);

    v_persen := pajak_persen(coalesce((select kategori from products where id = v_line.product_id), 'Lainnya'));
    v_bruto := v_line.harga_satuan * greatest(v_line.jumlah - (v_line.returned_qty + v_qty), 0);
    select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_bruto, v_persen);
    update tax_lines
    set jumlah = greatest(v_line.jumlah - (v_line.returned_qty + v_qty), 0),
        dpp = v_dpp,
        nilai_pajak = v_pajak
    where line_id = v_line.id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p->'exchange', '[]'::jsonb))
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 then
      continue;
    end if;
    select * into v_prod from products where id = (v_item->>'productId')::bigint for update;
    if not found then
      raise exception 'Barang tukar tidak ditemukan';
    end if;
    v_is_alt := coalesce((v_item->>'isAlt')::boolean, false);
    if v_is_alt then
      if v_prod.isi_satuan_alt <= 0 then
        raise exception 'Barang % tidak punya satuan dus', v_prod.nama;
      end if;
      v_konv := v_prod.isi_satuan_alt;
      v_harga := v_prod.harga_jual_alt;
      v_satuan := v_prod.satuan_alt;
    else
      v_konv := 1;
      v_harga := v_prod.harga_jual;
      v_satuan := v_prod.satuan;
    end if;
    v_dasar := v_qty * v_konv;
    if v_prod.stok < v_dasar then
      raise exception 'Stok % tidak cukup untuk ditukar', v_prod.nama;
    end if;
    update products set stok = stok - v_dasar where id = v_prod.id;
    v_ex := v_ex + v_harga * v_qty;
    v_built := jsonb_build_object(
      'productId', v_prod.id,
      'nama', v_prod.nama,
      'qty', v_qty,
      'satuan', v_satuan,
      'harga', v_harga,
      'dasar', v_dasar,
      'subtotal', v_harga * v_qty,
      'kategori', v_prod.kategori,
      'merek', v_prod.merek,
      'kodePajak', v_prod.kode_pajak,
      'partNumber', v_prod.part_number
    );
    v_exchange := v_exchange || jsonb_build_array(v_built);
  end loop;

  if v_retur = 0 and v_ex = 0 then
    raise exception 'Tidak ada barang yang diretur atau ditukar';
  end if;

  v_net := v_retur - v_ex;
  if v_net > 0 then
    v_direction := 'REFUND';
  elsif v_net < 0 then
    v_direction := 'ADDITIONAL_PAYMENT';
  else
    v_direction := 'NONE';
  end if;

  v_method := case when v_direction = 'NONE' then 'Tunai' else coalesce(p->>'metode', 'Tunai') end;
  v_bank := coalesce(p->>'bank', '');
  if v_direction <> 'NONE' and v_method = 'Transfer' and btrim(v_bank) = '' then
    raise exception 'Pilih bank untuk refund atau pembayaran transfer';
  end if;
  if v_method not in ('Tunai', 'Transfer') then
    raise exception 'Metode retur harus tunai atau transfer';
  end if;

  if v_direction = 'REFUND' and v_method = 'Tunai' then
    v_cash := v_net;
    v_drawer := shift_drawer(v_shift.id);
    if v_cash > v_drawer then
      raise exception 'Uang kas di laci tidak cukup untuk refund';
    end if;
  elsif v_direction = 'REFUND' and v_method = 'Transfer' then
    v_transfer := v_net;
  elsif v_direction = 'ADDITIONAL_PAYMENT' and v_method = 'Tunai' then
    v_cash := -v_net;
  elsif v_direction = 'ADDITIONAL_PAYMENT' and v_method = 'Transfer' then
    v_transfer := -v_net;
  end if;

  loop
    v_id := 'RET.' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from returs where id = v_id);
  end loop;

  insert into returs (
    id, parent_invoice, kasir, pelanggan, items, exchange_items, shift_id,
    metode_bayar, bank_transfer, retur_value, exchange_value, net_amount,
    payment_direction, cash_amount, transfer_amount
  ) values (
    v_id, v_inv.nomor, v_shift.cashier_name, v_inv.tujuan, v_returns, v_exchange, v_shift.id,
    v_method, case when v_method = 'Transfer' then v_bank else '' end,
    v_retur, v_ex, v_net, v_direction, v_cash, v_transfer
  );

  if jsonb_array_length(v_exchange) > 0 then
    loop
      v_ex_nomor := 'TUK.' || lpad((floor(random() * 1000000))::int::text, 6, '0');
      exit when not exists (select 1 from invoices where nomor = v_ex_nomor);
    end loop;
    insert into invoices (
      nomor, tujuan, keterangan, source, kasir, shift_id, status_bayar, metode_bayar,
      total, parent_invoice
    ) values (
      v_ex_nomor, v_inv.tujuan, 'Tukar dari ' || v_inv.nomor, 'Retur', v_shift.cashier_name,
      v_shift.id, 'Lunas', 'Tukar', v_ex, v_inv.nomor
    ) returning id into v_ex_inv;
    update invoices set retur_id = v_id where id = v_ex_inv;

    for v_item in select value from jsonb_array_elements(v_exchange)
    loop
      insert into invoice_lines (
        invoice_id, product_id, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, merek
      ) values (
        v_ex_inv, (v_item->>'productId')::bigint, 'KELUAR', (v_item->>'qty')::int,
        v_item->>'satuan', (v_item->>'dasar')::int, (v_item->>'harga')::bigint,
        coalesce(v_item->>'merek', '')
      ) returning id into v_line_id;
      v_persen := pajak_persen(coalesce(v_item->>'kategori', 'Lainnya'));
      v_bruto := (v_item->>'harga')::bigint * (v_item->>'qty')::int;
      select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_bruto, v_persen);
      insert into tax_lines (
        line_id, nomor, tanggal, part_number, nama, kategori, merek, kode_pajak,
        status_bayar, pelanggan, jumlah, satuan, harga_satuan, dpp, persentase, nilai_pajak
      ) values (
        v_line_id, v_id, now(), coalesce(v_item->>'partNumber', ''), v_item->>'nama',
        coalesce(v_item->>'kategori', ''), coalesce(v_item->>'merek', ''),
        coalesce(v_item->>'kodePajak', ''), 'Lunas', v_inv.tujuan,
        (v_item->>'qty')::int, v_item->>'satuan', (v_item->>'harga')::bigint,
        v_dpp, v_persen, v_pajak
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'parent', v_inv.nomor,
    'retur', v_retur,
    'exchange', v_ex,
    'net', v_net,
    'direction', v_direction,
    'metode', v_method,
    'bank', v_bank,
    'customer', v_inv.tujuan,
    'kasir', v_shift.cashier_name,
    'items', v_returns,
    'exchangeItems', v_exchange
  );
end;
$$;
