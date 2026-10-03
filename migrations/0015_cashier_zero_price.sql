-- Harga kasir/admin boleh disimpan 0 untuk transaksi fleksibel.
-- Supplier tetap dikelola melalui penerimaan supplier, bukan sebagai pelanggan kasir.
-- Migration ini memperbarui fungsi checkout dan edit nota yang sudah terpasang.

-- Kasir boleh mengubah harga satuan. Stok tetap ikut isi dus.
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
      v_harga := greatest(coalesce((v_item->>'harga')::bigint, 0), 0);
      if v_harga < 0 then
        raise exception 'Harga item tidak boleh negatif';
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
      if v_item ? 'harga' then
        v_harga := greatest(coalesce((v_item->>'harga')::bigint, 0), 0);
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



-- Admin memperbaiki nota kasir yang salah. Stok, pajak, dan uang mengikuti perubahan.
create or replace function shop_edit_sale(p jsonb) returns jsonb
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
  v_sub bigint := 0;
  v_diskon bigint;
  v_total bigint;
  v_metode text;
  v_bank text;
  v_bayar bigint := 0;
  v_transfer bigint := 0;
  v_kembali bigint := 0;
  v_status text;
  v_ket text;
  v_lunas_bon boolean;
  v_is_alt boolean;
  v_persen numeric;
  v_dpp bigint;
  v_pajak bigint;
  v_nama text;
  v_kat text;
  v_part text;
  v_merek text;
  v_kode text;
  v_drawer bigint;
