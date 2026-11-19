-- Hapus catatan pemeriksaan (khusus Admin). Opsional mengembalikan stok ke angka sebelum pemeriksaan,
-- hanya bila catatan itu pemeriksaan terakhir barang dan stok belum berubah sejak itu.

create or replace function shop_opname_delete(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_id bigint;
  v_restore boolean := false;
  v_log stock_opname_logs%rowtype;
  v_prod products%rowtype;
  v_has_prod boolean := false;
  v_latest bigint;
  v_stok int;
  v_back boolean := false;
begin
  if coalesce(p->>'logId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Catatan tidak valid.';
  end if;
  v_id := (p->>'logId')::bigint;
  v_restore := coalesce(p->>'kembalikan', 'false') = 'true';

  select * into v_log from stock_opname_logs where id = v_id;
  if not found then
    raise exception 'Catatan pemeriksaan tidak ditemukan.';
  end if;

  if v_log.product_id is not null then
    select * into v_prod from products where id = v_log.product_id for update;
    v_has_prod := found;
    -- baca ulang setelah barang terkunci
    select * into v_log from stock_opname_logs where id = v_id;
    if not found then
      raise exception 'Catatan pemeriksaan sudah dihapus.';
    end if;
  end if;

  if v_has_prod then
    v_stok := v_prod.stok;
    if v_restore then
      select id into v_latest from stock_opname_logs
        where product_id = v_log.product_id order by dicek_pada desc, id desc limit 1;
      if not (v_log.disesuaikan and v_latest = v_log.id and v_prod.stok = v_log.stok_sesudah) then
        return jsonb_build_object('ok', false, 'alasan', 'tidak_bisa_kembali', 'stokSekarang', v_prod.stok);
      end if;
      perform set_config('app.stok_opname', '1', true);
      update products set stok = stok - (v_log.stok_sesudah - v_log.stok_sebelum)
        where id = v_log.product_id returning stok into v_stok;
      perform set_config('app.stok_opname', '', true);
      v_back := true;
    end if;
  elsif v_restore then
    return jsonb_build_object('ok', false, 'alasan', 'tidak_bisa_kembali', 'stokSekarang', null);
  end if;

  delete from stock_opname_logs where id = v_id;

  return jsonb_build_object(
    'ok', true,
    'dikembalikan', v_back,
    'stokSekarang', v_stok,
    'kode', v_log.kode,
    'nama', v_log.nama
  );
end;
$$;
