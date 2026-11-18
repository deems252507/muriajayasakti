import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateOwnProfile } from "@/lib/shop/api";

/** Foto dikecilkan jadi 160x160 (sama seperti di halaman Pengaturan) supaya ringan disimpan. */
function shrinkPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Foto tidak bisa diproses"));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto tidak bisa dibaca"));
    };
    image.src = url;
  });
}

/** Jendela "Profil Saya": hanya ubah nama dan foto akun sendiri (simpan memakai fungsi yang sama dengan halaman Pengaturan). */
export function ProfileDialog({ me, onClose }: { me: { name: string; photo: string }; onClose: () => void }) {
  const [name, setName] = useState(me.name);
  const [photo, setPhoto] = useState(me.photo || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    void updateOwnProfile({ data: { name, photo } })
      .then(() => { toast.success("Profil berhasil diperbarui"); window.location.reload(); })
      .catch((err: Error) => { setBusy(false); toast.error(err.message); });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Profil Saya" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold">Profil Saya</h2>
            <p className="mt-0.5 text-xs text-muted">Ubah nama dan foto akun Anda. Password diatur oleh Admin 1.</p>
          </div>
          <button type="button" aria-label="Tutup" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100" onClick={onClose} disabled={busy}>
            <X className="size-4" />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={save}>
          <div className="flex items-center gap-3">
            {photo
              ? <img src={photo} alt="" className="size-16 rounded-full object-cover ring-1 ring-line" />
              : <span className="grid size-16 place-items-center rounded-full bg-blue-100 text-lg font-bold text-accent">{name.slice(0, 1).toUpperCase()}</span>}
            <label className="cursor-pointer text-xs font-bold text-accent">
              Pilih foto
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void shrinkPhoto(file).then(setPhoto).catch((err: Error) => toast.error(err.message));
                }}
              />
            </label>
            {photo ? <button type="button" aria-label="Hapus foto" className="text-xs text-danger" onClick={() => setPhoto("")}>Hapus foto</button> : null}
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">Nama tampilan</span>
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" aria-label="Batal" className="h-10 rounded-xl border border-line px-4 text-sm font-medium" onClick={onClose} disabled={busy}>Batal</button>
            <button type="submit" aria-label="Simpan Nama dan Foto" className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy}>{busy ? "Menyimpan..." : "Simpan Nama dan Foto"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
