create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id);
create index if not exists invoice_lines_product_idx on invoice_lines (product_id);
create index if not exists invoice_lines_jenis_invoice_idx on invoice_lines (jenis, invoice_id);
create index if not exists invoices_source_tanggal_idx on invoices (source, tanggal desc);
create index if not exists cash_moves_shift_idx on cash_moves (shift_id);
create index if not exists products_kategori_nama_idx on products (lower(kategori), lower(nama));
