import { createServerFn } from "@tanstack/react-start";
import type { Bank } from "@/lib/shop/types";

type ProductInput = {
  id?: number | null;
  partNumber: string;
  partNumbersAlt: string;
  nama: string;
  kategori: string;
  merek: string;
  satuan: string;
  stokMin: number;
  stok: number;
  hargaBeli: number;
  hargaJual: number;
  satuanAlt: string;
  isiSatuanAlt: number;
  hargaJualAlt: number;
  pajakStatus: string;
  kodePajak: string;
  keterangan: string;
};

export const getMe = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getMe: run } = await import("./logic.server");
    return run();
  });

export const login = createServerFn({ method: "POST" })
  .validator((input: { username: string; password: string }) => {
    const username = String(input?.username ?? "").trim();
    const password = String(input?.password ?? "");
    if (!username || !password) throw new Error("Username dan password wajib diisi.");
    return { username, password };
  })
  .handler(async ({ data }) => {
    const { login: run } = await import("./logic.server");
    return run(data);
  });

export const logout = createServerFn({ method: "POST" })
  .handler(async () => {
    const { logout: run } = await import("./logic.server");
    return run();
  });

export const getDashboard = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getDashboard: run } = await import("./logic.server");
    return run();
  });

export const searchProducts = createServerFn({ method: "GET" })
  .validator((input: { q: string; limit?: number }) => ({
    q: String(input?.q ?? "").trim(),
    limit: Math.min(Number(input?.limit ?? 12) || 12, 30),
  }))
  .handler(async ({ data }) => {
    const { searchProducts: run } = await import("./logic.server");
    return run(data);
  });

export const listProducts = createServerFn({ method: "GET" })
  .validator((input: { q?: string; kategori?: string | string[]; page?: number; sort?: string; status?: string; all?: boolean }) => ({
    q: String(input?.q ?? "").trim(),
    kategori: Array.isArray(input?.kategori) ? input.kategori.map((v) => String(v).trim()).filter(Boolean) : String(input?.kategori ?? "").trim(),
    page: Math.max(1, Number(input?.page ?? 1) || 1),
    sort: String(input?.sort ?? "nama"),
    status: String(input?.status ?? ""),
    all: Boolean(input?.all),
  }))
  .handler(async ({ data }) => {
    const { listProducts: run } = await import("./logic.server");
    return run(data);
  });

export const saveProduct = createServerFn({ method: "POST" })
  .validator((input: ProductInput) => input)
  .handler(async ({ data }) => {
    const { saveProduct: run } = await import("./logic.server");
    return run(data);
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { deleteProduct: run } = await import("./logic.server");
    return run(data);
  });

export const importProducts = createServerFn({ method: "POST" })
  .validator((input: { rows: Record<string, string>[]; replaceStock: boolean }) => ({
    rows: Array.isArray(input?.rows) ? input.rows : [],
    replaceStock: Boolean(input?.replaceStock),
  }))
  .handler(async ({ data }) => {
    const { importProducts: run } = await import("./logic.server");
    return run(data);
  });

export const listPartners = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listPartners: run } = await import("./logic.server");
    return run();
  });

export const savePartner = createServerFn({ method: "POST" })
  .validator((input: { id?: number | null; nama: string; tipe: string; telp: string; alamat: string }) => input)
  .handler(async ({ data }) => {
    const { savePartner: run } = await import("./logic.server");
    return run(data);
  });

export const deletePartner = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input.id) }))
  .handler(async ({ data }) => {
    const { deletePartner: run } = await import("./logic.server");
    return run(data);
  });

export const listMasters = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listMasters: run } = await import("./logic.server");
    return run();
  });

export const savePajak = createServerFn({ method: "POST" })
  .validator((input: { items: { id: number; persentase: number }[] }) => input)
  .handler(async ({ data }) => {
    const { savePajak: run } = await import("./logic.server");
    return run(data);
  });

export const saveShopProfile = createServerFn({ method: "POST" })
  .validator((input: { nama?: string; alamat?: string; telepon?: string; tagline?: string; logo?: string }) => ({
    nama: String(input?.nama ?? ""),
    alamat: String(input?.alamat ?? ""),
    telepon: String(input?.telepon ?? ""),
    tagline: String(input?.tagline ?? ""),
    logo: String(input?.logo ?? ""),
  }))
  .handler(async ({ data }) => {
    const { saveShopProfile: run } = await import("./logic.server");
    return run(data);
  });

export const publicShop = createServerFn({ method: "GET" }).handler(async () => {
  const { publicShop: run } = await import("./logic.server");
  return run();
});

