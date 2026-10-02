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
  .validator((input: { q?: string; kategori?: string; page?: number; sort?: string; status?: string; all?: boolean }) => ({
    q: String(input?.q ?? "").trim(),
    kategori: String(input?.kategori ?? ""),
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

export const editManual = createServerFn({ method: "POST" })
  .validator((input: { nomor: string; tujuan: string; keterangan: string; lines: Array<{ id: number; qty: number; jenis: string; productId?: number | null; isAlt?: boolean }> }) => ({
    nomor: String(input?.nomor ?? ""),
    tujuan: String(input?.tujuan ?? ""),
    keterangan: String(input?.keterangan ?? ""),
    lines: Array.isArray(input?.lines)
      ? input.lines.map((line) => ({
          id: Number(line.id),
          qty: Number(line.qty),
          jenis: String(line.jenis),
          productId: line.productId ? Number(line.productId) : null,
          isAlt: Boolean(line.isAlt),
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

export const listInvoices = createServerFn({ method: "GET" })
  .validator((input: { q?: string; source?: string; status?: string; jenis?: string; start?: string; end?: string; page?: number; all?: boolean }) => ({
    q: String(input?.q ?? "").trim(),
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

export const listHistoryLines = createServerFn({ method: "GET" })
  .validator((input: { q?: string; source?: string; status?: string; jenis?: string; start?: string; end?: string }) => ({
    q: String(input?.q ?? "").trim(),
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
