import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Shell } from "@/components/shop/shell";
import { getMe } from "@/lib/shop/api";

export const Route = createFileRoute("/_shop")({
  beforeLoad: async () => {
    const me = await getMe();
    if (!me) throw redirect({ to: "/" });
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
