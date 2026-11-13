-- Role baru "Staf" (karyawan pengecek barang: hanya Daftar Sparepart + Chat Staff)
-- dan izin "kelola akun" (hanya Admin 1 yang boleh menambah / mengatur akun lain).

-- 1) Izinkan nilai role 'Staf' (hapus check role lama, apa pun namanya, lalu pasang yang baru).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'staff'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table staff drop constraint %I', c.conname);
  end loop;
end $$;

alter table staff add constraint staff_role_check check (role in ('Owner', 'Admin', 'Kasir', 'Staf'));

-- 2) Izin kelola akun. Default tidak boleh.
alter table staff add column if not exists can_manage_staff boolean not null default false;

-- Admin 1 = Rizky (akun Admin yang username atau namanya memuat "rizky").
update staff set can_manage_staff = true
  where role = 'Admin' and (lower(username) like '%rizky%' or lower(name) like '%rizky%');
-- Kalau akun Rizky tidak ditemukan, semua Admin yang sudah ada tetap boleh (supaya tidak ada yang terkunci);
-- Admin 1 bisa mencabutnya untuk Admin 2 lewat Pengaturan > Edit Akun.
update staff set can_manage_staff = true
  where role = 'Admin' and not exists (select 1 from staff where can_manage_staff);