export const saveBank = createServerFn({ method: "POST" })
  .validator((input: Bank & { id?: number }) => input)
  .handler(async ({ data }) => {
    const { saveBank: run } = await import("./logic.server");
    return run(data);
  });

export const listShifts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listShifts: run } = await import("./logic.server");
    return run();
  });

export const openShift = createServerFn({ method: "POST" })
  .validator((input: { shift: string; username: string; kasAwal: number }) => input)
  .handler(async ({ data }) => {
    const { openShift: run } = await import("./logic.server");
    return run(data);
  });

export const closeShift = createServerFn({ method: "POST" })
  .validator((input: { id: string; countedCash: number | null }) => input)
  .handler(async ({ data }) => {
    const { closeShift: run } = await import("./logic.server");
    return run(data);
  });

export const deleteClosedShift = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { deleteClosedShift: run } = await import("./logic.server");
    return run(data);
  });

export const addCashMove = createServerFn({ method: "POST" })
  .validator((input: { jenis: string; jumlah: number; keterangan: string; shiftId: string }) => input)
  .handler(async ({ data }) => {
    const { addCashMove: run } = await import("./logic.server");
    return run(data);
  });

export const deleteCashMove = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input.id) }))
  .handler(async ({ data }) => {
    const { deleteCashMove: run } = await import("./logic.server");
    return run(data);
  });

export const checkout = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const { checkout: run } = await import("./logic.server");
    return run(data);
  });

export const manualNota = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const { manualNota: run } = await import("./logic.server");
    return run(data);
  });

export const returNota = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const { returNota: run } = await import("./logic.server");
    return run(data);
  });

export const payoffBon = createServerFn({ method: "POST" })
  .validator((input: { nomor: string }) => ({ nomor: String(input.nomor ?? "") }))
  .handler(async ({ data }) => {
    const { payoffBon: run } = await import("./logic.server");
    return run(data);
  });

export const editBon = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const { editBon: run } = await import("./logic.server");
    return run(data);
  });

export const editSale = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const { editSale: run } = await import("./logic.server");
    return run(data);
  });

export const editManualBon = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    const { editManualBon: run } = await import("./logic.server");
    return run(data);
  });

export const editManual = createServerFn({ method: "POST" })
  .validator((input: {
    nomor: string;
    tujuan: string;
    keterangan: string;
    lines: Array<{ id: number; qty: number; jenis: string; harga?: number; productId?: number | null; isAlt?: boolean }>;
    add?: Array<{ productId?: number | null; custom?: string; satuan?: string; jenis?: string; qty: number; harga?: number; isAlt?: boolean }>;
  }) => ({
    nomor: String(input?.nomor ?? ""),
    tujuan: String(input?.tujuan ?? ""),
    keterangan: String(input?.keterangan ?? ""),
    lines: Array.isArray(input?.lines)
      ? input.lines.map((line) => ({
          id: Number(line.id),
          qty: Number(line.qty),
          jenis: String(line.jenis),
          ...(line.harga === undefined ? {} : { harga: Math.max(0, Number(line.harga) || 0) }),
          productId: line.productId ? Number(line.productId) : null,
          isAlt: Boolean(line.isAlt),
        }))
      : [],
    add: Array.isArray(input?.add)
      ? input.add.map((row) => ({
          productId: row.productId ? Number(row.productId) : null,
          custom: String(row.custom ?? ""),
          satuan: String(row.satuan ?? ""),
          jenis: String(row.jenis ?? "KELUAR"),
          qty: Number(row.qty),
          harga: Math.max(0, Number(row.harga) || 0),
          isAlt: Boolean(row.isAlt),
        }))
      : [],
  }))
  .handler(async ({ data }) => {
    const { editManual: run } = await import("./logic.server");
    return run(data);
  });

export const deleteRetur = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data }) => {
    const { deleteRetur: run } = await import("./logic.server");
    return run(data);
  });

export const removeInvoice = createServerFn({ method: "POST" })
  .validator((input: { nomor: string }) => ({ nomor: String(input.nomor ?? "") }))
  .handler(async ({ data }) => {
    const { removeInvoice: run } = await import("./logic.server");
    return run(data);
  });

export const findRetur = createServerFn({ method: "GET" })
  .validator((input: { nomor: string }) => ({ nomor: String(input?.nomor ?? "") }))
  .handler(async ({ data }) => {
    const { findRetur: run } = await import("./logic.server");
    return run(data);
  });

