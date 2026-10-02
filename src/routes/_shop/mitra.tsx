import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { deletePartner, listPartners, savePartner } from "@/lib/shop/api";
import type { Partner } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/mitra")({ component: MitraPage });

function MitraPage() {
  const me = Route.useRouteContext().me;
  const [rows, setRows] = useState<Partner[]>([]);
  const [form, setForm] = useState({ id: null as number | null, nama: "", tipe: "Pelanggan", telp: "", alamat: "" });
  const [open, setOpen] = useState(false);

  function load() { void listPartners().then(setRows); }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-extrabold">Data Pelanggan & Supplier</h2>
          {me.role === "Admin" ? <PrimaryButton onClick={() => { setForm({ id: null, nama: "", tipe: "Pelanggan", telp: "", alamat: "" }); setOpen(true); }}>Tambah Data</PrimaryButton> : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wide text-muted uppercase"><tr><th className="px-2 py-2">Nama</th><th>Tipe</th><th>No. HP</th><th>Alamat</th><th></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-2 py-2 font-medium">{row.nama}</td>
                  <td>{row.tipe}</td>
                  <td>{row.telp || "-"}</td>
                  <td>{row.alamat || "-"}</td>
                  <td className="text-right">
                    {me.role === "Admin" ? (
                      <>
                        <button className="h-11 px-2 text-sm" onClick={() => { setForm(row); setOpen(true); }}>Edit</button>
                        <button className="h-11 px-2 text-sm text-danger" onClick={() => void deletePartner({ data: { id: row.id } }).then(load)}>Hapus</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {open && me.role === "Admin" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form className="w-full max-w-md space-y-3 rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            void savePartner({ data: form }).then(() => { toast.success("Tersimpan"); setOpen(false); load(); }).catch((err: Error) => toast.error(err.message));
          }}>
            <h3 className="font-semibold">{form.id ? "Ubah data" : "Tambah Data"}</h3>
            <Field label="Nama"><input className={inputClass} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
            <Field label="Tipe">
              <select className={inputClass} value={form.tipe} onChange={(e) => setForm({ ...form, tipe: e.target.value })}>
                <option>Pelanggan</option>
                <option>Supplier</option>
              </select>
            </Field>
            <Field label="No. HP"><input className={inputClass} value={form.telp} onChange={(e) => setForm({ ...form, telp: e.target.value })} /></Field>
            <Field label="Alamat"><input className={inputClass} value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="h-11 px-3" onClick={() => setOpen(false)}>Batal</button>
              <PrimaryButton type="submit">Simpan</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
