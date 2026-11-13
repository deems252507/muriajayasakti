-- Password akun yang bisa dilihat Admin 1 (disimpan terenkripsi, bukan teks biasa).
-- Login tetap memakai password_hash. Akun lama kosong sampai passwordnya diatur ulang sekali.
alter table staff add column if not exists password_enc text not null default '';
