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
      if v_harga <= 0 or nullif(trim(coalesce(v_item->>'nama', '')), '') is null then
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
        v_harga := case when coalesce((v_item->>'harga')::bigint, 0) > 0 then (v_item->>'harga')::bigint else v_prod.harga_jual_alt end;
      else
        v_konv := 1;
        v_harga := case when coalesce((v_item->>'harga')::bigint, 0) > 0 then (v_item->>'harga')::bigint else v_prod.harga_jual end;
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
