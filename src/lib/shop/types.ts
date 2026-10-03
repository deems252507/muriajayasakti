export type Role = "Owner" | "Admin" | "Kasir";

export type Staff = {
  username: string;
  role: Role;
  name: string;
  shift: string;
  status: string;
  photo: string;
  mustChange?: boolean;
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
