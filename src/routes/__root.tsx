import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/lib/confirm";
import { getSiteOrigin } from "@/lib/shop/site-origin";
import appCss from "../styles.css?url";

/**
 * Pastikan hanya ada satu manifest dan satu apple-touch-icon: milik toko (ikut berganti saat logo diganti di Pengaturan).
 */
function BrandLinks() {
  useEffect(() => {
    document.head.querySelectorAll('link[rel="manifest"]').forEach((link) => {
      if (link.getAttribute("href") !== "/brand/manifest") link.remove();
    });
    document.head.querySelectorAll('link[rel="apple-touch-icon"]').forEach((link) => {
      if (!(link.getAttribute("href") ?? "").startsWith("/brand/shop-icon")) link.remove();
    });
  }, []);
  return null;
}

export const Route = createRootRoute({
  loader: async () => {
    try {
      return { origin: await getSiteOrigin() };
    } catch {
      return { origin: "" };
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, interactive-widget=resizes-content" },
      { title: "Muria Jaya Sakti" },
      { name: "theme-color", content: "#0b1220" },
      { name: "description", content: "Muria Jaya Sakti - Integrated Business System" },
      { name: "apple-mobile-web-app-title", content: "Muria Jaya Sakti" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      // Kartu preview saat link dibagikan (WhatsApp, dll.): memakai gambar logo toko.
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Muria Jaya Sakti" },
      { property: "og:title", content: "Muria Jaya Sakti" },
      { property: "og:description", content: "Muria Jaya Sakti - Integrated Business System" },
      ...(loaderData?.origin
        ? [
            { property: "og:image", content: `${loaderData.origin}/brand/og.jpg` },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { name: "twitter:card", content: "summary_large_image" },
            { name: "twitter:image", content: `${loaderData.origin}/brand/og.jpg` },
          ]
        : []),
    ],
    links: [
      { rel: "icon", href: "/brand/shop-icon", type: "image/png" },
      { rel: "shortcut icon", href: "/brand/shop-icon", type: "image/png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/brand/manifest" },
      { rel: "apple-touch-icon", href: "/brand/shop-icon", sizes: "180x180" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="id" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <BrandLinks />
        <Toaster position="top-center" richColors closeButton />
        <ConfirmHost />
        <Scripts />
      </body>
    </html>
  ),
});
