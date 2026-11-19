export type Role = "Owner" | "Admin" | "Kasir" | "Staf";

export type Staff = {
  username: string;
  role: Role;
  name: string;
  shift: string;
  status: string;
  photo: string;
  mustChange?: boolean;
  /** Hanya Admin tertentu (Admin 1) yang boleh menambah dan mengatur akun lain. */
  canManageStaff?: boolean;
};

export type Product = {
  id: number;
  kode: string;
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

export type Partner = {
  id: number;
  nama: string;
  tipe: "Pelanggan" | "Supplier";
  telp: string;
  alamat: string;
};

export type Shift = {
  id: string;
  username: string;
  cashierName: string;
  shift: string;
  start: string;
  end: string | null;
  status: string;
  kasAwal: number;
  countedCash: number | null;
  kasAkhir: number | null;
  closedBy: string;
};

export type Bank = {
  id: number;
  nama: string;
  rekening: string;
  atasNama: string;
  aktif: boolean;
  keterangan: string;
};

export type Pajak = {
  id: number;
  jenis: string;
  persentase: number;
  aktif: boolean;
};


export type SupplierReceiptItem = {
  productId: number;
  nama: string;
  partNumber: string;
  kategori: string;
  qty: number;
  satuan: string;
  qtyDasar: number;
  hargaBeli: number;
  merek?: string;
  kodePajak?: string;
  partNumbersAlt?: string;
};

export type SupplierReceipt = {
  id: number;
  invoiceNo: string;
  receivedAt: string;
  supplierId: number;
  supplierName: string;
  notes: string;
  createdBy: string;
  totalQty: number;
  totalValue: number;
  items: SupplierReceiptItem[];
};

/* ===== Stok Opname ===== */

/** Status pemeriksaan barang. Berbeda dari hasil (sesuai / selisih). */
export type OpnameStatus = "BELUM_DICEK" | "SUDAH_DICEK" | "PERLU_CEK_ULANG";

/** Hasil pemeriksaan terakhir (hanya ada jika barang pernah diperiksa). */
export type OpnameHasil = "SESUAI" | "SELISIH" | "FISIK_HABIS" | "STOK_SISTEM_0";

export type OpnameFilter = "semua" | "belum" | "sudah" | "selisih" | "ulang" | "habis" | "sistem0";

/** Barang dari Master Data (Daftar Sparepart) + pemeriksaan terakhirnya. */
export type OpnameItem = Product & {
  statusCek: OpnameStatus;
  hasil: OpnameHasil | null;
  stokFisik: number | null;
  selisih: number | null;
  stokSebelum: number | null;
  stokSesudah: number | null;
  dicekPada: string | null;
  petugas: string;
  catatan: string;
};

export type OpnameSummary = {
  total: number;
  sudah: number;
  belum: number;
  ulang: number;
  selisih: number;
  habis: number;
  sistem0: number;
  /** Persen barang yang sudah dicek dan masih berlaku (0-100, dibulatkan ke bawah). */
  progress: number;
};

export type OpnameLog = {
  id: number;
  productId: number | null;
  kode: string;
  nama: string;
  partNumber: string;
  partNumbersAlt: string;
  merek: string;
  kategori: string;
  kodePajak: string;
  satuan: string;
  stokSebelum: number;
  stokFisik: number;
  selisih: number;
  stokSesudah: number;
  hasil: OpnameHasil;
  disesuaikan: boolean;
  alasan: string;
  catatan: string;
  petugas: string;
  dicekPada: string;
  dibukaPada: string | null;
  mutasi: number;
};

export type OpnameSaveResult =
  | {
      ok: true;
      duplikat: boolean;
      logId: number;
      hasil: OpnameHasil;
      stokSebelum: number;
      stokFisik: number;
      selisih: number;
      stokSesudah: number;
      disesuaikan: boolean;
      dicekPada: string;
      petugas: string;
    }
  | {
      ok: false;
      konflik: true;
      stokTerbaru: number;
      stokDilihat: number;
      jumlahMutasi: number;
      netMutasi: number;
    };
