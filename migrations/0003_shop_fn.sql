create or replace function pajak_persen(kat text) returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select persentase
      from master_pajak
      where aktif
        and lower(coalesce(kat, '')) like '%' || lower(jenis) || '%'
        and jenis <> 'Lainnya'
      order by id
      limit 1
    ),
    (select persentase from master_pajak where jenis = 'Lainnya'),
    11
  );
$$;

create or replace function shop_checkout(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_shift shifts%rowtype;
  v_item jsonb;
  v_prod products%rowtype;
  v_qty int;
  v_konv int;
  v_dasar int;
  v_harga bigint;
  v_is_alt boolean;
  v_custom text;
  v_subtotal bigint := 0;
  v_diskon bigint;
  v_total bigint;
  v_metode text;
  v_bayar bigint;
  v_kembali bigint := 0;
  v_transfer bigint := 0;
  v_status text;
  v_bank text;
  v_customer text;
  v_inv_id bigint;
  v_nomor text;
  v_drawer bigint;
  v_line_id bigint;
  v_persen numeric;
  v_bruto bigint;
  v_dpp bigint;
  v_pajak bigint;
  v_satuan text;
  v_lines jsonb := '[]'::jsonb;
  v_built jsonb;
  v_kategori text;
begin
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then
    raise exception 'Keranjang kosong';
  end if;

  select * into v_shift from shifts where id = p->>'shiftId' and status = 'AKTIF' for update;
  if not found then
    raise exception 'Shift belum aktif';
  end if;
  if coalesce(p->>'role', '') = 'Kasir' and v_shift.username <> coalesce(p->>'actor', '') then
    raise exception 'Shift ini bukan milik Anda';
  end if;

  v_customer := coalesce(nullif(trim(p->>'customer'), ''), 'Umum');
  v_metode := coalesce(p->>'metode', '');
  v_bank := coalesce(p->>'bank', '');
  v_diskon := greatest(coalesce((p->>'diskon')::bigint, 0), 0);
  v_bayar := greatest(coalesce((p->>'bayarTunai')::bigint, 0), 0);

  if v_metode = 'Bon' and v_customer = 'Umum' then
    raise exception 'Untuk transaksi Bon, wajib pilih nama pelanggan';
  end if;
  if v_metode in ('Transfer', 'Split') and btrim(v_bank) = '' then
    raise exception 'Pilih bank / rekening tujuan';
  end if;

  for v_item in select value from jsonb_array_elements(p->'items')
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 or v_qty > 100000 then
      raise exception 'Jumlah barang tidak valid';
    end if;
    v_custom := nullif(btrim(coalesce(v_item->>'custom', '')), '');
    if v_custom is not null then
      v_harga := coalesce((v_item->>'harga')::bigint, 0);
      if v_harga <= 0 then
        raise exception 'Isi nama dan harga item';
      end if;
      v_built := jsonb_build_object(
        'productId', null,
        'custom', v_custom,
        'nama', v_custom,
        'qty', v_qty,
        'satuan', 'Item',
        'konv', 1,
        'dasar', v_qty,
        'harga', v_harga,
        'partNumber', 'CUSTOM',
        'merek', 'Jasa',
        'kodePajak', '',
        'kategori', 'Lainnya',
        'alt', ''
      );
      v_subtotal := v_subtotal + v_harga * v_qty;
    else
      select * into v_prod from products where id = (v_item->>'productId')::bigint for update;
      if not found then
        raise exception 'Barang tidak ditemukan';
      end if;
      v_is_alt := coalesce((v_item->>'isAlt')::boolean, false);
      if v_is_alt then
        if v_prod.satuan_alt = '' or v_prod.isi_satuan_alt <= 0 then
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
        raise exception 'Stok % tidak cukup. Diminta % Pcs, tersedia %', v_prod.nama, v_dasar, v_prod.stok;
      end if;
      v_built := jsonb_build_object(
        'productId', v_prod.id,
        'custom', null,
        'nama', v_prod.nama,
        'qty', v_qty,
        'satuan', v_satuan,
        'konv', v_konv,
        'dasar', v_dasar,
        'harga', v_harga,
        'partNumber', v_prod.part_number,
        'merek', v_prod.merek,
        'kodePajak', v_prod.kode_pajak,
        'kategori', v_prod.kategori,
        'alt', v_prod.part_numbers_alt
      );
      v_subtotal := v_subtotal + v_harga * v_qty;
    end if;
    v_lines := v_lines || jsonb_build_array(v_built);
  end loop;

  v_total := greatest(v_subtotal - v_diskon, 0);

  if v_metode = 'Tunai' then
    if v_bayar < v_total then
      raise exception 'Uang tunai kurang';
    end if;
    v_kembali := v_bayar - v_total;
    v_transfer := 0;
    v_drawer := shift_drawer(v_shift.id);
    if v_kembali > v_drawer then
      raise exception 'Uang kas di laci tidak cukup untuk kembalian';
    end if;
    v_status := 'Lunas';
  elsif v_metode = 'Transfer' then
    v_bayar := 0;
    v_kembali := 0;
    v_transfer := v_total;
    v_status := 'Lunas';
  elsif v_metode = 'Split' then
    if v_bayar <= 0 or v_bayar >= v_total then
      raise exception 'Nominal split tidak valid';
    end if;
    v_kembali := 0;
    v_transfer := v_total - v_bayar;
    v_status := 'Lunas';
  elsif v_metode = 'Bon' then
    v_bayar := 0;
    v_kembali := 0;
    v_transfer := 0;
    v_status := 'Bon';
    v_bank := '';
  else
    raise exception 'Metode bayar tidak dikenal';
  end if;

  loop
    v_nomor := 'INV.' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from invoices where nomor = v_nomor);
  end loop;

  insert into invoices (
    nomor, tujuan, keterangan, source, kasir, shift_id, status_bayar, metode_bayar,
    bank_transfer, bayar_tunai, transfer_amount, kembalian, diskon, total
  ) values (
    v_nomor, v_customer,
    case when v_status = 'Bon' then 'Bon (Hutang)' else 'Penjualan Kasir' end,
    'Kasir', v_shift.cashier_name, v_shift.id, v_status, v_metode,
    case when v_metode in ('Transfer', 'Split') then v_bank else '' end,
    v_bayar, v_transfer, v_kembali, v_diskon, v_total
  ) returning id into v_inv_id;

  for v_item in select value from jsonb_array_elements(v_lines)
  loop
    insert into invoice_lines (
      invoice_id, product_id, custom_item, jenis, jumlah, satuan, jumlah_dasar,
      harga_satuan, part_numbers_alt, merek
    ) values (
      v_inv_id,
      nullif(v_item->>'productId', '')::bigint,
      nullif(v_item->>'custom', ''),
      'KELUAR',
      (v_item->>'qty')::int,
      v_item->>'satuan',
      (v_item->>'dasar')::int,
      (v_item->>'harga')::bigint,
      coalesce(v_item->>'alt', ''),
      coalesce(v_item->>'merek', '')
    ) returning id into v_line_id;

    if nullif(v_item->>'productId', '') is not null then
      update products
      set stok = stok - (v_item->>'dasar')::int
      where id = (v_item->>'productId')::bigint;
    end if;

    v_kategori := coalesce(nullif(v_item->>'kategori', ''), 'Lainnya');
    v_persen := pajak_persen(v_kategori);
    v_bruto := (v_item->>'harga')::bigint * (v_item->>'qty')::int;
    select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_bruto, v_persen);
    insert into tax_lines (
      line_id, nomor, tanggal, part_number, nama, kategori, merek, kode_pajak,
      status_bayar, pelanggan, jumlah, satuan, harga_satuan, dpp, persentase, nilai_pajak
    ) values (
      v_line_id, v_nomor, now(), coalesce(v_item->>'partNumber', ''),
      coalesce(v_item->>'nama', ''), v_kategori, coalesce(v_item->>'merek', ''),
      coalesce(v_item->>'kodePajak', ''), v_status, v_customer,
      (v_item->>'qty')::int, v_item->>'satuan', (v_item->>'harga')::bigint,
      v_dpp, v_persen, v_pajak
    );
  end loop;

  return jsonb_build_object(
    'nomor', v_nomor,
    'total', v_total,
    'subtotal', v_subtotal,
    'diskon', v_diskon,
    'bayarTunai', v_bayar,
    'kembalian', v_kembali,
    'transfer', v_transfer,
    'status', v_status,
    'metode', v_metode,
    'bank', v_bank,
    'customer', v_customer,
    'kasir', v_shift.cashier_name,
    'lines', v_lines
  );
