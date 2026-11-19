-- Terapkan ke Stok: untuk pemeriksaan yang dicatat saat sinkron otomatis nonaktif.
-- Stok hanya ditulis jika catatan itu pemeriksaan terakhir barang dan stok belum berubah sejak itu.

alter table stock_opname_logs add column if not exists diterapkan_pada timestamptz;
alter table stock_opname_logs add column if not exists diterapkan_oleh text not null default '';

create or replace function shop_opname_apply(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint;
  v_actor text := coalesce(p->>'actor', '');
  v_log stock_opname_logs%rowtype;
  v_prod products%rowtype;
  v_latest bigint;
  v_sesudah int;
begin
  if coalesce(p->>'logId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Catatan tidak valid.';
  end if;
  v_id := (p->>'logId')::bigint;

  select * into v_log from stock_opname_logs where id = v_id;
  if not found then
    return jsonb_build_object('ok', false, 'alasan', 'tidak_ditemukan');
  end if;
  if v_log.product_id is null then
    return jsonb_build_object('ok', false, 'alasan', 'barang_hilang');
  end if;

  select * into v_prod from products where id = v_log.product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'alasan', 'barang_hilang');
  end if;

  -- baca ulang setelah barang terkunci (klik ganda tidak menerapkan dua kali)
  select * into v_log from stock_opname_logs where id = v_id;
  if not found then
    return jsonb_build_object('ok', false, 'alasan', 'tidak_ditemukan');
  end if;
  if v_log.disesuaikan then
    return jsonb_build_object('ok', false, 'alasan', 'sudah_diterapkan', 'nama', v_log.nama);
  end if;
  if v_log.selisih = 0 then
    return jsonb_build_object('ok', false, 'alasan', 'tidak_ada_selisih', 'nama', v_log.nama);
  end if;

  select id into v_latest from stock_opname_logs
    where product_id = v_log.product_id order by dicek_pada desc, id desc limit 1;
  if v_latest is distinct from v_log.id then
    return jsonb_build_object('ok', false, 'alasan', 'bukan_terbaru', 'nama', v_log.nama);
  end if;
  if v_prod.stok <> v_log.stok_sesudah then
    return jsonb_build_object('ok', false, 'alasan', 'stok_berubah', 'nama', v_log.nama, 'stokSekarang', v_prod.stok);
  end if;

  perform set_config('app.stok_opname', '1', true);
  update products set stok = stok + v_log.selisih where id = v_log.product_id returning stok into v_sesudah;
  perform set_config('app.stok_opname', '', true);

  update stock_opname_logs
    set disesuaikan = true, stok_sesudah = v_sesudah, diterapkan_pada = now(), diterapkan_oleh = v_actor
    where id = v_id;

  return jsonb_build_object('ok', true, 'nama', v_log.nama, 'kode', v_log.kode, 'stokSesudah', v_sesudah);
end;
$$;