begin
  select * into v_inv from invoices where nomor = p->>'nomor' and source = 'Kasir' for update;
  if not found then
    raise exception 'Nota kasir tidak ditemukan';
  end if;
  if exists (select 1 from returs where parent_invoice = v_inv.nomor) then
    raise exception 'Nota ini sudah ada retur. Hapus retur dulu, baru ubah nota.';
  end if;
  if exists (select 1 from invoice_lines where invoice_id = v_inv.id and returned_qty > 0) then
    raise exception 'Sebagian barang sudah diretur. Hapus retur dulu.';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb))
  loop
    select * into v_line from invoice_lines where id = (v_item->>'id')::bigint and invoice_id = v_inv.id for update;
    if not found then
      raise exception 'Baris nota tidak ditemukan';
    end if;
    v_qty := case when v_item ? 'qty' then coalesce((v_item->>'qty')::int, v_line.jumlah) else v_line.jumlah end;
    v_harga := case when v_item ? 'harga' then greatest(coalesce((v_item->>'harga')::bigint, 0), 0) else v_line.harga_satuan end;
    if v_qty <= 0 then
      if v_line.product_id is not null and v_line.jenis = 'KELUAR' then
        update products set stok = stok + v_line.jumlah_dasar where id = v_line.product_id;
      elsif v_line.product_id is not null and v_line.jenis = 'MASUK' then
        update products set stok = stok - v_line.jumlah_dasar where id = v_line.product_id returning stok into v_stok;
        if v_stok < 0 then
          raise exception 'Penghapusan barang membuat stok minus';
        end if;
      end if;
      delete from invoice_lines where id = v_line.id;
    else
      v_konv := case when v_line.jumlah > 0 then greatest(v_line.jumlah_dasar / v_line.jumlah, 1) else 1 end;
      v_dasar := v_qty * v_konv;
      v_delta := v_dasar - v_line.jumlah_dasar;
      if v_line.product_id is not null and v_delta <> 0 then
        update products
        set stok = stok + case when v_line.jenis = 'KELUAR' then -v_delta else v_delta end
        where id = v_line.product_id
        returning stok into v_stok;
        if v_stok < 0 then
          raise exception 'Stok tidak cukup untuk jumlah yang baru';
        end if;
      end if;
      update invoice_lines
      set jumlah = v_qty, jumlah_dasar = v_dasar, harga_satuan = v_harga
      where id = v_line.id;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p->'add', '[]'::jsonb))
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty <= 0 then
      raise exception 'Jumlah barang tambahan tidak valid';
    end if;
    if nullif(v_item->>'productId', '') is null then
      v_harga := greatest(coalesce((v_item->>'harga')::bigint, 0), 0);
      if v_harga < 0 or nullif(trim(coalesce(v_item->>'nama', '')), '') is null then
        raise exception 'Isi nama dan harga barang tambahan';
      end if;
      insert into invoice_lines (invoice_id, product_id, custom_item, jenis, jumlah, satuan, jumlah_dasar, harga_satuan)
      values (v_inv.id, null, trim(v_item->>'nama'), 'KELUAR', v_qty, 'Item', v_qty, v_harga);
    else
      select * into v_prod from products where id = (v_item->>'productId')::bigint for update;
      if not found then
        raise exception 'Barang tambahan tidak ditemukan';
      end if;
      v_is_alt := coalesce((v_item->>'isAlt')::boolean, false);
      if v_is_alt then
        if v_prod.satuan_alt = '' or v_prod.isi_satuan_alt <= 0 then
          raise exception 'Barang % tidak punya satuan dus', v_prod.nama;
        end if;
        v_konv := v_prod.isi_satuan_alt;
        v_harga := case when v_item ? 'harga' then greatest(coalesce((v_item->>'harga')::bigint, 0), 0) else v_prod.harga_jual_alt end;
      else
        v_konv := 1;
        v_harga := case when v_item ? 'harga' then greatest(coalesce((v_item->>'harga')::bigint, 0), 0) else v_prod.harga_jual end;
      end if;
      v_dasar := v_qty * v_konv;
      if v_prod.stok < v_dasar then
        raise exception 'Stok % tidak cukup', v_prod.nama;
      end if;
      update products set stok = stok - v_dasar where id = v_prod.id;
      insert into invoice_lines (
        invoice_id, product_id, custom_item, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, part_numbers_alt, merek
      ) values (
        v_inv.id, v_prod.id, null, 'KELUAR', v_qty,
        case when v_is_alt then v_prod.satuan_alt else v_prod.satuan end,
        v_dasar, v_harga, v_prod.part_numbers_alt, v_prod.merek
      );
    end if;
  end loop;

  if not exists (select 1 from invoice_lines where invoice_id = v_inv.id) then
    raise exception 'Nota tidak boleh kosong. Hapus nota jika ingin dibatalkan.';
  end if;

  select coalesce(sum(harga_satuan * jumlah), 0) into v_sub from invoice_lines where invoice_id = v_inv.id;
  v_diskon := greatest(coalesce((p->>'diskon')::bigint, v_inv.diskon), 0);
  if v_diskon > v_sub then
    v_diskon := v_sub;
  end if;
  v_total := v_sub - v_diskon;
  v_metode := coalesce(nullif(trim(p->>'metode'), ''), v_inv.metode_bayar);
  v_bank := coalesce(nullif(trim(p->>'bank'), ''), v_inv.bank_transfer);
  v_lunas_bon := v_inv.keterangan = 'Bon (Lunas)';

  if v_metode = 'Bon' then
    v_bayar := 0;
    v_kembali := 0;
    v_transfer := 0;
    v_bank := '';
    if v_lunas_bon then
      v_status := 'Lunas';
      v_ket := 'Bon (Lunas)';
      update cash_moves set jumlah = v_total where keterangan = 'Pelunasan Bon: ' || v_inv.nomor;
    else
      v_status := 'Bon';
      v_ket := 'Bon (Hutang)';
    end if;
  elsif v_metode = 'Tunai' then
    v_bayar := coalesce((p->>'bayarTunai')::bigint, v_total);
    if v_bayar < v_total then
      raise exception 'Uang tunai kurang dari total baru';
    end if;
    v_kembali := v_bayar - v_total;
    v_transfer := 0;
    v_bank := '';
    v_status := 'Lunas';
    v_ket := 'Penjualan Kasir';
  elsif v_metode = 'Transfer' then
    if btrim(v_bank) = '' then
      raise exception 'Pilih bank / rekening tujuan';
    end if;
    v_bayar := 0;
    v_kembali := 0;
    v_transfer := v_total;
    v_status := 'Lunas';
    v_ket := 'Penjualan Kasir';
  elsif v_metode = 'Split' then
    v_bayar := coalesce((p->>'bayarTunai')::bigint, 0);
    if v_bayar <= 0 or v_bayar >= v_total then
      raise exception 'Nominal tunai split harus lebih kecil dari total';
    end if;
    if btrim(v_bank) = '' then
      raise exception 'Pilih bank / rekening tujuan';
    end if;
    v_kembali := 0;
    v_transfer := v_total - v_bayar;
    v_status := 'Lunas';
    v_ket := 'Penjualan Kasir';
  else
    raise exception 'Metode bayar tidak dikenal';
  end if;

  if v_lunas_bon and v_metode <> 'Bon' then
    delete from cash_moves where keterangan = 'Pelunasan Bon: ' || v_inv.nomor;
  end if;

  update invoices set
    tujuan = coalesce(nullif(trim(p->>'tujuan'), ''), tujuan),
    keterangan = v_ket,
    status_bayar = v_status,
    metode_bayar = v_metode,
    bank_transfer = v_bank,
    bayar_tunai = v_bayar,
    transfer_amount = v_transfer,
    kembalian = v_kembali,
    diskon = v_diskon,
    total = v_total,
    tanggal_lunas = case when v_status = 'Bon' then null when tanggal_lunas is not null then tanggal_lunas else now() end
  where id = v_inv.id;

  if v_inv.shift_id is not null then
    v_drawer := shift_drawer(v_inv.shift_id);
    if v_drawer < 0 then
      raise exception 'Perubahan ini membuat uang laci minus. Sesuaikan uang diterima atau metode bayar.';
    end if;
  end if;

  delete from tax_lines where nomor = v_inv.nomor;
  for v_line in select * from invoice_lines where invoice_id = v_inv.id
  loop
    v_nama := coalesce(v_line.custom_item, 'Barang');
    v_kat := 'Lainnya';
    v_part := '';
    v_merek := '';
    v_kode := '';
    if v_line.product_id is not null then
      select nama, kategori, coalesce(part_number, ''), coalesce(merek, ''), coalesce(kode_pajak, '')
      into v_nama, v_kat, v_part, v_merek, v_kode
      from products where id = v_line.product_id;
    end if;
    v_persen := pajak_persen(coalesce(v_kat, 'Lainnya'));
    select dpp, nilai into v_dpp, v_pajak from tax_dpp(v_line.harga_satuan * v_line.jumlah, v_persen);
    insert into tax_lines (
      line_id, nomor, tanggal, part_number, nama, kategori, merek, kode_pajak,
      status_bayar, pelanggan, jumlah, satuan, harga_satuan, dpp, persentase, nilai_pajak
    ) values (
      v_line.id, v_inv.nomor, v_inv.tanggal, v_part,
      coalesce(v_nama, 'Barang'), coalesce(v_kat, 'Lainnya'), v_merek, v_kode,
      v_status, coalesce(nullif(trim(p->>'tujuan'), ''), v_inv.tujuan),
      v_line.jumlah, v_line.satuan, v_line.harga_satuan, v_dpp, v_persen, v_pajak
    );
  end loop;

  return jsonb_build_object('nomor', v_inv.nomor, 'total', v_total, 'status', v_status);
end;
$$;
