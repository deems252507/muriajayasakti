-- Kode pajak hanya angka. Impor lama salah membaca "C/M ..." atau "/S" sebagai kode pajak.
-- Kembalikan huruf tersebut ke nama barang, kosongkan kode pajak, dan set Non Pajak.
update products
set nama = kode_pajak || '/' || nama,
    kode_pajak = '',
    pajak_status = 'Non Pajak'
where kode_pajak <> '' and kode_pajak !~ '^[0-9]+$';
