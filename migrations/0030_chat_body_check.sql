-- Hapus aturan lama "isi pesan minimal 1 huruf" apa pun namanya, supaya pesan berisi foto/file/data tanpa teks bisa disimpan.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('chat_messages'::regclass, 'chat_group_messages'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%char_length(body)%'
      and c.conname not like '%body_len'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
