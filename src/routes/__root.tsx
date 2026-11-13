import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/lib/confirm";
import appCss from "../styles.css?url";

/**
 * Platform menyisipkan manifest dan apple-touch-icon bawaan di akhir <head>. Buang keduanya di browser
 * supaya yang dipakai hanya ikon dan nama toko (ikut berganti saat logo diganti di Pengaturan).
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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, interactive-widget=resizes-content" },
      { title: "Muria Jaya Sakti" },
      { name: "theme-color", content: "#0b1220" },
      { name: "description", content: "Muria Jaya Sakti - Integrated Business System" },
      { name: "apple-mobile-web-app-title", content: "Muria Jaya Sakti" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
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
