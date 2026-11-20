-- Stok Opname Gudang lewat Hitungan Sementara (draft). Draft TIDAK mengubah stok gudang.
-- Admin dan staf berizin gudang boleh menghitung; hanya Admin yang menekan "Konfirmasi Total".
-- Konfirmasi memakai shop_gudang_opname (0051) yang sudah ada, jadi stok gudang berubah atomik dan tercatat OPNAME.
-- Hanya MENAMBAH kolom/tabel/fungsi baru.

alter table gudang_log add column if not exists rincian jsonb;

create table if not exists gudang_opname_draft (
  id bigserial primary key,
  product_id bigint not null references gudang_items (product_id) on delete cascade,
  lokasi text not null,
  lokasi_key text not null,
  jumlah int not null check (jumlah >= 0),
  qty_input int not null default 0,
  satuan_input text not null default '',
  catatan text not null default '',
  petugas text not null default '',
  petugas_nama text not null default '',
  stok_saat_hitung int not null default 0,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  unique (product_id, lokasi_key)
);

create index if not exists gudang_opname_draft_lokasi_idx on gudang_opname_draft (lokasi_key);

-- Simpan / ganti hitungan satu lokasi gudang. Lokasi yang sama diganti, tidak ditambah.
create or replace function shop_gudang_draft_save(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint;
  v_lokasi text;
  v_stok int;
  v_row gudang_opname_draft%rowtype;
begin
  if coalesce(p->>'productId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Barang tidak valid.';
  end if;
  v_pid := (p->>'productId')::bigint;
  v_lokasi := left(regexp_replace(btrim(coalesce(p->>'lokasi', '')), '\s+', ' ', 'g'), 40);
  if v_lokasi = '' then
    raise exception 'Isi lokasi hitungan, misalnya Rak A atau Gudang belakang.';
  end if;
  if coalesce(p->>'jumlah', '') !~ '^[0-9]{1,9}$' or coalesce(p->>'qty', '') !~ '^[0-9]{1,9}$' then
    raise exception 'Jumlah fisik harus bilangan bulat 0 atau lebih.';
  end if;

  select stok into v_stok from gudang_items where product_id = v_pid;
  if not found then
    raise exception 'Barang ini belum ada di daftar gudang.';
  end if;

  insert into gudang_opname_draft (product_id, lokasi, lokasi_key, jumlah, qty_input, satuan_input, catatan, petugas, petugas_nama, stok_saat_hitung)
  values (
    v_pid, v_lokasi, lower(v_lokasi), (p->>'jumlah')::int, (p->>'qty')::int,
    left(coalesce(p->>'satuanInput', ''), 40), left(btrim(coalesce(p->>'catatan', '')), 300),
    coalesce(p->>'actor', ''), coalesce(p->>'actorName', ''), v_stok
  )
  on conflict (product_id, lokasi_key) do update set
    lokasi = excluded.lokasi,
    jumlah = excluded.jumlah,
    qty_input = excluded.qty_input,
    satuan_input = excluded.satuan_input,
    catatan = excluded.catatan,
    petugas = excluded.petugas,
    petugas_nama = excluded.petugas_nama,
    stok_saat_hitung = excluded.stok_saat_hitung,
    diubah_pada = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id);
end;
$$;

-- Konfirmasi total semua lokasi gudang satu barang (Admin): jumlahkan draft, simpan sebagai satu OPNAME gudang, hapus draft.
-- Satu transaksi. Baris gudang dikunci; stok yang dilihat Admin harus sama dengan stok terbaru; bila sejak hitungan
-- pertama ada tambah/ambil/koreksi stok gudang, konfirmasi ditahan sampai Admin menyetujui (force).
create or replace function shop_gudang_draft_confirm(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint;
  v_expected int;
  v_force boolean := coalesce(p->>'force', 'false') = 'true';
  v_g int;
  v_total int;
  v_count int;
  v_oldest timestamptz;
  v_rincian jsonb;
  v_mut int := 0;
  v_res jsonb;
begin
  if coalesce(p->>'productId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Barang tidak valid.';
  end if;
  v_pid := (p->>'productId')::bigint;
  if coalesce(p->>'expectedStok', '') !~ '^[0-9]{1,9}$' then
    raise exception 'Data pemeriksaan tidak lengkap. Muat ulang halaman.';
  end if;
  v_expected := (p->>'expectedStok')::int;

  select stok into v_g from gudang_items where product_id = v_pid for update;
  if not found then
    raise exception 'Barang ini belum ada di daftar gudang.';
  end if;

  select coalesce(sum(jumlah), 0)::int, count(*)::int, min(diubah_pada),
         jsonb_agg(jsonb_build_object('lokasi', lokasi, 'jumlah', jumlah, 'qty', qty_input,
                                      'satuan', satuan_input, 'petugas', petugas_nama, 'diubah', diubah_pada) order by lokasi)
    into v_total, v_count, v_oldest, v_rincian
  from gudang_opname_draft where product_id = v_pid;

  if v_count = 0 then
    raise exception 'Belum ada hitungan sementara untuk barang ini.';
  end if;

  if v_g <> v_expected then
    return jsonb_build_object('ok', false, 'alasan', 'berubah', 'sisa', v_g);
  end if;

  if not v_force then
    select count(*)::int into v_mut
    from gudang_log where product_id = v_pid and tipe <> 'OPNAME' and tanggal >= v_oldest;
    if v_mut > 0 then
      return jsonb_build_object('ok', false, 'alasan', 'peringatan', 'jumlahMutasi', v_mut, 'total', v_total, 'sisa', v_g);
    end if;
  end if;

  v_res := shop_gudang_opname(jsonb_build_object(
    'productId', v_pid, 'fisik', v_total, 'expectedStok', v_expected,
    'catatan', coalesce(p->>'catatan', ''), 'actor', coalesce(p->>'actor', ''), 'actorName', coalesce(p->>'actorName', '')
  ));

  if not coalesce((v_res->>'ok')::boolean, false) then
    return v_res;
  end if;

  update gudang_log set rincian = v_rincian
   where id = (select max(id) from gudang_log where product_id = v_pid and tipe = 'OPNAME');
  delete from gudang_opname_draft where product_id = v_pid;

  return v_res || jsonb_build_object('rincian', v_rincian);
end;
$$;
