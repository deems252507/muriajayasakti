import { createServerFn } from "@tanstack/react-start";

/** Alamat situs yang sedang dibuka (https://domain-anda), untuk gambar preview saat link dibagikan. */
export const getSiteOrigin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const first = (value: string | null) => (value ?? "").split(",")[0].trim();
    const host = first(request.headers.get("x-forwarded-host")) || first(request.headers.get("host")) || new URL(request.url).host;
    const proto = first(request.headers.get("x-forwarded-proto")) || "https";
    return host ? `${proto}://${host}` : "";
  } catch {
    return "";
  }
});
