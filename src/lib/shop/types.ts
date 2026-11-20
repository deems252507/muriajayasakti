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
  /** Boleh menambah barang/stok gudang dan mengambil barang dari gudang (Admin selalu; Kasir/Staf bila dipilih Admin). */
  canGudang?: boolean;
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

export type OpnameFilter = "semua" | "belum" | "sudah" | "selisih" | "ulang" | "habis" | "sistem0" | "draft";

/** Hitungan sementara satu lokasi (belum mengubah stok sistem). */
export type OpnameDraftEntry = {
  id?: number;
  lokasi: string;
  /** Dalam satuan dasar barang. */
  jumlah: number;
  /** Seperti yang diketik petugas (mis. 10 Dus). */
  qty: number;
  satuan: string;
  petugas?: string;
  diubah?: string;
  catatan?: string;
};

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
  draftTotal: number;
  draft: OpnameDraftEntry[];
  /** Diisi bila pemeriksaan terakhir ditandai perlu cek ulang oleh Admin (bukan karena stok berubah). */
  resetPada: string | null;
  resetOleh: string;
};

/** Barang yang punya hitungan sementara (tab Hitungan Sementara). */
export type OpnameDraftItem = Product & {
  total: number;
  jumlahLokasi: number;
  tertua: string | null;
  rincian: OpnameDraftEntry[];
  mutasiN: number;
  mutasiNet: number;
};

export type OpnameSummary = {
  total: number;
  sudah: number;
  belum: number;
  ulang: number;
  selisih: number;
  habis: number;
  sistem0: number;
  /** Barang yang sedang dihitung (punya hitungan sementara). */
  draft: number;
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
  /** Catatan ini pemeriksaan terakhir barang dan stok belum berubah: stok bisa dikembalikan saat dihapus. */
  bisaKembali: boolean;
  /** Pemeriksaan terakhir yang belum diterapkan ke stok dan stok belum berubah: bisa diterapkan. */
  bisaTerapkan: boolean;
  diterapkanPada: string | null;
  /** Rincian hitungan per lokasi bila pemeriksaan ini dari Hitungan Sementara. */
  rincian: OpnameDraftEntry[] | null;
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
      rincian?: OpnameDraftEntry[];
    }
  | {
      ok: false;
      konflik: true;
      stokTerbaru: number;
      stokDilihat: number;
      jumlahMutasi: number;
      netMutasi: number;
    };

/** Hasil konfirmasi hitungan sementara: sama seperti simpan biasa, ditambah peringatan bila stok berubah sejak hitungan pertama. */
export type OpnameConfirmResult =
  | OpnameSaveResult
  | { ok: false; peringatan: true; jumlahMutasi: number; netMutasi: number; stokSekarang: number; total: number };

/* ===== Stok Gudang ===== */
export type GudangTipe = "MASUK" | "PINDAH" | "KOREKSI" | "OPNAME";

export type GudangItem = {
  productId: number;
  kode: string;
  partNumber: string;
  partNumbersAlt: string;
  nama: string;
  kategori: string;
  merek: string;
  kodePajak: string;
  satuan: string;
  satuanAlt: string;
  isiSatuanAlt: number;
  /** Stok gudang dan stok toko dalam satuan dasar. */
  stokGudang: number;
  stokToko: number;
  /** Opname gudang terakhir (null = belum pernah) dan selisihnya. */
  opnamePada: string | null;
  opnameSelisih: number | null;
};

export type GudangLog = {
  id: number;
  productId: number;
  kode: string;
  nama: string;
  partNumber: string;
  satuan: string;
  satuanAlt: string;
  isiSatuanAlt: number;
  tipe: GudangTipe;
  jumlah: number;
  qtyInput: number;
  satuanInput: "base" | "alt";
  catatan: string;
  oleh: string;
  olehNama: string;
  tanggal: string;
  dicek: boolean;
  dicekNama: string;
  dicekPada: string | null;
  diubahNama: string;
  diubahPada: string | null;
  /** Barang masih ada di daftar gudang, jadi entri ini masih bisa diedit/dihapus. */
  itemAda: boolean;
};

export type GudangPickItem = {
  productId: number;
  kode: string;
  partNumber: string;
  partNumbersAlt: string;
  nama: string;
  kategori: string;
  merek: string;
  kodePajak: string;
  satuan: string;
  satuanAlt: string;
  isiSatuanAlt: number;
  stokToko: number;
  sudahDiGudang: boolean;
};

export type GudangResult = { ok: true; stokGudang: number; stokToko?: number; baru?: boolean; logId?: number } | { ok: false; pesan: string };
