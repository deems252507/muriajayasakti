import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { inputClass, Panel } from "@/components/shop/shell";
import { listAudit } from "@/lib/shop/api";
import { when } from "@/lib/shop/format";

export const Route = createFileRoute("/_shop/jejak")({ component: JejakPage });

function JejakPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    void listAudit({ data: { q } }).then((data) => setRows(data as Array<Record<string, unknown>>)).catch(() => setRows([]));
  }, [q]);
  return (
    <Panel className="mx-auto max-w-4xl">
      <h2 className="text-lg font-extrabold">Riwayat Aktivitas</h2>
      <p className="mt-1 text-xs text-muted">Catatan aktivitas penting pengguna dan perubahan shift.</p>
      <input className={`${inputClass} mt-3`} placeholder="Cari Aktivitas" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] tracking-wide text-muted uppercase"><tr><th className="py-2">Waktu</th><th>Pengguna</th><th>Aktivitas</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={3} className="py-6 text-center text-muted">Belum ada aktivitas.</td></tr> : null}
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-line">
                <td className="py-2 text-xs text-muted">{when(String(row.ts))}</td>
                <td>{String(row.name)}<div className="text-[11px] text-muted">{String(row.username)}</div></td>
                <td>{String(row.action)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
