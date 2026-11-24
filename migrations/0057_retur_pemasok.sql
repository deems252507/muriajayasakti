-- 0057: Retur ke Pemasok (retur pembelian).
-- Setiap baris retur menunjuk ke BARIS FAKTUR asalnya (supplier_receipt_lines). Dengan begitu, walau barang baru diretur
-- 2-3 bulan kemudian, sistem tahu persis barang itu dari pemasok mana, faktur mana, dan berapa sisa yang masih boleh diretur.
-- Hanya MENAMBAH tabel/fungsi. Fungsi penerimaan lama tidak diubah.

create table if not exists supplier_returns (
  id bigserial primary key,
  retur_no text not null,
  supplier_id bigint not null references partners(id),
  returned_at timestamptz not null default now(),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_returns_no_lower_uq on supplier_returns (lower(retur_no));
create index if not exists supplier_returns_supplier_idx on supplier_returns (supplier_id, returned_at desc);
create index if not exists supplier_returns_returned_at_idx on supplier_returns (returned_at desc);

create table if not exists supplier_return_counters (
  tahun text primary key,
  terakhir int not null default 0
);

create table if not exists supplier_return_lines (
  id bigserial primary key,
  return_id bigint not null references supplier_returns(id) on delete cascade,
  -- restrict: baris faktur yang sudah pernah diretur tidak bisa terhapus diam-diam (mis. lewat Ubah / Hapus faktur).
  receipt_line_id bigint not null references supplier_receipt_lines(id) on delete restrict,
  product_id bigint not null references products(id),
  qty int not null check (qty > 0),
  satuan text not null default 'Pcs',
  qty_dasar int not null check (qty_dasar > 0),
  -- Harga beli per satuan retur, diambil dari faktur asal (bukan diketik ulang).
  harga_beli bigint not null default 0,
  -- Barang diambil dari mana saat diretur: toko (products.stok) atau gudang (gudang_items.stok).
  dari text not null default 'toko' check (dari in ('toko', 'gudang')),
  alasan text not null default ''
);

create index if not exists supplier_return_lines_return_idx on supplier_return_lines (return_id);
create index if not exists supplier_return_lines_receipt_line_idx on supplier_return_lines (receipt_line_id);
create index if not exists supplier_return_lines_product_idx on supplier_return_lines (product_id);

-- Buat retur. items: [{receiptLineId, qty, satuan, dari, alasan}]
-- Semua dalam satu transaksi: kalau satu baris gagal (qty melebihi sisa, stok kurang), tidak ada yang tersimpan.
create or replace function shop_return_supplier(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_supplier bigint := nullif(p->>'supplierId', '')::bigint;
  v_date timestamptz := coalesce(nullif(p->>'returnedAt', '')::timestamptz, now());
  v_notes text := left(btrim(coalesce(p->>'notes', '')), 500);
  v_by text := coalesce(p->>'createdBy', '');
  v_actor text := coalesce(p->>'actor', '');
  v_year text;
  v_seq int;
  v_no text;
  v_id bigint;
  v_item jsonb;
  v_src supplier_receipt_lines%rowtype;
  v_rec supplier_receipts%rowtype;
  v_prod products%rowtype;
  v_raw numeric;
  v_qty int;
  v_qd int;
  v_satuan text;
  v_factor int;
  v_harga bigint;
  v_dari text;
  v_alasan text;
  v_before int;
  v_max int;
  v_sisa int;
begin
  if v_supplier is null then raise exception 'Pemasok wajib dipilih.'; end if;
  if not exists (select 1 from partners where id = v_supplier and tipe = 'Supplier') then
    raise exception 'Pemasok tidak ditemukan.';
  end if;
  if jsonb_typeof(coalesce(p->'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Minimal satu barang harus diretur.';
  end if;

  -- Nomor otomatis per tahun: RTP-2026-0001. Penghitung tidak pernah mundur, jadi nomor retur yang sudah dihapus
  -- (dan mungkin sudah tercetak) tidak dipakai lagi. Baris penghitung terkunci sampai transaksi selesai, jadi dua Admin bersamaan aman.
  v_year := to_char(v_date at time zone 'Asia/Makassar', 'YYYY');
  insert into supplier_return_counters (tahun, terakhir) values (v_year, 1)
  on conflict (tahun) do update set terakhir = supplier_return_counters.terakhir + 1
  returning terakhir into v_seq;
  v_no := 'RTP-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into supplier_returns (retur_no, supplier_id, returned_at, notes, created_by)
  values (v_no, v_supplier, v_date, v_notes, v_by)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    select * into v_src from supplier_receipt_lines where id = nullif(v_item->>'receiptLineId', '')::bigint for update;
    if not found then raise exception 'Baris faktur asal tidak ditemukan. Mungkin fakturnya sudah diubah atau dihapus.'; end if;
    select * into v_rec from supplier_receipts where id = v_src.receipt_id;
    if v_rec.supplier_id <> v_supplier then
      raise exception 'Barang dari faktur % bukan milik pemasok yang dipilih.', v_rec.invoice_no;
    end if;
    select * into v_prod from products where id = v_src.product_id for update;
    if not found then raise exception 'Barang tidak ditemukan.'; end if;

    v_raw := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    if v_raw <= 0 or v_raw <> floor(v_raw) then
      raise exception 'Qty retur % harus bilangan bulat lebih dari 0.', v_prod.nama;
    end if;
    v_qty := v_raw::int;

    -- Satuan retur: satuan pada faktur (mis. Dus) atau satuan dasar barang (mis. Pcs). Harga ikut faktur asal.
    v_factor := greatest(1, v_src.qty_dasar / greatest(v_src.qty, 1));
    v_satuan := coalesce(nullif(btrim(v_item->>'satuan'), ''), v_src.satuan);
    if v_satuan = v_src.satuan then
      v_qd := v_qty * v_factor;
      v_harga := v_src.harga_beli;
    elsif v_satuan = v_prod.satuan then
      v_qd := v_qty;
      v_harga := round(v_src.harga_beli::numeric / v_factor)::bigint;
    else
      raise exception 'Satuan retur % tidak sesuai dengan faktur % (% atau %).', v_satuan, v_rec.invoice_no, v_src.satuan, v_prod.satuan;
    end if;

    -- Sisa yang boleh diretur = jumlah di faktur - selisih yang sudah dicatat saat penerimaan (tidak pernah masuk stok) - retur sebelumnya.
    select coalesce(sum(qty_dasar), 0)::int into v_before from supplier_return_lines where receipt_line_id = v_src.id;
    v_max := v_src.qty_dasar - v_src.selisih - v_before;
    if v_qd > v_max then
      raise exception 'Retur % melebihi sisa dari faktur %. Dibeli % %, sudah diretur % %, sisa yang boleh diretur % %.',
        v_prod.nama, v_rec.invoice_no, v_src.qty_dasar, v_prod.satuan, v_before, v_prod.satuan, greatest(v_max, 0), v_prod.satuan;
    end if;

    v_dari := case when v_item->>'dari' = 'gudang' then 'gudang' else 'toko' end;
    v_alasan := left(btrim(coalesce(v_item->>'alasan', '')), 200);

    if v_dari = 'gudang' then
      update gudang_items set stok = stok - v_qd, diubah_pada = now()
        where product_id = v_prod.id and stok >= v_qd returning stok into v_sisa;
      if not found then
        select stok into v_sisa from gudang_items where product_id = v_prod.id;
        raise exception 'Stok gudang % tidak cukup untuk diretur (sisa % di gudang).', v_prod.nama, coalesce(v_sisa, 0);
      end if;
      insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama)
      values (v_prod.id, 'KOREKSI', -v_qd, v_sisa, 'base',
              left('Retur ke pemasok ' || v_no || ' (faktur ' || v_rec.invoice_no || ')', 300), v_actor, v_by);
    else
      update products set stok = stok - v_qd where id = v_prod.id and stok >= v_qd returning stok into v_sisa;
      if not found then
        select stok into v_sisa from products where id = v_prod.id;
        raise exception 'Stok toko % tidak cukup untuk diretur (sisa % di toko). Kalau barangnya ada di gudang, pilih "Dari gudang".', v_prod.nama, coalesce(v_sisa, 0);
      end if;
    end if;

    insert into supplier_return_lines (return_id, receipt_line_id, product_id, qty, satuan, qty_dasar, harga_beli, dari, alasan)
    values (v_id, v_src.id, v_prod.id, v_qty, v_satuan, v_qd, v_harga, v_dari, v_alasan);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'returNo', v_no);
end;
$$;

-- Hapus retur: stok dikembalikan ke tempat asal (toko / gudang), lalu sisa retur pada faktur asal bertambah lagi.
create or replace function shop_delete_supplier_return(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_actor text := coalesce(p->>'actor', '');
  v_by text := coalesce(p->>'createdBy', '');
  v_ret supplier_returns%rowtype;
  v_line supplier_return_lines%rowtype;
  v_inv text;
  v_g int;
begin
  if v_id is null then raise exception 'Retur tidak ditemukan.'; end if;
  select * into v_ret from supplier_returns where id = v_id for update;
  if not found then raise exception 'Retur tidak ditemukan.'; end if;

  for v_line in select * from supplier_return_lines where return_id = v_id order by id loop
    select r.invoice_no into v_inv from supplier_receipt_lines l join supplier_receipts r on r.id = l.receipt_id where l.id = v_line.receipt_line_id;
    if v_line.dari = 'gudang' then
      insert into gudang_items (product_id, ditambah_oleh, ditambah_oleh_nama)
      values (v_line.product_id, v_actor, v_by)
      on conflict (product_id) do nothing;
      update gudang_items set stok = stok + v_line.qty_dasar, diubah_pada = now()
        where product_id = v_line.product_id returning stok into v_g;
      insert into gudang_log (product_id, tipe, jumlah, qty_input, satuan_input, catatan, oleh, oleh_nama)
      values (v_line.product_id, 'KOREKSI', v_line.qty_dasar, v_g, 'base',
              left('Retur ' || v_ret.retur_no || ' dibatalkan (faktur ' || coalesce(v_inv, '') || ')', 300), v_actor, v_by);
    else
      update products set stok = stok + v_line.qty_dasar where id = v_line.product_id;
    end if;
  end loop;

  delete from supplier_returns where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'returNo', v_ret.retur_no);
end;
$$;