end;
$$;

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
      v_inv_id, v_prod.id, v_jenis, v_qty, v_satuan, v_dasar, 0,
      v_prod.part_numbers_alt, v_prod.merek
    ) returning id into v_line_id;

    update products
    set stok = stok + case when v_jenis = 'MASUK' then v_dasar else -v_dasar end
    where id = v_prod.id;

    if v_jenis = 'KELUAR' then
      v_persen := pajak_persen(v_prod.kategori);
      select dpp, nilai into v_dpp, v_pajak from tax_dpp(0, v_persen);
      insert into tax_lines (
        line_id, nomor, tanggal, part_number, nama, kategori, merek, kode_pajak,
        status_bayar, pelanggan, jumlah, satuan, harga_satuan, dpp, persentase, nilai_pajak
      ) values (
        v_line_id, v_nomor, coalesce(nullif(p->>'tanggal', '')::timestamptz, now()),
        v_prod.part_number, v_prod.nama, v_prod.kategori, v_prod.merek, v_prod.kode_pajak,
        'Lunas', coalesce(nullif(v_item->>'tujuan', ''), 'Umum'), v_qty, v_satuan, 0,
        v_dpp, v_persen, v_pajak
      );
    end if;
  end loop;

  update invoices
  set tujuan = coalesce(nullif(v_first_tujuan, ''), 'Umum'),
      keterangan = 'Transaksi manual',
      tanggal = coalesce(nullif(p->>'tanggal', '')::timestamptz, now())
  where id = v_inv_id;

  return jsonb_build_object('nomor', v_nomor);
