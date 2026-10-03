create or replace function shop_update_supplier_receipt(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_receipt_id bigint := nullif(p->>'id', '')::bigint;
  v_invoice text := btrim(coalesce(p->>'invoiceNo', ''));
  v_supplier bigint := nullif(p->>'supplierId', '')::bigint;
  v_date timestamptz := coalesce(nullif(p->>'receivedAt', '')::timestamptz, now());
  v_notes text := coalesce(p->>'notes', '');
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
  v_qty_dasar int;
  v_satuan text;
  v_harga bigint;
  v_existing record;
begin
  if v_receipt_id is null then raise exception 'Penerimaan tidak ditemukan'; end if;
  if v_invoice = '' then raise exception 'Nomor invoice barang masuk wajib diisi'; end if;
  if v_supplier is null then raise exception 'Pemasok wajib dipilih'; end if;
  if not exists (select 1 from supplier_receipts where id = v_receipt_id) then
    raise exception 'Penerimaan barang tidak ditemukan';
  end if;
  if not exists (select 1 from partners where id = v_supplier and tipe = 'Supplier') then
    raise exception 'Pemasok tidak ditemukan';
  end if;
  if exists (select 1 from supplier_receipts where lower(invoice_no) = lower(v_invoice) and id <> v_receipt_id) then
    raise exception 'Nomor invoice barang masuk sudah digunakan';
  end if;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Minimal satu barang harus dimasukkan';
  end if;

  -- Lock the receipt and its products first. Every old stock quantity must be available
  -- before we reverse it; this prevents editing/deleting a receipt from creating stock.
  -- negative after the stock has already been consumed by later transactions.
  perform 1 from supplier_receipts where id = v_receipt_id for update;
  for v_existing in
    select l.product_id, sum(l.qty_dasar)::int as qty_dasar
    from supplier_receipt_lines l
    where l.receipt_id = v_receipt_id
    group by l.product_id
  loop
    select * into v_product from products where id = v_existing.product_id for update;
    if not found then raise exception 'Barang pada penerimaan lama tidak ditemukan'; end if;
    if v_product.stok < v_existing.qty_dasar then
      raise exception 'Penerimaan tidak dapat diubah karena stok % sudah terpakai oleh transaksi lain.', v_product.nama;
    end if;
  end loop;

  -- Reverse the old receipt stock and replace its lines atomically.
  update products pr
  set stok = pr.stok - old.qty_dasar
  from (
    select product_id, sum(qty_dasar)::int as qty_dasar
    from supplier_receipt_lines where receipt_id = v_receipt_id group by product_id
  ) old
  where pr.id = old.product_id;

  delete from supplier_receipt_lines where receipt_id = v_receipt_id;
  update supplier_receipts
  set invoice_no = v_invoice, supplier_id = v_supplier, received_at = v_date, notes = v_notes
  where id = v_receipt_id;

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
    values (v_receipt_id, v_product.id, v_qty, v_satuan, v_qty_dasar, v_harga);
    update products set stok = stok + v_qty_dasar where id = v_product.id;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_receipt_id, 'invoiceNo', v_invoice);
end;
$$;

create or replace function shop_delete_supplier_receipt(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_receipt_id bigint := nullif(p->>'id', '')::bigint;
  v_invoice text;
  v_existing record;
  v_product products%rowtype;
begin
  if v_receipt_id is null then raise exception 'Penerimaan tidak ditemukan'; end if;
  select invoice_no into v_invoice from supplier_receipts where id = v_receipt_id for update;
  if v_invoice is null then raise exception 'Penerimaan barang tidak ditemukan'; end if;

  for v_existing in
    select l.product_id, sum(l.qty_dasar)::int as qty_dasar
    from supplier_receipt_lines l
    where l.receipt_id = v_receipt_id
    group by l.product_id
  loop
    select * into v_product from products where id = v_existing.product_id for update;
    if not found then raise exception 'Barang pada penerimaan tidak ditemukan'; end if;
    if v_product.stok < v_existing.qty_dasar then
      raise exception 'Penerimaan % tidak dapat dihapus karena stok % sudah terpakai oleh transaksi lain.', v_invoice, v_product.nama;
    end if;
  end loop;

  update products pr
  set stok = pr.stok - old.qty_dasar
  from (
    select product_id, sum(qty_dasar)::int as qty_dasar
    from supplier_receipt_lines where receipt_id = v_receipt_id group by product_id
  ) old
  where pr.id = old.product_id;

  delete from supplier_receipts where id = v_receipt_id;
  return jsonb_build_object('ok', true, 'invoiceNo', v_invoice);
end;
$$;