export const getInvoice = createServerFn({ method: "GET" })
  .validator((input: { nomor: string }) => ({ nomor: String(input?.nomor ?? "").trim() }))
  .handler(async ({ data }) => {
    const { getInvoice: run } = await import("./logic.server");
    return run(data);
  });

export const createSupplierReceipt = createServerFn({ method: "POST" })
  .validator((input: { invoiceNo: string; supplierId: number; receivedAt: string; notes?: string; items: Array<{ productId: number; qty: number; satuan: string; hargaBeli: number }> }) => ({
    invoiceNo: String(input?.invoiceNo ?? "").trim(),
    supplierId: Number(input?.supplierId),
    receivedAt: String(input?.receivedAt ?? "").trim(),
    notes: String(input?.notes ?? "").trim(),
    items: Array.isArray(input?.items) ? input.items.map((item) => ({ productId: Number(item.productId), qty: Number(item.qty), satuan: String(item.satuan ?? "Pcs"), hargaBeli: Number(item.hargaBeli ?? 0) })) : [],
  }))
  .handler(async ({ data }) => {
    const { createSupplierReceipt: run } = await import("./logic.server");
    return run(data);
  });

export const updateSupplierReceipt = createServerFn({ method: "POST" })
  .validator((input: { id: number; invoiceNo: string; supplierId: number; receivedAt: string; notes?: string; items: Array<{ productId: number; qty: number; satuan: string; hargaBeli: number }> }) => ({
    id: Number(input?.id),
    invoiceNo: String(input?.invoiceNo ?? "").trim(),
    supplierId: Number(input?.supplierId),
    receivedAt: String(input?.receivedAt ?? "").trim(),
    notes: String(input?.notes ?? "").trim(),
    items: Array.isArray(input?.items) ? input.items.map((item) => ({ productId: Number(item.productId), qty: Number(item.qty), satuan: String(item.satuan ?? "Pcs"), hargaBeli: Number(item.hargaBeli ?? 0) })) : [],
  }))
  .handler(async ({ data }) => {
    const { updateSupplierReceipt: run } = await import("./logic.server");
    return run(data);
  });

export const deleteSupplierReceipt = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { deleteSupplierReceipt: run } = await import("./logic.server");
    return run(data);
  });

export const listSupplierReceipts = createServerFn({ method: "GET" })
  .validator((input: { q?: string; supplierId?: number | string; start?: string; end?: string; page?: number; all?: boolean }) => ({
    q: String(input?.q ?? "").trim(),
    supplierId: input?.supplierId ? Number(input.supplierId) : 0,
    start: String(input?.start ?? "").trim(),
    end: String(input?.end ?? "").trim(),
    page: Math.max(1, Number(input?.page ?? 1) || 1),
    all: Boolean(input?.all),
  }))
  .handler(async ({ data }) => {
    const { listSupplierReceipts: run } = await import("./logic.server");
    return run(data);
  });

export const listInvoices = createServerFn({ method: "GET" })
  .validator((input: { q?: string; tujuan?: string; source?: string; status?: string; jenis?: string; start?: string; end?: string; page?: number; all?: boolean }) => ({
    q: String(input?.q ?? "").trim(),
    tujuan: String(input?.tujuan ?? "").trim(),
    source: String(input?.source ?? ""),
    status: String(input?.status ?? ""),
    jenis: String(input?.jenis ?? ""),
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
    page: Math.max(1, Number(input?.page ?? 1) || 1),
    all: Boolean(input?.all),
  }))
  .handler(async ({ data }) => {
    const { listInvoices: run } = await import("./logic.server");
    return run(data);
  });

export const listHistoryItems = createServerFn({ method: "GET" })
  .validator((input: { q?: string; tujuan?: string; source?: string; status?: string; jenis?: string; start?: string; end?: string; page?: number; all?: boolean }) => ({
    q: String(input?.q ?? "").trim(),
    tujuan: String(input?.tujuan ?? "").trim(),
    source: String(input?.source ?? ""),
    status: String(input?.status ?? ""),
    jenis: String(input?.jenis ?? ""),
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
    page: Math.max(1, Number(input?.page ?? 1) || 1),
    all: Boolean(input?.all),
  }))
  .handler(async ({ data }) => {
    const { listHistoryItems: run } = await import("./logic.server");
    return run(data);
  });

export const listHistoryLines = createServerFn({ method: "GET" })
  .validator((input: { q?: string; tujuan?: string; source?: string; status?: string; jenis?: string; start?: string; end?: string }) => ({
    q: String(input?.q ?? "").trim(),
    tujuan: String(input?.tujuan ?? "").trim(),
    source: String(input?.source ?? ""),
    status: String(input?.status ?? ""),
    jenis: String(input?.jenis ?? ""),
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
  }))
  .handler(async ({ data }) => {
    const { listHistoryLines: run } = await import("./logic.server");
    return run(data);
  });

