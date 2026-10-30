-- Status online staff: waktu terakhir aplikasi terbuka dan aktif di perangkat staff.
alter table staff add column if not exists last_seen_at timestamptz;
