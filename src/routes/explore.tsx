import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CafeWorld } from "@/components/cafe-world";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { money } from "@/lib/format";

export const Route = createFileRoute("/explore")({
  head: () => ({ meta: [{ title: "Explore the 3D café | Café 1 St Albans" }] }),
  component: Explore,
});
function Explore() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const menu = useQuery({
    queryKey: ["world-menu"],
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id,name,description,price_cents,image_url,allergens,dietary_tags")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const filtered = useMemo(
    () =>
      (menu.data ?? []).filter((i) =>
        `${i.name} ${i.description ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [menu.data, query],
  );
  const visible = useMemo(() => filtered.slice(page * 12, (page + 1) * 12), [filtered, page]);
  const items = useMemo(
    () => visible.map((i) => ({ id: i.id, name: i.name, detail: money(i.price_cents) })),
    [visible],
  );
  const item = menu.data?.find((i) => i.id === selected);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Cafe 1 • St Albans
        </p>
        <h1 className="text-4xl font-bold">Step inside the menu.</h1>
        <p>
          Explore our current products in a 3D café. Select a display for details, then use our menu
          to customise and order.
        </p>
        <label className="block">
          Find a product
          <input
            className="mt-2 block w-full rounded-xl border p-3"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search food and drinks"
          />
        </label>
        {menu.isPending ? (
          <p role="status">Loading the café menu…</p>
        ) : menu.isError ? (
          <div role="alert">
            The menu could not be loaded.{" "}
            <button onClick={() => menu.refetch()} className="underline">
              Try again
            </button>
          </div>
        ) : (
          <>
            <p>
              {filtered.length} products · Showing {visible.length}
            </p>
            {!filtered.length ? (
              <p>No products match your search.</p>
            ) : (
              <CafeWorld items={items} onSelect={setSelected} />
            )}
            <div className="flex items-center gap-4">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border px-4 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                Page {page + 1} / {Math.max(1, Math.ceil(filtered.length / 12))}
              </span>
              <button
                disabled={(page + 1) * 12 >= filtered.length}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-4 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </>
        )}
        {item && (
          <section aria-live="polite" className="rounded-2xl border bg-muted/30 p-6">
            <button className="float-right underline" onClick={() => setSelected(null)}>
              Close details
            </button>
            <h2 className="text-2xl font-bold">{item.name}</h2>
            <p className="my-2 text-xl">{money(item.price_cents)}</p>
            {item.image_url && (
              <img
                src={item.image_url}
                alt={item.name}
                className="my-4 h-48 rounded-xl object-cover"
              />
            )}
            <p>{item.description}</p>
            <p className="my-3">
              Allergens: {item.allergens?.join(", ") || "Please ask our team before ordering."}
            </p>
            <Link
              to="/menu"
              className="inline-block rounded-xl bg-primary px-5 py-3 text-primary-foreground"
            >
              Customise and order from the menu
            </Link>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
