import { createFileRoute } from "@tanstack/react-router";

/**
 * Ikon aplikasi yang mengikuti logo toko (favicon, ikon layar utama HP, ikon notifikasi).
 * Belum ada logo sendiri = pakai ikon bawaan.
 */
export const Route = createFileRoute("/brand/shop-icon")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        let badge = false;
        try {
          const { shopIconImage } = await import("@/lib/shop/logic.server");
          badge = new URL(request.url).searchParams.get("badge") === "1";
          const image = await shopIconImage(badge ? "badge" : "icon");
          if (image) {
            const etag = `"${image.version}"`;
            const headers = { etag, "cache-control": "no-cache" };
            if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
            return new Response(new Uint8Array(image.bytes), { headers: { ...headers, "content-type": image.type } });
          }
        } catch {
          /* gagal baca logo: pakai ikon bawaan di bawah, jangan sampai tab/ikon kosong */
        }
        return new Response(null, { status: 302, headers: { location: badge ? "/brand/badge.png" : "/brand/icon-192.png", "cache-control": "no-cache" } });
      },
    },
  },
});
