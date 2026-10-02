create or replace function shop_edit_manual(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_inv invoices%rowtype;
  v_item jsonb;
  v_line invoice_lines%rowtype;
  v_qty int;
  v_jenis text;
  v_konv int;
  v_dasar int;
  v_stok int;
  v_delta int;
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
    if v_qty <= 0 or v_jenis not in ('MASUK', 'KELUAR') then
      raise exception 'Jumlah atau jenis tidak valid';
    end if;
    v_konv := case when v_line.jumlah = 0 then 1 else greatest(v_line.jumlah_dasar / v_line.jumlah, 1) end;
    v_dasar := v_qty * v_konv;
    if v_line.product_id is not null then
      v_delta :=
        (case when v_line.jenis = 'MASUK' then -v_line.jumlah_dasar else v_line.jumlah_dasar end)
        + (case when v_jenis = 'MASUK' then v_dasar else -v_dasar end);
      update products
      set stok = stok + v_delta
      where id = v_line.product_id
      returning stok into v_stok;
      if v_stok < 0 then
        raise exception 'Perubahan membuat stok minus';
      end if;
    end if;
    update invoice_lines
    set jumlah = v_qty, jumlah_dasar = v_dasar, jenis = v_jenis
    where id = v_line.id;
    if v_jenis = 'MASUK' then
      delete from tax_lines where line_id = v_line.id;
    else
      update tax_lines set jumlah = v_qty where line_id = v_line.id;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'nomor', v_inv.nomor);
end;
$$;
