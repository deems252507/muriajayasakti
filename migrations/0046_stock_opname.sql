-- Fitur Stok Opname (Continuous Stock Opname).
-- Hanya MENAMBAH tabel, trigger pencatat, dan satu fungsi baru. Tabel products, invoices, dan semua fungsi
-- transaksi lama (kasir, barang masuk, retur, manual) tidak diubah.

-- 1. Pengaturan fitur (satu baris).
create table if not exists stock_opname_settings (
  id int primary key default 1 check (id = 1),
  auto_sync boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

insert into stock_opname_settings (id) values (1) on conflict (id) do nothing;

-- 2. Riwayat pemeriksaan. Tidak pernah dihapus atau ditimpa: setiap pemeriksaan = satu baris baru.
--    product_id mengacu ke master products (tidak menggandakan barang); nama/kode ikut disalin
--    supaya riwayat tetap terbaca walau barang dihapus dari master.
create table if not exists stock_opname_logs (
  id bigserial primary key,
  request_token text not null unique,
  product_id bigint references products (id) on delete set null,
  kode text not null default '',
  nama text not null,
  satuan text not null default 'Pcs',
  stok_dilihat int not null,
  stok_sebelum int not null,
  stok_fisik int not null check (stok_fisik >= 0),
  selisih int not null,
  stok_sesudah int not null,
  status_pemeriksaan text not null default 'SUDAH_DICEK',
  hasil text not null check (hasil in ('SESUAI', 'SELISIH', 'FISIK_HABIS', 'STOK_SISTEM_0')),
  disesuaikan boolean not null default false,
  alasan text not null default 'Stok Opname',
  catatan text not null default '',
  petugas text not null default '',
  petugas_nama text not null default '',
  dibuka_pada timestamptz,
  dicek_pada timestamptz not null default now(),
  mutasi_selama_cek int not null default 0
);

create index if not exists stock_opname_logs_product_idx
  on stock_opname_logs (product_id, dicek_pada desc, id desc);
create index if not exists stock_opname_logs_tanggal_idx
  on stock_opname_logs (dicek_pada desc, id desc);

-- 3. Catatan mutasi stok. Diisi otomatis oleh trigger setiap kali kolom products.stok berubah
--    (penjualan, retur, barang masuk, transaksi manual, edit master, maupun opname itu sendiri),
--    tanpa mengubah satu pun fungsi transaksi lama. Dipakai untuk mendeteksi transaksi yang terjadi
--    selama pemeriksaan berlangsung.
create table if not exists stock_opname_mutasi (
  id bigserial primary key,
  product_id bigint not null,
  tanggal timestamptz not null default now(),
  stok_lama int not null,
  stok_baru int not null,
  selisih int not null,
  sumber text not null default 'Transaksi'
);

create index if not exists stock_opname_mutasi_product_idx
  on stock_opname_mutasi (product_id, tanggal desc);

-- Trigger ini tidak boleh sampai menggagalkan transaksi kasir: kegagalan mencatat diabaikan.
create or replace function trg_stock_opname_mutasi() returns trigger
language plpgsql
as $$
begin
  if new.stok is distinct from old.stok then
    begin
      insert into stock_opname_mutasi (product_id, stok_lama, stok_baru, selisih, sumber)
      values (
        new.id,
        old.stok,
        new.stok,
        new.stok - old.stok,
        case when coalesce(current_setting('app.stok_opname', true), '') = '1' then 'Stok Opname' else 'Transaksi' end
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists stock_opname_mutasi_trg on products;
create trigger stock_opname_mutasi_trg
  after update of stok on products
  for each row execute function trg_stock_opname_mutasi();

-- 4. Simpan pemeriksaan secara atomik.
--    - Baris barang dikunci (FOR UPDATE), jadi transaksi kasir yang bersamaan menunggu giliran dan tidak tertimpa.
--    - Stok sistem yang dilihat petugas dibandingkan dengan stok terbaru. Jika sudah berbeda (ada transaksi
--      atau petugas lain menyimpan lebih dulu), TIDAK ada yang diubah dan petugas diminta menghitung ulang.
--    - Penyesuaian memakai stok = stok + selisih, bukan menimpa angka lama.
--    - request_token unik: klik Simpan berulang kali tidak menyesuaikan stok dua kali.
create or replace function shop_opname_save(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_pid bigint;
  v_token text := nullif(btrim(coalesce(p->>'token', '')), '');
  v_fisik int;
  v_dilihat int;
  v_catatan text := left(btrim(coalesce(p->>'catatan', '')), 500);
  v_actor text := coalesce(p->>'actor', '');
  v_actor_name text := coalesce(p->>'actorName', '');
  v_opened timestamptz;
  v_prod products%rowtype;
  v_log stock_opname_logs%rowtype;
  v_auto boolean;
  v_sel int;
  v_hasil text;
  v_sesudah int;
  v_mut int := 0;
  v_net int := 0;
  v_dup boolean := false;
begin
  if coalesce(p->>'productId', '') !~ '^[0-9]{1,15}$' then
    raise exception 'Barang tidak valid.';
  end if;
  v_pid := (p->>'productId')::bigint;

  if v_token is null or length(v_token) > 100 then
    raise exception 'Kode pemeriksaan tidak valid. Muat ulang halaman.';
  end if;
  if coalesce(p->>'fisik', '') !~ '^[0-9]{1,9}$' then
    raise exception 'Jumlah fisik harus bilangan bulat 0 atau lebih.';
  end if;
  v_fisik := (p->>'fisik')::int;
  if coalesce(p->>'expectedStok', '') !~ '^-?[0-9]{1,9}$' then
    raise exception 'Data pemeriksaan tidak lengkap. Muat ulang halaman.';
  end if;
  v_dilihat := (p->>'expectedStok')::int;

  v_opened := now();
  if coalesce(p->>'openedAt', '') <> '' then
    begin
      v_opened := least((p->>'openedAt')::timestamptz, now());
    exception when others then
      v_opened := now();
    end;
  end if;

  -- Kunci baris barang: dari sini sampai selesai tidak ada transaksi lain yang bisa mengubah stok barang ini.
  select * into v_prod from products where id = v_pid for update;
  if not found then
    raise exception 'Barang tidak ditemukan.';
  end if;

  -- Klik ganda / kirim ulang: kalau token sudah tercatat, kembalikan hasil yang sama tanpa mengubah stok.
  select * into v_log from stock_opname_logs where request_token = v_token;
  if found then
    if v_log.product_id is distinct from v_pid then
      raise exception 'Kode pemeriksaan tidak valid. Muat ulang halaman.';
    end if;
    v_dup := true;
  else
    select count(*)::int, coalesce(sum(selisih), 0)::int into v_mut, v_net
    from stock_opname_mutasi
    where product_id = v_pid and tanggal >= v_opened;

    -- Stok sudah berubah sejak petugas melihatnya: jangan tulis apa pun, minta hitung ulang.
    if v_prod.stok <> v_dilihat then
      return jsonb_build_object(
        'ok', false,
        'konflik', true,
        'stokTerbaru', v_prod.stok,
        'stokDilihat', v_dilihat,
        'jumlahMutasi', v_mut,
        'netMutasi', v_net
      );
    end if;

    select auto_sync into v_auto from stock_opname_settings where id = 1;
    v_auto := coalesce(v_auto, true);

    v_sel := v_fisik - v_prod.stok;
    v_hasil := case
      when v_sel = 0 then 'SESUAI'
      when v_fisik = 0 then 'FISIK_HABIS'
      when v_prod.stok <= 0 then 'STOK_SISTEM_0'
      else 'SELISIH'
    end;

    v_sesudah := v_prod.stok;
    if v_sel <> 0 and v_auto then
      perform set_config('app.stok_opname', '1', true);
      update products set stok = stok + v_sel where id = v_pid returning stok into v_sesudah;
      perform set_config('app.stok_opname', '', true);
    end if;

    insert into stock_opname_logs (
      request_token, product_id, kode, nama, satuan,
      stok_dilihat, stok_sebelum, stok_fisik, selisih, stok_sesudah,
      status_pemeriksaan, hasil, disesuaikan, alasan, catatan,
      petugas, petugas_nama, dibuka_pada, mutasi_selama_cek
    ) values (
      v_token, v_pid, v_prod.kode, v_prod.nama, v_prod.satuan,
      v_dilihat, v_prod.stok, v_fisik, v_sel, v_sesudah,
      'SUDAH_DICEK', v_hasil, (v_sel <> 0 and v_auto), 'Stok Opname', v_catatan,
      v_actor, v_actor_name, v_opened, v_mut
    ) returning * into v_log;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplikat', v_dup,
    'logId', v_log.id,
    'hasil', v_log.hasil,
    'stokSebelum', v_log.stok_sebelum,
    'stokFisik', v_log.stok_fisik,
    'selisih', v_log.selisih,
    'stokSesudah', v_log.stok_sesudah,
    'disesuaikan', v_log.disesuaikan,
    'dicekPada', v_log.dicek_pada,
    'petugas', v_log.petugas_nama,
    'jumlahMutasi', v_log.mutasi_selama_cek
  );
end;
$$;
