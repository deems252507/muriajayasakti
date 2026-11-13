import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Shell } from "@/components/shop/shell";
import { getMe } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop")({
  beforeLoad: async ({ location }: { location: { pathname: string } }) => {
    const me = await getMe();
    if (!me) throw redirect({ to: "/" });
    // Staf (pengecek barang) hanya boleh Daftar Sparepart dan Chat Staff.
    if (me.role === "Staf") {
      const path = location.pathname.replace(/\/+$/, "") || "/";
      if (!["/barang", "/chat"].includes(path)) throw redirect({ to: "/barang" });
    }
    // Pengaturan (termasuk password) hanya untuk Admin 1.
    if (!me.canManageStaff && (location.pathname.replace(/\/+$/, "") || "/") === "/pengaturan") {
      throw redirect({ to: me.role === "Kasir" ? "/kasir" : "/dashboard" });
    }
    return { me };
  },
  component: ShopLayout,
});

function ShopLayout() {
  const { me } = Route.useRouteContext();
  return (
    <Shell me={me}>
      <Outlet />
    </Shell>
  );
}