export const listBon = createServerFn({ method: "GET" })
  .validator((input: { status?: string; customer?: string; start?: string; end?: string; withItems?: boolean }) => ({
    status: String(input?.status ?? "Bon"),
    customer: String(input?.customer ?? "").trim(),
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
    withItems: Boolean(input?.withItems),
  }))
  .handler(async ({ data }) => {
    const { listBon: run } = await import("./logic.server");
    return run(data);
  });

export const listTax = createServerFn({ method: "GET" })
  .validator((input: { start?: string; end?: string; kategori?: string; jenis?: string }) => ({
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
    kategori: String(input?.kategori ?? ""),
    jenis: String(input?.jenis ?? ""),
  }))
  .handler(async ({ data }) => {
    const { listTax: run } = await import("./logic.server");
    return run(data);
  });

export const listSoldItems = createServerFn({ method: "GET" })
  .validator((input: { start?: string; end?: string; source?: string; q?: string }) => ({
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
    source: String(input?.source ?? "Kasir"),
    q: String(input?.q ?? ""),
  }))
  .handler(async ({ data }) => {
    const { listSoldItems: run } = await import("./logic.server");
    return run(data) as Promise<{ items: Array<Record<string, string | number>>; days: Array<Record<string, string | number>>; summary: Record<string, string | number> }>;
  });

export type SalesNote = {
  nomor: string; tanggal: string; source: string; kasir: string; tujuan: string; metode_bayar: string; status_bayar: string; total: number; diskon: number;
  lines: Array<{ jenis: string; jumlah: number; satuan: string; harga_satuan: number; nama: string; part_number: string }>;
};

export const listSalesNotes = createServerFn({ method: "GET" })
  .validator((input: { start?: string; end?: string; source?: string; q?: string }) => ({
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
    source: String(input?.source ?? "Kasir"),
    q: String(input?.q ?? ""),
  }))
  .handler(async ({ data }) => {
    const { listSalesNotes: run } = await import("./logic.server");
    return run(data) as Promise<SalesNote[]>;
  });

export const shiftLedger = createServerFn({ method: "GET" })
  .validator((input: { shiftId?: string; start?: string; end?: string }) => ({
    shiftId: String(input?.shiftId ?? ""),
    start: String(input?.start ?? ""),
    end: String(input?.end ?? ""),
  }))
  .handler(async ({ data }) => {
    const { shiftLedger: run } = await import("./logic.server");
    return run(data);
  });

export const listAudit = createServerFn({ method: "GET" })
  .validator((input: { q?: string }) => ({ q: String(input?.q ?? "").trim() }))
  .handler(async ({ data }) => {
    const { listAudit: run } = await import("./logic.server");
    return run(data);
  });

export const listStaff = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listStaff: run } = await import("./logic.server");
    return run();
  });

export const saveStaff = createServerFn({ method: "POST" })
  .validator((input: { username: string; name: string; role: string; shift: string; password: string; status: string; photo?: string }) => ({
    username: String(input?.username ?? ""),
    name: String(input?.name ?? ""),
    role: String(input?.role ?? "Kasir"),
    shift: String(input?.shift ?? ""),
    password: String(input?.password ?? ""),
    status: String(input?.status ?? "Aktif"),
    photo: String(input?.photo ?? ""),
  }))
  .handler(async ({ data }) => {
    const { saveStaff: run } = await import("./logic.server");
    return run(data);
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .validator((input: { name: string; photo?: string }) => ({
    name: String(input?.name ?? ""),
    photo: String(input?.photo ?? ""),
  }))
  .handler(async ({ data }) => {
    const { updateOwnProfile: run } = await import("./logic.server");
    return run(data);
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .validator((input: { current: string; next: string }) => input)
  .handler(async ({ data }) => {
    const { changeOwnPassword: run } = await import("./logic.server");
    return run(data);
  });

export const exportProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { exportProducts: run } = await import("./logic.server");
  return run();
});

export const chatContacts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { chatContacts: run } = await import("./logic.server");
    return run();
  });

export const chatUnread = createServerFn({ method: "GET" })
  .handler(async () => {
    const { chatUnread: run } = await import("./logic.server");
    return run();
  });

export const chatMessages = createServerFn({ method: "GET" })
  .validator((input: { with: string }) => ({ with: String(input?.with ?? "") }))
  .handler(async ({ data }) => {
    const { chatMessages: run } = await import("./logic.server");
    return run(data);
  });

