import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

const MIN = 1;
const MAX = 6;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type View = { s: number; x: number; y: number };

/**
 * Foto yang bisa di-zoom seperti WhatsApp:
 * - HP: cubit dua jari, ketuk dua kali, geser saat sudah diperbesar, geser kiri/kanan (foto lain) & geser bawah (tutup) saat ukuran normal
 * - Komputer: scroll mouse / cubit trackpad, klik dua kali, seret, tombol + / -, tombol keyboard + - 0
 * Zoom ditangani sendiri (touch-action: none), jadi halaman di belakangnya TIDAK ikut ter-zoom dan tidak pecah.
 */
export function ZoomableImage({
  src,
  alt,
  onSwipe,
  onSwipeDown,
  onTap,
  hideControls,
}: {
  src: string;
  alt: string;
  onSwipe?: (dir: 1 | -1) => void;
  onSwipeDown?: () => void;
  /** Satu ketukan (bukan ketuk dua kali): dipakai untuk menampilkan / menyembunyikan tombol & strip foto, seperti WhatsApp. */
  onTap?: () => void;
  hideControls?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [view, setViewState] = useState<View>({ s: 1, x: 0, y: 0 });
  const viewRef = useRef<View>(view);
  const [dragging, setDragging] = useState(false);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  /** Batasi geseran supaya foto tidak keluar terlalu jauh dari layar. */
  const limit = useCallback((v: View): View => {
    const b = box.current;
    const i = img.current;
    if (!b || !i) return v;
    const s = clamp(v.s, MIN, MAX);
    if (s <= 1.001) return { s: 1, x: 0, y: 0 };
    const maxX = Math.max(0, (i.offsetWidth * s - b.clientWidth) / 2);
    const maxY = Math.max(0, (i.offsetHeight * s - b.clientHeight) / 2);
    return { s, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
  }, []);

  /** Ubah skala dengan titik (cx, cy) di layar tetap berada di bawah jari / kursor. */
  const zoomAt = useCallback(
    (nextScale: number, cx: number, cy: number) => {
      const b = box.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const px = cx - (r.left + r.width / 2);
      const py = cy - (r.top + r.height / 2);
      const v = viewRef.current;
      const s = clamp(nextScale, MIN, MAX);
      const k = s / v.s;
      setView(limit({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }));
    },
    [limit, setView],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const b = box.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      zoomAt(viewRef.current.s * factor, r.left + r.width / 2, r.top + r.height / 2);
    },
    [zoomAt],
  );

  // Scroll mouse / cubit trackpad (ctrl+wheel) -> zoom ke arah kursor. Harus non-passive agar halaman tidak ikut ter-zoom.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      const k = e.ctrlKey ? 0.012 : 0.0018;
      zoomAt(viewRef.current.s * Math.exp(-e.deltaY * unit * k), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Cegah zoom bawaan browser. iPhone (iOS Safari) MENGABAIKAN user-scalable=no / maximum-scale, jadi satu-satunya cara
  // yang andal: batalkan sentuhan 2 jari (touchstart/touchmove non-passive) dan event gesture* milik Safari.
  // Dipasang di document selama foto terbuka agar cubitan di bagian mana pun layar tidak men-zoom halaman.
  useEffect(() => {
    const block = (e: Event) => { if (e.cancelable) e.preventDefault(); };
    const multi = (e: TouchEvent) => {
      const scaled = typeof (e as TouchEvent & { scale?: number }).scale === "number" && (e as TouchEvent & { scale?: number }).scale !== 1;
      if ((e.touches.length > 1 || scaled) && e.cancelable) e.preventDefault();
    };
    const opt = { passive: false } as AddEventListenerOptions;
    document.addEventListener("touchstart", multi, opt);
    document.addEventListener("touchmove", multi, opt);
    document.addEventListener("gesturestart", block, opt);
    document.addEventListener("gesturechange", block, opt);
    document.addEventListener("gestureend", block, opt);
    return () => {
      document.removeEventListener("touchstart", multi);
      document.removeEventListener("touchmove", multi);
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
      document.removeEventListener("gestureend", block);
    };
  }, []);

  // Keyboard: + / - / 0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") zoomCenter(1.4);
      else if (e.key === "-" || e.key === "_") zoomCenter(1 / 1.4);
      else if (e.key === "0") setView({ s: 1, x: 0, y: 0 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomCenter, setView]);

  // ---- Pointer (sentuh + mouse) ----
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startDist: number;
    startView: View;
    startMid: { x: number; y: number };
  } | null>(null);
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const tap = useRef<{ x: number; y: number; t: number; moved: boolean; multi: boolean; downOnImg: boolean } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const tapTimer = useRef<number | null>(null);
  useEffect(() => () => { if (tapTimer.current !== null) window.clearTimeout(tapTimer.current); }, []);

  const mid = () => {
    const a = [...pts.current.values()];
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    box.current?.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) {
      pan.current = { x: e.clientX, y: e.clientY, view: viewRef.current };
      tap.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false, multi: false, downOnImg: e.target === img.current };
    } else if (pts.current.size === 2) {
      const m = mid();
      gesture.current = { startDist: m.d || 1, startView: viewRef.current, startMid: { x: m.x, y: m.y } };
      pan.current = null;
      if (tap.current) tap.current.multi = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const t = tap.current;
    if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) t.moved = true;

    if (pts.current.size >= 2 && gesture.current) {
      const b = box.current;
      if (!b) return;
      const g = gesture.current;
      const m = mid();
      const r = b.getBoundingClientRect();
      const s = clamp(g.startView.s * (m.d / g.startDist), MIN * 0.9, MAX);
      // titik konten di bawah titik tengah awal tetap menempel di titik tengah sekarang
      const sx = g.startMid.x - (r.left + r.width / 2);
      const sy = g.startMid.y - (r.top + r.height / 2);
      const cx = m.x - (r.left + r.width / 2);
      const cy = m.y - (r.top + r.height / 2);
      const k = s / g.startView.s;
      setView(limit({ s, x: cx - (sx - g.startView.x) * k, y: cy - (sy - g.startView.y) * k }));
      return;
    }

    const p = pan.current;
    if (p && viewRef.current.s > 1.001) {
      setDragging(true);
      setView(limit({ s: viewRef.current.s, x: p.view.x + (e.clientX - p.x), y: p.view.y + (e.clientY - p.y) }));
    }
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    const wasSingle = pts.current.size === 1;
    pts.current.delete(e.pointerId);
    try { box.current?.releasePointerCapture(e.pointerId); } catch { /* sudah dilepas */ }
    setDragging(false);

    if (pts.current.size === 1) {
      // dari 2 jari kembali 1 jari: lanjut menggeser tanpa melompat
      const rest = [...pts.current.values()][0];
      pan.current = { x: rest.x, y: rest.y, view: viewRef.current };
      gesture.current = null;
      return;
    }
    if (pts.current.size > 0) return;

    gesture.current = null;
    pan.current = null;
    if (viewRef.current.s < 1.02) setView({ s: 1, x: 0, y: 0 });
    const t = tap.current;
    tap.current = null;
    if (!t || !wasSingle || t.multi || e.type === "pointercancel") return;

    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    const dt = Date.now() - t.t;

    // Geser saat ukuran normal: pindah foto / tutup
    if (viewRef.current.s <= 1.001) {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { onSwipe?.(dx < 0 ? 1 : -1); return; }
      if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.3) { onSwipeDown?.(); return; }
    }

    // Ketukan
    if (!t.moved && dt < 400) {
      const last = lastTap.current;
      if (last && Date.now() - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
        lastTap.current = null;
        if (tapTimer.current !== null) { window.clearTimeout(tapTimer.current); tapTimer.current = null; }
        if (viewRef.current.s > 1.05) setView({ s: 1, x: 0, y: 0 });
        else zoomAt(2.6, e.clientX, e.clientY);
        return;
      }
      lastTap.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      // Tunggu sebentar: kalau ternyata ketuk dua kali (zoom), ketukan pertama dibatalkan.
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => { tapTimer.current = null; onTap?.(); }, 300);
    }
  };

  const pct = Math.round(view.s * 100);
  const btn = "grid size-9 place-items-center rounded-full bg-white/90 text-slate-900 shadow disabled:opacity-40";

  return (
    <>
      <div
        ref={box}
        className="absolute inset-0 flex select-none items-center justify-center overflow-hidden px-0 pb-28 pt-14"
        style={{ touchAction: "none", cursor: dragging ? "grabbing" : view.s > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <img
          ref={img}
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full rounded-lg object-contain"
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
            transition: dragging || pts.current.size > 0 ? "none" : "transform 0.18s ease-out",
            willChange: "transform",
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTouchCallout: "none",
            touchAction: "none",
          }}
        />
      </div>
      <div
        className={`absolute bottom-28 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-2 py-1.5 transition-opacity [@media(pointer:fine)]:flex ${hideControls ? "pointer-events-none opacity-0" : "opacity-100"}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={btn} aria-label="Perkecil" disabled={view.s <= 1.001} onClick={() => zoomCenter(1 / 1.5)}><Minus className="size-4" /></button>
        <button type="button" className="min-w-14 text-center text-xs font-bold text-white" aria-label="Ukuran asli" onClick={() => setView({ s: 1, x: 0, y: 0 })}>{pct}%</button>
        <button type="button" className={btn} aria-label="Perbesar" disabled={view.s >= MAX - 0.001} onClick={() => zoomCenter(1.5)}><Plus className="size-4" /></button>
      </div>
    </>
  );
}
