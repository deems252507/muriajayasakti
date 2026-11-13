import { createFileRoute } from "@tanstack/react-router";

/** Manifest aplikasi (nama + ikon di layar utama HP) yang mengikuti identitas toko. */
export const Route = createFileRoute("/brand/manifest")({
  server: {
    handlers: {
      GET: async () => {
        let nama = "Muria Jaya Sakti";
        let icons: Array<Record<string, string>> = [
          { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ];
        try {
          const { shopManifestInfo } = await import("@/lib/shop/logic.server");
          const info = await shopManifestInfo();
          nama = info.nama;
          if (info.custom) {
            const src = `/brand/shop-icon?v=${info.version}`;
            icons = [
              { src, sizes: "192x192", type: "image/png", purpose: "any" },
              { src, sizes: "512x512", type: "image/png", purpose: "any" },
            ];
          }
        } catch {
          /* pakai nama dan ikon bawaan */
        }
        const body = {
          name: nama,
          short_name: nama.length > 14 ? nama.slice(0, 14).trim() : nama,
          id: "/",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0b1220",
          theme_color: "#0b1220",
          icons,
        };
        return new Response(JSON.stringify(body), {
          headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" },
        });
      },
    },
  },
});