export const chatSend = createServerFn({ method: "POST" })
  .validator((input: { to: string; body: string }) => ({ to: String(input?.to ?? ""), body: String(input?.body ?? "") }))
  .handler(async ({ data }) => {
    const { chatSend: run } = await import("./logic.server");
    return run(data);
  });

export const groupList = createServerFn({ method: "GET" })
  .handler(async () => {
    const { groupList: run } = await import("./logic.server");
    return run();
  });

export const groupInfo = createServerFn({ method: "GET" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { groupInfo: run } = await import("./logic.server");
    return run(data);
  });

export const groupCreate = createServerFn({ method: "POST" })
  .validator((input: { id?: number; nama: string; deskripsi?: string; members: string[] }) => ({ id: Number(input?.id ?? 0), nama: String(input?.nama ?? ""), deskripsi: String(input?.deskripsi ?? ""), members: Array.isArray(input?.members) ? input.members.map((v) => String(v)) : [] }))
  .handler(async ({ data }) => {
    const { groupCreate: run } = await import("./logic.server");
    return run(data);
  });

export const groupUpdate = createServerFn({ method: "POST" })
  .validator((input: { id?: number; nama: string; deskripsi?: string; members: string[] }) => ({ id: Number(input?.id ?? 0), nama: String(input?.nama ?? ""), deskripsi: String(input?.deskripsi ?? ""), members: Array.isArray(input?.members) ? input.members.map((v) => String(v)) : [] }))
  .handler(async ({ data }) => {
    const { groupUpdate: run } = await import("./logic.server");
    return run(data);
  });

export const groupDelete = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { groupDelete: run } = await import("./logic.server");
    return run(data);
  });

export const groupMessages = createServerFn({ method: "GET" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { groupMessages: run } = await import("./logic.server");
    return run(data);
  });

export const groupSend = createServerFn({ method: "POST" })
  .validator((input: { id: number; body: string }) => ({ id: Number(input?.id), body: String(input?.body ?? "") }))
  .handler(async ({ data }) => {
    const { groupSend: run } = await import("./logic.server");
    return run(data);
  });

export const noteList = createServerFn({ method: "GET" })
  .validator((input: { groupId: number }) => ({ groupId: Number(input?.groupId) }))
  .handler(async ({ data }) => {
    const { noteList: run } = await import("./logic.server");
    return run(data);
  });

export const noteSave = createServerFn({ method: "POST" })
  .validator((input: { groupId: number; id?: number | null; judul: string; isi: string; pinned?: boolean }) => ({ groupId: Number(input?.groupId), id: input?.id ? Number(input.id) : null, judul: String(input?.judul ?? ""), isi: String(input?.isi ?? ""), pinned: Boolean(input?.pinned) }))
  .handler(async ({ data }) => {
    const { noteSave: run } = await import("./logic.server");
    return run(data);
  });

export const noteDelete = createServerFn({ method: "POST" })
  .validator((input: { groupId: number; id: number }) => ({ groupId: Number(input?.groupId), id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { noteDelete: run } = await import("./logic.server");
    return run(data);
  });

export const chatDeleteMessage = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { chatDeleteMessage: run } = await import("./logic.server");
    return run(data);
  });

export const groupDeleteMessage = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { groupDeleteMessage: run } = await import("./logic.server");
    return run(data);
  });

export const chatDeleteMessages = createServerFn({ method: "POST" })
  .validator((input: { ids: number[] }) => ({ ids: (Array.isArray(input?.ids) ? input.ids : []).map(Number) }))
  .handler(async ({ data }) => {
    const { chatDeleteMessages: run } = await import("./logic.server");
    return run(data);
  });

export const groupDeleteMessages = createServerFn({ method: "POST" })
  .validator((input: { ids: number[] }) => ({ ids: (Array.isArray(input?.ids) ? input.ids : []).map(Number) }))
  .handler(async ({ data }) => {
    const { groupDeleteMessages: run } = await import("./logic.server");
    return run(data);
  });

export const chatClear = createServerFn({ method: "POST" })
  .validator((input: { with: string }) => ({ with: String(input?.with ?? "") }))
  .handler(async ({ data }) => {
    const { chatClear: run } = await import("./logic.server");
    return run(data);
  });

export const groupClearMessages = createServerFn({ method: "POST" })
  .validator((input: { id: number }) => ({ id: Number(input?.id) }))
  .handler(async ({ data }) => {
    const { groupClearMessages: run } = await import("./logic.server");
    return run(data);
  });
