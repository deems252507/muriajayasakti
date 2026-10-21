-- Hapus pesan chat (soft delete): isi pesan tidak lagi ditampilkan, baris tetap ada agar urutan dan jumlah tidak kacau.
alter table chat_messages add column if not exists deleted_at timestamptz;
alter table chat_group_messages add column if not exists deleted_at timestamptz;
