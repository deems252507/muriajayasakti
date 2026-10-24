import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/persist";
import { toast } from "sonner";
import { Field, inputClass, Panel, PrimaryButton } from "@/components/shop/shell";
import { CommentButton, useComments } from "@/components/shop/comment-ui";
import { deletePartner, listPartners, savePartner } from "@/lib/shop/api";
import type { Partner } from "@/lib/shop/types";

export const Route = createFileRoute("/_shop/mitra")({ component: MitraPage });

type Tipe = "Pelanggan" | "Supplier";
const emptyForm = (tipe: Tipe) => ({ id: null as number | null, nama: "", tipe: tipe as string, telp: "", alamat: "" });

function MitraPage() {
  const me = Route.useRouteContext().me;
  const isAdmin = me.role === "Admin";
  const [rows, setRows] = useState<Partner[]>([]);
  const [tab, setTab] = usePersistedState<Tipe>("mitra:tab", "Pelanggan");
  const [q, setQ] = usePersistedState("mitra:q", "");
  const [form, setForm] = useState(emptyForm("Pelanggan"));
  const [open, setOpen] = useState(false);

  function load() { void listPartners().then(setRows).catch((err: Error) => toast.error(err.message)); }
  useEffect(() => { load(); }, []);

  const count = useMemo(() => ({
    Pelanggan: rows.filter((row) => row.tipe === "Pelanggan").length,
    Supplier: rows.filter((row) => row.tipe === "Supplier").length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((row) => row.tipe === tab)
      .filter((row) => !needle || `${row.nama} ${row.telp} ${row.alamat}`.toLowerCase().includes(needle))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  }, [rows, tab, q]);

  function remove(row: Partner) {
    if (!window.confirm(`Hapus ${row.tipe.toLowerCase()} "${row.nama}"?`)) return;
    void deletePartner({ data: { id: row.id } })
      .then(() => { toast.success(`${row.tipe} berhasil dihapus`, { description: row.nama }); load(); })
      .catch((err: Error) => toast.error(err.message));
  }

  const tabs: Tipe[] = ["Pelanggan", "Supplier"];

  const comments = useComments("mitra", shown.map((r) => r.id));

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold">Pelanggan & Supplier</h2>
            <p className="mt-0.5 text-xs text-muted">Pelanggan dipakai di Kasir dan Bon. Supplier dipakai di Barang Masuk Pemasok.</p>
          </div>
          {isAdmin ? (
            <PrimaryButton onClick={() => { setForm(emptyForm(tab)); setOpen(true); }}>+ Tambah {tab}</PrimaryButton>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { setTab(item); setQ(""); }}
                className={`h-10 rounded-lg px-4 text-sm font-semibold transition ${tab === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {item}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${tab === item ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}>{count[item]}</span>
              </button>
            ))}
          </div>
          <input
            className={`${inputClass} sm:max-w-xs`}
            placeholder={`Cari ${tab.toLowerCase()} (nama, HP, alamat)`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="w-12 px-3 py-2">No</th>
                <th className="px-2 py-2">Nama {tab}</th>
                <th className="px-2 py-2">No. HP</th>
                <th className="px-2 py-2">Alamat</th>
                {isAdmin ? <th className="px-2 py-2 text-right">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => (
                <tr key={row.id} {...comments.row(row.id, `${row.tipe}: ${row.nama}`)} className="border-t border-line hover:bg-slate-50">
                  <td className="px-3 py-2 text-muted">{index + 1}</td>
                  <td className="px-2 py-2 font-medium">{row.nama}</td>
                  <td className="px-2 py-2">{row.telp || "-"}</td>
                  <td className="px-2 py-2">{row.alamat || "-"}</td>
                  {isAdmin ? (
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <span className="mr-2 inline-block align-middle"><CommentButton kind="mitra" refId={row.id} label={`${row.tipe}: ${row.nama}`} mark={comments.marks[String(row.id)]} size="h-9 w-9" /></span>
                      <button className="h-9 rounded-lg border border-line px-3 text-sm font-medium" onClick={() => { setForm(row); setOpen(true); }}>Edit</button>
                      <button className="ml-2 h-9 rounded-lg border border-red-200 px-3 text-sm font-medium text-danger" onClick={() => remove(row)}>Hapus</button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-3 py-8 text-center text-sm text-muted">
                    {q.trim() ? `Tidak ada ${tab.toLowerCase()} yang cocok dengan "${q}".` : `Belum ada data ${tab.toLowerCase()}.`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      {open && isAdmin ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form className="w-full max-w-md space-y-3 rounded-2xl bg-panel p-4" onSubmit={(e) => {
            e.preventDefault();
            if (!form.nama.trim()) return toast.error("Nama wajib diisi.");
            void savePartner({ data: form }).then(() => { toast.success(form.id ? `${form.tipe} berhasil diubah` : `${form.tipe} berhasil ditambahkan`, { description: form.nama }); setOpen(false); setTab(form.tipe as Tipe); load(); }).catch((err: Error) => toast.error(err.message));
          }}>
            <h3 className="font-semibold">{form.id ? `Ubah ${form.tipe}` : `Tambah ${form.tipe}`}</h3>
            <Field label="Nama"><input className={inputClass} autoFocus value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
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
