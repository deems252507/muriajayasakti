create index if not exists products_part_number_lower_idx on products (lower(part_number));

create or replace function shop_import(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_row jsonb;
  v_id bigint;
  v_pn text;
  v_nama text;
  v_n int;
  v_created int := 0;
  v_updated int := 0;
  v_replace boolean := coalesce((p->>'replaceStock')::boolean, false);
begin
  if jsonb_typeof(p->'rows') <> 'array' then
    return jsonb_build_object('created', 0, 'updated', 0);
  end if;

  select coalesce(max((substring(kode from 4))::int), 0)
    into v_n
  from products
  where kode ~ '^SP-[0-9]+$';

  for v_row in select value from jsonb_array_elements(p->'rows')
  loop
    v_pn := btrim(coalesce(v_row->>'partNumber', ''));
    v_nama := btrim(coalesce(v_row->>'nama', ''));
    if v_pn = '' and v_nama = '' then
      continue;
    end if;

    v_id := null;
    if v_pn <> '' then
      select id into v_id
      from products
      where lower(part_number) = lower(v_pn)
      limit 1;
    end if;

    if v_id is not null then
      update products set
        nama = case when v_nama <> '' then v_nama else nama end,
        kategori = coalesce(nullif(btrim(v_row->>'kategori'), ''), kategori),
        merek = coalesce(nullif(btrim(v_row->>'merek'), ''), merek),
        satuan = coalesce(nullif(btrim(v_row->>'satuan'), ''), satuan),
        harga_jual = coalesce((v_row->>'harga')::bigint, harga_jual),
        harga_beli = case when coalesce((v_row->>'hargaBeli')::bigint, 0) > 0 then (v_row->>'hargaBeli')::bigint else harga_beli end,
        satuan_alt = coalesce(v_row->>'satuanAlt', satuan_alt),
        isi_satuan_alt = coalesce((v_row->>'isiAlt')::int, isi_satuan_alt),
        harga_jual_alt = coalesce((v_row->>'hargaAlt')::bigint, harga_jual_alt),
        pajak_status = coalesce(nullif(btrim(v_row->>'status'), ''), pajak_status),
        kode_pajak = coalesce(v_row->>'kodePajak', kode_pajak),
        stok = case when v_replace then coalesce((v_row->>'stok')::int, stok) else stok end
      where id = v_id;
      v_updated := v_updated + 1;
    else
      v_n := v_n + 1;
      insert into products (
        kode, part_number, nama, kategori, merek, satuan, stok, harga_beli, harga_jual,
        satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak
      ) values (
        'SP-' || lpad(v_n::text, 4, '0'),
        v_pn,
        coalesce(nullif(v_nama, ''), v_pn),
        coalesce(nullif(btrim(v_row->>'kategori'), ''), 'Umum'),
        coalesce(v_row->>'merek', ''),
        coalesce(nullif(btrim(v_row->>'satuan'), ''), 'Pcs'),
        coalesce((v_row->>'stok')::int, 0),
        coalesce((v_row->>'hargaBeli')::bigint, 0),
        coalesce((v_row->>'harga')::bigint, 0),
        coalesce(v_row->>'satuanAlt', ''),
        coalesce((v_row->>'isiAlt')::int, 0),
        coalesce((v_row->>'hargaAlt')::bigint, 0),
        coalesce(nullif(btrim(v_row->>'status'), ''), 'Non Pajak'),
        coalesce(v_row->>'kodePajak', '')
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;
