import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { SiteSwitcher } from "@/components/site-switcher";
import { CafeWorld } from "@/components/cafe-world";
import { useSites } from "@/hooks/use-sites";
import { getOperationsDashboard } from "@/lib/operations.functions";
import { money } from "@/lib/format";
export const Route = createFileRoute("/admin/world")({
  head: () => ({
    meta: [{ title: "3D operations | Café 1" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequireRole roles={["admin", "staff"]} next="/admin/world">
      <WorldDashboard />
    </RequireRole>
  ),
});
function WorldDashboard() {
  const sites = useSites();
  const navigate = useNavigate();
  const getDashboard = useServerFn(getOperationsDashboard);
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const result = useQuery({
    queryKey: ["world-operations", sites.siteId, date],
    enabled: Boolean(sites.siteId),
    queryFn: () => getDashboard({ data: { site_id: sites.siteId!, business_date: date } }),
    refetchInterval: 60000,
  });
  const d = result.data;
  const items = useMemo(
    () =>
      d
        ? [
            {
              id: "/admin/reports",
              name: "Sales & reporting",
              detail: `${money(d.today.net_sales_cents)} net sales`,
            },
            {
              id: "/kds",
              name: "Kitchen",
              detail: `${d.today.orders} orders for selected date`,
              color: "#da9644",
            },
            {
              id: "/admin/inventory",
              name: "Stock room",
              detail: `${d.low_stock_count} low-stock alerts`,
              color: "#588b64",
            },
            {
              id: "/admin/pos",
              name: "Counter & tills",
              detail: `${d.open_shifts.length} open shifts`,
            },
            {
              id: "/admin/operations",
              name: "Daily controls",
              detail: `${d.checklists.filter((c) => c.completed).length}/${d.checklists.length} complete`,
              color: "#588b64",
            },
            {
              id: "/admin/operations",
              name: "Operations alerts",
              detail: `${d.unresolved_alerts} unresolved`,
              color: "#da9644",
            },
            { id: "/driver", name: "Delivery desk", detail: "Open driver workspace" },
            { id: "/admin/menu", name: "Product catalogue", detail: "Manage products & modifiers" },
          ]
        : [],
    [d],
  );
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <h1 className="text-3xl font-bold">Your café, at a glance.</h1>
        <p>
          Select a station to open its working dashboard. Figures refresh every minute; kitchen and
          stock stations are navigation, not live physical tracking.
        </p>
        <SiteSwitcher
          sites={sites.sites}
          siteId={sites.siteId}
          onChange={sites.setSiteId}
          loading={sites.loading}
          error={sites.error}
        />
        <label className="block">
          Business date{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
            className="rounded border p-2"
          />
        </label>
        <button className="rounded border px-4 py-2" onClick={() => result.refetch()}>
          Refresh data
        </button>
        {!sites.siteId ? (
          <p>Select a site to load operations.</p>
        ) : result.isPending ? (
          <p role="status">Loading authorised operations…</p>
        ) : result.isError ? (
          <p role="alert">Operations could not be loaded. Check your access and try refreshing.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {d?.site?.name} · Last loaded{" "}
              {new Date(result.dataUpdatedAt).toLocaleTimeString("en-GB")}
            </p>
            <CafeWorld items={items} onSelect={(id) => void navigate({ to: id })} />
          </>
        )}
      </main>
    </>
  );
}
