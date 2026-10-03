create table if not exists supplier_receipts (
  id bigserial primary key,
  invoice_no text not null unique,
  supplier_id bigint not null references partners(id),
  received_at timestamptz not null default now(),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_receipts_invoice_no_lower_uq on supplier_receipts (lower(invoice_no));
create index if not exists supplier_receipts_supplier_idx on supplier_receipts (supplier_id, received_at desc);
create index if not exists supplier_receipts_received_at_idx on supplier_receipts (received_at desc);

create table if not exists supplier_receipt_lines (
  id bigserial primary key,
  receipt_id bigint not null references supplier_receipts(id) on delete cascade,
  product_id bigint not null references products(id),
  qty int not null check (qty > 0),
  satuan text not null default 'Pcs',
  qty_dasar int not null check (qty_dasar > 0),
  harga_beli bigint not null default 0
);

create index if not exists supplier_receipt_lines_receipt_idx on supplier_receipt_lines (receipt_id);
create index if not exists supplier_receipt_lines_product_idx on supplier_receipt_lines (product_id);

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
exception when others then
  raise;
end;
$$;
