-- Riwayat harga: sumber perubahan dicatat langsung (ID penerimaan + salinan nama pemasok & invoice),
-- tidak lagi ditebak dari kesamaan waktu. Dengan begitu perubahan lewat "Ubah Barang Masuk Pemasok"
-- juga tampil sebagai penerimaan pemasok, bukan "Perubahan manual".

alter table product_price_history
  add column if not exists receipt_id bigint references supplier_receipts(id) on delete set null,
  add column if not exists receipt_invoice text,
  add column if not exists receipt_supplier text,
  add column if not exists receipt_edit boolean not null default false;

create or replace function trg_product_price_history() returns trigger
language plpgsql
as $$
declare
  v_rid bigint := nullif(current_setting('shop.receipt_id', true), '')::bigint;
  v_edit boolean := coalesce(nullif(current_setting('shop.receipt_edit', true), '')::boolean, false);
  v_inv text;
  v_sup text;
begin
  if v_rid is not null then
    select r.invoice_no, p.nama into v_inv, v_sup
    from supplier_receipts r join partners p on p.id = r.supplier_id
    where r.id = v_rid;
    if v_inv is null then v_rid := null; end if;
  end if;
  if tg_op = 'INSERT' then
    insert into product_price_history (product_id, harga_beli, harga_jual, harga_jual_alt, awal)
    values (new.id, coalesce(new.harga_beli, 0), coalesce(new.harga_jual, 0), coalesce(new.harga_jual_alt, 0), true);
  elsif coalesce(new.harga_beli, 0) is distinct from coalesce(old.harga_beli, 0)
     or coalesce(new.harga_jual, 0) is distinct from coalesce(old.harga_jual, 0)
     or coalesce(new.harga_jual_alt, 0) is distinct from coalesce(old.harga_jual_alt, 0) then
    insert into product_price_history (product_id, harga_beli, harga_jual, harga_jual_alt, awal,
                                       receipt_id, receipt_invoice, receipt_supplier, receipt_edit)
    values (new.id, coalesce(new.harga_beli, 0), coalesce(new.harga_jual, 0), coalesce(new.harga_jual_alt, 0), false,
            v_rid, v_inv, v_sup, v_rid is not null and v_edit);
  end if;
  return new;
end;
$$;

-- Isi ulang riwayat lama yang waktunya persis sama dengan waktu penerimaan dibuat.
update product_price_history h
set receipt_id = r.id, receipt_invoice = r.invoice_no, receipt_supplier = p.nama
from supplier_receipts r
join partners p on p.id = r.supplier_id
where h.receipt_id is null and not h.awal and r.created_at = h.tanggal
  and exists (select 1 from supplier_receipt_lines l where l.receipt_id = r.id and l.product_id = h.product_id);

-- Fungsi simpan & ubah penerimaan menandai penerimaan aktif selama transaksi berjalan.
create or replace function shop_receive_supplier(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_invoice text := btrim(coalesce(p->>'invoiceNo', ''));
  v_supplier bigint := nullif(p->>'supplierId', '')::bigint;
  v_date timestamptz := coalesce(nullif(p->>'receivedAt', '')::timestamptz, now());
  v_notes text := coalesce(p->>'notes', '');
  v_created_by text := coalesce(p->>'createdBy', '');
  v_receipt_id bigint;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
  v_qty_dasar int;
  v_satuan text;
  v_harga bigint;
  v_jual bigint;
begin
  if v_invoice = '' then raise exception 'Nomor invoice barang masuk wajib diisi'; end if;
  if v_supplier is null then raise exception 'Pemasok wajib dipilih'; end if;
  if not exists (select 1 from partners where id = v_supplier and tipe = 'Supplier') then
    raise exception 'Pemasok tidak ditemukan';
  end if;
  if exists (select 1 from supplier_receipts where lower(invoice_no) = lower(v_invoice)) then
    raise exception 'Nomor invoice barang masuk sudah digunakan';
  end if;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Minimal satu barang harus dimasukkan';
  end if;

  insert into supplier_receipts (invoice_no, supplier_id, received_at, notes, created_by)
  values (v_invoice, v_supplier, v_date, v_notes, v_created_by)
  returning id into v_receipt_id;
  perform set_config('shop.receipt_id', v_receipt_id::text, true);
  perform set_config('shop.receipt_edit', 'false', true);

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
    v_jual := greatest(0, floor(coalesce((v_item->>'hargaJual')::numeric, 0)))::bigint;
    insert into supplier_receipt_lines (receipt_id, product_id, qty, satuan, qty_dasar, harga_beli)
    values (v_receipt_id, v_product.id, v_qty, v_satuan, v_qty_dasar, v_harga);
    update products set stok = stok + v_qty_dasar where id = v_product.id;
    -- Harga jual dari form ikut disimpan ke master barang (kosong/0 = tidak diubah).
    -- Satuan dus -> harga_jual_alt, satuan dasar -> harga_jual.
    if v_jual > 0 then
      if v_satuan = v_product.satuan_alt and v_product.isi_satuan_alt > 0 then
        update products set harga_jual_alt = v_jual where id = v_product.id;
      else
        update products set harga_jual = v_jual where id = v_product.id;
      end if;
    end if;
  end loop;

  perform set_config('shop.receipt_id', '', true);
  perform set_config('shop.receipt_edit', '', true);
  return jsonb_build_object('ok', true, 'id', v_receipt_id, 'invoiceNo', v_invoice);
exception when others then
  raise;
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
  v_jual bigint;
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

  perform set_config('shop.receipt_id', v_id::text, true);
  perform set_config('shop.receipt_edit', 'true', true);

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
    v_jual := greatest(0, floor(coalesce((v_item->>'hargaJual')::numeric, 0)))::bigint;
    insert into supplier_receipt_lines (receipt_id, product_id, qty, satuan, qty_dasar, harga_beli)
    values (v_id, v_product.id, v_qty, v_satuan, v_qty_dasar, v_harga);
    update products set stok = stok + v_qty_dasar where id = v_product.id;
    -- Harga jual dari form ikut disimpan ke master barang (kosong/0 = tidak diubah).
    -- Satuan dus -> harga_jual_alt, satuan dasar -> harga_jual.
    if v_jual > 0 then
      if v_satuan = v_product.satuan_alt and v_product.isi_satuan_alt > 0 then
        update products set harga_jual_alt = v_jual where id = v_product.id;
      else
        update products set harga_jual = v_jual where id = v_product.id;
      end if;
    end if;
  end loop;

  perform set_config('shop.receipt_id', '', true);
  perform set_config('shop.receipt_edit', '', true);
  return jsonb_build_object('ok', true, 'id', v_id, 'invoiceNo', v_invoice);
end;
$$;
