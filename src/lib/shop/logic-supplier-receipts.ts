// ===== Paste these 4 functions into src/lib/shop/logic.server.ts =====
// (replace any existing versions of the same function names)

export async function createSupplierReceipt(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const invoiceNo = String(data.invoiceNo ?? '').trim();
  const supplierId = Number(data.supplierId);
  const receivedAt = String(data.receivedAt ?? '').trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!invoiceNo) throw new Error('Nomor invoice barang masuk wajib diisi.');
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error('Pemasok wajib dipilih.');
  if (!items.length) throw new Error('Minimal satu barang harus dimasukkan.');
  try {
    const [row] = await db.query<{ shop_receive_supplier: unknown }>(
      `select shop_receive_supplier($1::jsonb) as shop_receive_supplier`,
      [JSON.stringify({
        invoiceNo,
        supplierId,
        receivedAt: receivedAt ? `${receivedAt}T12:00:00+08:00` : '',
        notes: String(data.notes ?? '').trim(),
        createdBy: me.name,
        items: items.map((item: any) => ({
          productId: Number(item.productId),
          qty: Number(item.qty),
          satuan: String(item.satuan ?? 'Pcs'),
          hargaBeli: Number(item.hargaBeli ?? 0),
        })),
      })],
    );
    const result = row?.shop_receive_supplier as { id?: number; invoiceNo?: string };
    await audit(me, `Barang masuk pemasok ${result?.invoiceNo ?? invoiceNo}`);
    return { ok: true, id: Number(result?.id ?? 0), invoiceNo: String(result?.invoiceNo ?? invoiceNo) };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function updateSupplierReceipt(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const id = Number(data.id);
  const invoiceNo = String(data.invoiceNo ?? '').trim();
  const supplierId = Number(data.supplierId);
  const receivedAt = String(data.receivedAt ?? '').trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!Number.isInteger(id) || id <= 0) throw new Error('Penerimaan tidak ditemukan.');
  if (!invoiceNo) throw new Error('Nomor invoice barang masuk wajib diisi.');
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error('Pemasok wajib dipilih.');
  if (!items.length) throw new Error('Minimal satu barang harus dimasukkan.');
  try {
    const [row] = await db.query<{ shop_update_supplier_receipt: unknown }>(
      `select shop_update_supplier_receipt($1::jsonb) as shop_update_supplier_receipt`,
      [JSON.stringify({
        id,
        invoiceNo,
        supplierId,
        receivedAt: receivedAt ? `${receivedAt}T12:00:00+08:00` : '',
        notes: String(data.notes ?? '').trim(),
        items: items.map((item: any) => ({
          productId: Number(item.productId),
          qty: Number(item.qty),
          satuan: String(item.satuan ?? 'Pcs'),
          hargaBeli: Number(item.hargaBeli ?? 0),
        })),
      })],
    );
    const result = row?.shop_update_supplier_receipt as { invoiceNo?: string };
    await audit(me, `Ubah barang masuk pemasok ${result?.invoiceNo ?? invoiceNo}`);
    return { ok: true, id, invoiceNo: String(result?.invoiceNo ?? invoiceNo) };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function deleteSupplierReceipt(data: any) {
  const me = await requireStaff();
  assertAdmin(me);
  const db = await sql();
  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Penerimaan tidak ditemukan.');
  try {
    const [row] = await db.query<{ shop_delete_supplier_receipt: unknown }>(
      `select shop_delete_supplier_receipt($1::bigint) as shop_delete_supplier_receipt`,
      [id],
    );
    const result = row?.shop_delete_supplier_receipt as { invoiceNo?: string };
    await audit(me, `Hapus barang masuk pemasok ${result?.invoiceNo ?? id}`);
    return { ok: true, id };
  } catch (error) {
    throw new Error(cleanError(error));
  }
}

export async function listSupplierReceipts(data: any) {
  await requireStaff();
  const db = await sql();
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  if (data.supplierId) {
    params.push(Number(data.supplierId));
    where.push(`r.supplier_id = $${params.length}`);
  }
  if (data.q) {
    params.push(`%${String(data.q).toLowerCase()}%`);
    where.push(`(
      lower(r.invoice_no) like $${params.length}
      or lower(p.nama) like $${params.length}
      or exists (
        select 1 from supplier_receipt_lines l
        join products pr on pr.id = l.product_id
        where l.receipt_id = r.id
          and (lower(pr.nama) like $${params.length} or lower(pr.part_number) like $${params.length})
      )
    )`);
  }
  if (data.start) {
    params.push(data.start);
    where.push(`r.received_at >= ($${params.length}::date::timestamp at time zone 'Asia/Makassar')`);
  }
  if (data.end) {
    params.push(data.end);
    where.push(`r.received_at < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Makassar')`);
  }
  const clause = where.join(' and ');
  const perPage = data.all ? 100000 : 15;
  const page = Math.max(1, Number(data.page ?? 1) || 1);
  const [countRow] = await db.query<{ n: number }>(`select count(*)::int as n from supplier_receipts r join partners p on p.id = r.supplier_id where ${clause}`, params);
  const rows = await db.query<Record<string, unknown>>(
    `select r.id, r.invoice_no, r.received_at, r.notes, r.created_by, p.id as supplier_id, p.nama as supplier_name,
      coalesce((select sum(l.qty_dasar) from supplier_receipt_lines l where l.receipt_id = r.id), 0) as total_qty,
      coalesce((select sum(l.harga_beli * l.qty) from supplier_receipt_lines l where l.receipt_id = r.id), 0) as total_value,
      coalesce((select json_agg(json_build_object(
        'productId', l.product_id, 'nama', pr.nama, 'partNumber', pr.part_number, 'kategori', pr.kategori,
        'qty', l.qty, 'satuan', l.satuan, 'qtyDasar', l.qty_dasar, 'hargaBeli', l.harga_beli
      ) order by lower(pr.nama)) from supplier_receipt_lines l join products pr on pr.id = l.product_id where l.receipt_id = r.id), '[]'::json) as items
     from supplier_receipts r join partners p on p.id = r.supplier_id
     where ${clause}
     order by r.received_at desc, lower(p.nama) asc, lower(r.invoice_no) asc
     limit ${perPage} offset ${(page - 1) * perPage}`, params);
  return {
    total: Number(countRow?.n ?? 0),
    page,
    perPage,
    items: rows.map((row) => ({
      id: Number(row.id), invoiceNo: String(row.invoice_no), receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : '',
      supplierId: Number(row.supplier_id), supplierName: String(row.supplier_name ?? ''), notes: String(row.notes ?? ''), createdBy: String(row.created_by ?? ''),
      totalQty: Number(row.total_qty ?? 0), totalValue: Number(row.total_value ?? 0), items: Array.isArray(row.items) ? row.items : [],
    })),
  };
}