end;
$$;

create or replace function shop_payoff(nomor text, actor text) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
begin
  select * into v_inv from invoices where invoices.nomor = shop_payoff.nomor and source = 'Kasir' for update;
  if not found then
    raise exception 'Invoice tidak ditemukan';
  end if;
  if v_inv.status_bayar <> 'Bon' then
    raise exception 'Invoice sudah lunas';
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

create or replace function shop_edit_bon(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_item jsonb;
  v_line invoice_lines%rowtype;
  v_sub bigint := 0;
  v_diskon bigint;
  v_total bigint;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_bruto bigint;
  v_prod products%rowtype;
begin
  select * into v_inv from invoices where nomor = p->>'nomor' and source = 'Kasir' for update;
  if not found then
    raise exception 'Invoice tidak ditemukan';
  end if;
  if v_inv.status_bayar <> 'Bon' then
    raise exception 'Hanya bon yang belum lunas yang bisa diubah';
  end if;

  for v_item in select value from jsonb_array_elements(p->'items')
  loop
    select * into v_line from invoice_lines where id = (v_item->>'id')::bigint and invoice_id = v_inv.id for update;
    if not found then
      raise exception 'Baris struk tidak ditemukan';
    end if;
    update invoice_lines
    set harga_satuan = greatest(coalesce((v_item->>'harga')::bigint, 0), 0)
    where id = v_line.id;
  end loop;

  select coalesce(sum(harga_satuan * jumlah), 0) into v_sub from invoice_lines where invoice_id = v_inv.id;
  v_diskon := greatest(coalesce((p->>'diskon')::bigint, 0), 0);
  if v_diskon > v_sub then
    v_diskon := v_sub;
  end if;
  v_total := v_sub - v_diskon;
  update invoices set diskon = v_diskon, total = v_total where id = v_inv.id;

  for v_line in select * from invoice_lines where invoice_id = v_inv.id
  loop
    v_persen := pajak_persen(coalesce((select kategori from products where id = v_line.product_id), 'Lainnya'));
    v_bruto := v_line.harga_satuan * greatest(v_line.jumlah - v_line.returned_qty, 0);
    select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_bruto, v_persen);
    update tax_lines
    set harga_satuan = v_line.harga_satuan,
        jumlah = greatest(v_line.jumlah - v_line.returned_qty, 0),
        dpp = v_dpp,
        nilai_pajak = v_pajak,
        persentase = v_persen
    where line_id = v_line.id;
  end loop;

  return jsonb_build_object('nomor', v_inv.nomor, 'total', v_total);
end;
$$;

create or replace function shop_delete_invoice(nomor text) returns void
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_line invoice_lines%rowtype;
  v_stok int;
begin
  select * into v_inv from invoices where invoices.nomor = shop_delete_invoice.nomor for update;
  if not found then
    raise exception 'Invoice tidak ditemukan';
  end if;
  if exists (select 1 from returs where parent_invoice = v_inv.nomor) then
    raise exception 'Invoice ini sudah ada retur. Hapus retur dulu belum didukung; jangan dihapus.';
  end if;

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
