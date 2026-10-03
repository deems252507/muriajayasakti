-- Edit dan hapus penerimaan pemasok. Stok dikembalikan dulu supaya tidak dobel.

create or replace function shop_delete_supplier_receipt(p_id bigint) returns jsonb
language plpgsql
as $$
declare
  v_receipt supplier_receipts%rowtype;
  v_line supplier_receipt_lines%rowtype;
  v_stok int;
  v_nama text;
begin
  select * into v_receipt from supplier_receipts where id = p_id for update;
  if not found then
    raise exception 'Penerimaan pemasok tidak ditemukan';
  end if;

  for v_line in select * from supplier_receipt_lines where receipt_id = p_id for update loop
    select nama into v_nama from products where id = v_line.product_id;
    update products
      set stok = stok - v_line.qty_dasar
      where id = v_line.product_id
      returning stok into v_stok;
    if v_stok is null then
      raise exception 'Barang pada penerimaan ini tidak ditemukan';
    end if;
    if v_stok < 0 then
      raise exception 'Stok % tidak cukup untuk membatalkan penerimaan. Stok sekarang kurang dari qty yang masuk.', coalesce(v_nama, 'barang');
    end if;
  end loop;

  delete from supplier_receipts where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id, 'invoiceNo', v_receipt.invoice_no);
end;
$$;

create or replace function shop_update_supplier_receipt(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_invoice text := btrim(coalesce(p->>'invoiceNo', ''));
  v_supplier bigint := nullif(p->>'supplierId', '')::bigint;
  v_date timestamptz := coalesce(nullif(p->>'receivedAt', '')::timestamptz, now());
  v_notes text := coalesce(p->>'notes', '');
  v_receipt supplier_receipts%rowtype;
  v_line supplier_receipt_lines%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
  v_qty_dasar int;
  v_satuan text;
  v_harga bigint;
  v_stok int;
  v_nama text;
begin
  if v_id is null then raise exception 'Penerimaan tidak ditemukan'; end if;
  select * into v_receipt from supplier_receipts where id = v_id for update;
  if not found then raise exception 'Penerimaan pemasok tidak ditemukan'; end if;
  if v_invoice = '' then raise exception 'Nomor invoice barang masuk wajib diisi'; end if;
  if v_supplier is null then raise exception 'Pemasok wajib dipilih'; end if;
  if not exists (select 1 from partners where id = v_supplier and tipe = 'Supplier') then
    raise exception 'Pemasok tidak ditemukan';
  end if;
  if exists (select 1 from supplier_receipts where lower(invoice_no) = lower(v_invoice) and id <> v_id) then
    raise exception 'Nomor invoice barang masuk sudah digunakan';
  end if;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Minimal satu barang harus dimasukkan';
  end if;

  for v_line in select * from supplier_receipt_lines where receipt_id = v_id for update loop
    select nama into v_nama from products where id = v_line.product_id;
    update products
      set stok = stok - v_line.qty_dasar
      where id = v_line.product_id
      returning stok into v_stok;
    if v_stok is null then
      raise exception 'Barang pada penerimaan ini tidak ditemukan';
    end if;
    if v_stok < 0 then
      raise exception 'Stok % tidak cukup untuk mengubah penerimaan ini.', coalesce(v_nama, 'barang');
    end if;
  end loop;

  delete from supplier_receipt_lines where receipt_id = v_id;

  update supplier_receipts
    set invoice_no = v_invoice,
        supplier_id = v_supplier,
        received_at = v_date,
        notes = v_notes
    where id = v_id;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    select * into v_product from products where id = (v_item->>'productId')::bigint for update;
    if not found then raise exception 'Barang tidak ditemukan'; end if;
    v_qty := greatest(0, floor(coalesce((v_item->>'qty')::numeric, 0)))::int;
    if v_qty <= 0 then raise exception 'Qty barang harus lebih dari 0'; end if;
    v_satuan := coalesce(nullif(v_item->>'satuan', ''), v_product.satuan);
    if v_satuan = v_product.satuan_alt and v_product.isi_satuan_alt > 0 then
      v_qty_dasar := v_qty * v_product.isi_satuan_alt;
    else
      v_qty_dasar := v_qty;
      v_satuan := v_product.satuan;
    end if;
    v_harga := greatest(0, floor(coalesce((v_item->>'hargaBeli')::numeric, 0)))::bigint;
    insert into supplier_receipt_lines (receipt_id, product_id, qty, satuan, qty_dasar, harga_beli)
    values (v_id, v_product.id, v_qty, v_satuan, v_qty_dasar, v_harga);
    update products set stok = stok + v_qty_dasar where id = v_product.id;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'invoiceNo', v_invoice);
end;
$$;
