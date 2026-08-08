import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminNav } from "@/components/admin-nav";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/hooks/use-auth";
import { money } from "@/lib/format";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Image as ImageIcon,
  ChevronLeft,
  Save,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { getStaffMenuItems } from "@/lib/menu-operations.functions";

export const Route = createFileRoute("/admin/menu")({
  head: () => ({
    meta: [
      { title: "Menu manager — Cafe1" },
      {
        name: "description",
        content: "Manage Cafe1 menu categories, items, modifiers, prices and images.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MenuManager,
});

type Cat = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};
type Item = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_veg: boolean;
  loyalty_drink?: boolean;
  needs_cooking?: boolean;
  juror_menu?: boolean;
  is_beverage?: boolean;
  group_label: string | null;
  barcode: string | null;
  allergens: string[];
  dietary_tags: string[];
  cost_cents: number;
  prep_seconds: number;
  station_code: string;
  portion_note: string | null;
  sort_order: number;
  active: boolean;
};
type Mod = {
  id: string;
  category_id: string | null;
  item_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  sort_order: number;
  active: boolean;
  group_name: string | null;
  group_type: string;
  required: boolean;
  min_selections: number;
  max_selections: number | null;
  is_exclusive: boolean;
};

function MenuManager() {
  const { user, loading } = useSession();
  const { roles, loading: rolesLoading } = useRoles(user);
  const canManage = roles.includes("admin") || roles.includes("staff");
  const navigate = useNavigate();
  const getMenuItems = useServerFn(getStaffMenuItems);

  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [mods, setMods] = useState<Mod[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  /** Writes sort_order 10, 20, 30… so the public menu and till follow the sidebar. */
  const persistOrder = useCallback(async (ordered: Cat[]) => {
    setCats(ordered.map((c, i) => ({ ...c, sort_order: (i + 1) * 10 })));
    const results = await Promise.all(
      ordered.map((c, i) =>
        supabase
          .from("menu_categories")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", c.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) toast.error(failed.error.message);
    else toast.success("Category order saved");
  }, []);

  const reorderCategories = useCallback(
    async (from: number, to: number) => {
      if (to < 0 || to >= cats.length || from === to) return;
      const next = [...cats];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      await persistOrder(next);
    },
    [cats, persistOrder],
  );

  const moveCategory = useCallback(
    async (sourceId: string | null, targetId: string) => {
      setDragId(null);
      setDragOverId(null);
      if (!sourceId || sourceId === targetId) return;
      const from = cats.findIndex((c) => c.id === sourceId);
      const to = cats.findIndex((c) => c.id === targetId);
      if (from < 0 || to < 0) return;
      await reorderCategories(from, to);
    },
    [cats, reorderCategories],
  );

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/admin/login", search: { next: "/admin/menu" } });
  }, [loading, user, navigate]);

  const refresh = useCallback(async () => {
    const [c, i, m] = await Promise.all([
      supabase.from("menu_categories").select("*").order("sort_order"),
      getMenuItems(),
      supabase.from("menu_modifiers").select("*").order("sort_order"),
    ]);
    setCats((c.data ?? []) as Cat[]);
    setItems(i as Item[]);
    setMods((m.data ?? []) as Mod[]);
    if (c.data?.length) setSelectedCat((current) => current ?? c.data[0].id);
  }, [getMenuItems]);

  useEffect(() => {
    if (user && !rolesLoading && canManage) void refresh();
  }, [refresh, user, rolesLoading, canManage]);

  if (loading || rolesLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!canManage) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="font-display text-3xl font-bold">Access denied</h1>
        <p className="mt-2 text-muted-foreground">
          You need staff or admin role to manage the menu.
        </p>
        <Link to="/" className="mt-4 inline-block text-primary">
          ← Home
        </Link>
      </div>
    );
  }

  const cat = cats.find((c) => c.id === selectedCat) ?? null;
  const catItems = items.filter((i) => i.category_id === selectedCat);
  const catMods = mods.filter((m) => m.category_id === selectedCat);

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4">
          <div className="min-w-0">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Admin
            </Link>
            <h1 className="mt-1 truncate font-display text-2xl font-bold sm:text-3xl">
              Menu manager
            </h1>
          </div>
          <p className="shrink-0 text-right text-xs text-muted-foreground sm:text-sm">
            {cats.length} categories
            <span className="hidden sm:inline">
              {" "}
              · {items.length} items · {mods.length} modifiers
            </span>
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Categories sidebar */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-4 md:sticky md:top-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Categories</h2>
            <button
              onClick={async () => {
                const name = prompt("New category name");
                if (!name) return;
                const sort = (cats.at(-1)?.sort_order ?? 0) + 10;
                const { data, error } = await supabase
                  .from("menu_categories")
                  .insert({ name, sort_order: sort, active: true })
                  .select()
                  .single();
                if (error) return toast.error(error.message);
                setSelectedCat(data.id);
                refresh();
              }}
              className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"
              aria-label="Add category"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Drag to reorder — the menu follows this order.
          </p>
          <ul className="mt-2 space-y-1">
            {cats.map((c, index) => (
              <li
                key={c.id}
                draggable
                onDragStart={(e) => {
                  setDragId(c.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== c.id) setDragOverId(c.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void moveCategory(dragId, c.id);
                }}
                className={`flex items-center gap-1 rounded-lg ${dragOverId === c.id ? "ring-2 ring-primary" : ""} ${dragId === c.id ? "opacity-50" : ""}`}
              >
                <span
                  className="cursor-grab px-1 text-muted-foreground active:cursor-grabbing"
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <button
                  onClick={() => setSelectedCat(c.id)}
                  className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm transition ${selectedCat === c.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  <span className="font-medium">{c.name}</span>
                  {!c.active && <span className="ml-2 text-xs opacity-70">(hidden)</span>}
                </button>
                <span className="flex shrink-0 flex-col">
                  <button
                    aria-label={`Move ${c.name} up`}
                    disabled={index === 0}
                    onClick={() => void reorderCategories(index, index - 1)}
                    className="text-muted-foreground disabled:opacity-25"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={`Move ${c.name} down`}
                    disabled={index === cats.length - 1}
                    onClick={() => void reorderCategories(index, index + 1)}
                    className="text-muted-foreground disabled:opacity-25"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Editor */}
        <div className="space-y-6">
          {cat && (
            <CategoryEditor
              cat={cat}
              onSaved={refresh}
              onDeleted={() => {
                setSelectedCat(cats.find((c) => c.id !== cat.id)?.id ?? null);
                refresh();
              }}
            />
          )}

          {cat && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Items</h2>
                <button
                  onClick={async () => {
                    const sort = (catItems.at(-1)?.sort_order ?? 0) + 10;
                    const { error } = await supabase.from("menu_items").insert({
                      category_id: cat.id,
                      name: "New item",
                      price_cents: 0,
                      sort_order: sort,
                      active: true,
                      is_veg: false,
                    });
                    if (error) return toast.error(error.message);
                    refresh();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> Add item
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {catItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">No items yet.</p>
                )}
                {catItems.map((it) => (
                  <ItemRow key={it.id} it={it} onChanged={refresh} />
                ))}
              </div>
            </section>
          )}

          {cat && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Modifiers / add-ons</h2>
                <button
                  onClick={async () => {
                    const sort = (catMods.at(-1)?.sort_order ?? 0) + 10;
                    const { error } = await supabase.from("menu_modifiers").insert({
                      category_id: cat.id,
                      name: "New modifier",
                      price_cents: 0,
                      sort_order: sort,
                      active: true,
                    });
                    if (error) return toast.error(error.message);
                    refresh();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> Add modifier
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {catMods.length === 0 && (
                  <p className="text-sm text-muted-foreground">No modifiers yet.</p>
                )}
                {catMods.map((m) => (
                  <ModRow key={m.id} m={m} onChanged={refresh} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({
  cat,
  onSaved,
  onDeleted,
}: {
  cat: Cat;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState(cat);
  useEffect(() => setForm(cat), [cat]);
  const dirty = JSON.stringify(form) !== JSON.stringify(cat);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">Category details</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-muted-foreground">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Sort order</span>
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-muted-foreground">Description</span>
          <input
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value || null })}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active (visible on menu)
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          disabled={!dirty}
          onClick={async () => {
            const { error } = await supabase
              .from("menu_categories")
              .update({
                name: form.name,
                description: form.description,
                sort_order: form.sort_order,
                active: form.active,
              })
              .eq("id", cat.id);
            if (error) return toast.error(error.message);
            toast.success("Saved");
            onSaved();
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> Save
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Delete category "${cat.name}" and all its items?`)) return;
            const { error } = await supabase.from("menu_categories").delete().eq("id", cat.id);
            if (error) return toast.error(error.message);
            toast.success("Deleted");
            onDeleted();
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-destructive px-3 py-2 text-sm text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
      </div>
    </section>
  );
}

function ItemRow({ it, onChanged }: { it: Item; onChanged: () => void }) {
  const [form, setForm] = useState(it);
  const [priceText, setPriceText] = useState((it.price_cents / 100).toFixed(2));
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    setForm(it);
    setPriceText((it.price_cents / 100).toFixed(2));
  }, [it]);

  async function save(patch: Partial<Item>) {
    const next = { ...form, ...patch };
    setForm(next);
    const { error } = await supabase.from("menu_items").update(patch).eq("id", it.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  async function onFile(f: File) {
    setUploading(true);
    try {
      const path = `${it.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage
        .from("menu-images")
        .upload(path, f, { upsert: true, contentType: f.type });
      if (up.error) throw up.error;
      const { data } = await supabase.storage
        .from("menu-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = data?.signedUrl ?? null;
      await save({ image_url: url });
      toast.success("Image uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[96px_minmax(0,1fr)_auto]">
      <div className="space-y-1">
        <label className="group relative grid h-24 w-24 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted text-muted-foreground">
          {form.image_url ? (
            <img src={form.image_url} alt={form.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
              <ImageIcon className="h-5 w-5" /> Add photo
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {form.image_url && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
              Replace
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 grid place-items-center bg-black/60 text-xs text-white">
              Uploading…
            </span>
          )}
        </label>
        {form.image_url && (
          <button
            type="button"
            onClick={() => save({ image_url: null })}
            className="w-24 rounded-lg border border-border py-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onBlur={() => form.name !== it.name && save({ name: form.name })}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium"
          placeholder="Item name"
        />
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">£</span>
          <input
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            onBlur={() => {
              const n = Math.round(parseFloat(priceText || "0") * 100);
              if (!Number.isFinite(n)) return;
              setPriceText((n / 100).toFixed(2));
              if (n !== it.price_cents) save({ price_cents: n });
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            inputMode="decimal"
          />
        </div>
        <input
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          onBlur={() => {
            const v = form.description?.trim() || null;
            if (v !== it.description) save({ description: v });
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm sm:col-span-2"
          placeholder="Description (optional)"
        />
        <input
          value={form.group_label ?? ""}
          onChange={(e) => setForm({ ...form, group_label: e.target.value })}
          onBlur={() => {
            const v = form.group_label?.trim() || null;
            if (v !== it.group_label) save({ group_label: v });
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          placeholder="Sub-group label (optional)"
        />
        <input
          value={form.barcode ?? ""}
          onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          onBlur={() => {
            const value = form.barcode?.trim() || null;
            if (value !== it.barcode) void save({ barcode: value });
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          placeholder="Barcode / SKU"
          inputMode="numeric"
        />
        <select
          value={form.station_code || "PASS"}
          onChange={(e) => void save({ station_code: e.target.value })}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          aria-label="Kitchen station"
        >
          <option value="HOT">Hot kitchen</option>
          <option value="SANDWICH">Sandwich</option>
          <option value="DRINKS">Drinks</option>
          <option value="PASS">Pass / general</option>
        </select>
        <label className="grid grid-cols-[1fr_90px] items-center gap-2 rounded-lg border border-input px-3 text-sm">
          <span className="text-muted-foreground">Target prep</span>
          <input
            type="number"
            min={0}
            step={30}
            value={form.prep_seconds ?? 0}
            onChange={(e) => setForm({ ...form, prep_seconds: Number(e.target.value) })}
            onBlur={() => {
              const value = Math.max(0, Math.round(form.prep_seconds || 0));
              if (value !== it.prep_seconds) void save({ prep_seconds: value });
            }}
            className="w-full bg-transparent py-2 text-right outline-none"
            aria-label="Target preparation seconds"
          />
        </label>
        <label className="grid grid-cols-[1fr_90px] items-center gap-2 rounded-lg border border-input px-3 text-sm">
          <span className="text-muted-foreground">Unit cost</span>
          <input
            inputMode="decimal"
            defaultValue={(form.cost_cents / 100).toFixed(2)}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const value = raw ? Math.max(0, Math.round(Number(raw) * 100)) : 0;
              if (Number.isFinite(value) && value !== it.cost_cents) {
                void save({ cost_cents: value });
              }
            }}
            className="w-full bg-transparent py-2 text-right outline-none"
            aria-label="Unit cost in pounds"
            placeholder="£0.00"
          />
        </label>
        <input
          value={form.portion_note ?? ""}
          onChange={(e) => setForm({ ...form, portion_note: e.target.value })}
          onBlur={() => {
            const value = form.portion_note?.trim() || null;
            if (value !== it.portion_note) void save({ portion_note: value });
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          placeholder="Portion / recipe note"
        />
        <input
          value={(form.allergens ?? []).join(", ")}
          onChange={(e) =>
            setForm({
              ...form,
              allergens: e.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
          onBlur={() => {
            if (JSON.stringify(form.allergens ?? []) !== JSON.stringify(it.allergens ?? [])) {
              void save({ allergens: form.allergens ?? [] });
            }
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          placeholder="Allergens, comma separated"
        />
        <input
          value={(form.dietary_tags ?? []).join(", ")}
          onChange={(e) =>
            setForm({
              ...form,
              dietary_tags: e.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
          onBlur={() => {
            if (JSON.stringify(form.dietary_tags ?? []) !== JSON.stringify(it.dietary_tags ?? [])) {
              void save({ dietary_tags: form.dietary_tags ?? [] });
            }
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          placeholder="Dietary tags, comma separated"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground sm:col-span-2">
          <button
            type="button"
            onClick={() => {
              const next = !form.active;
              setForm({ ...form, active: next });
              save({ active: next });
            }}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${form.active ? "bg-emerald-600 text-white" : "bg-destructive text-destructive-foreground"}`}
            title="Hide this item from the menu when you run out"
          >
            {form.active ? "Available" : "Sold out"}
          </button>
          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={form.is_veg}
              onChange={(e) => {
                setForm({ ...form, is_veg: e.target.checked });
                save({ is_veg: e.target.checked });
              }}
            />
            Veg
          </label>
          <label
            className="inline-flex items-center gap-1"
            title="Counts towards the buy 10 get the 11th free coffee/tea card"
          >
            <input
              type="checkbox"
              checked={!!form.loyalty_drink}
              onChange={(e) => {
                setForm({ ...form, loyalty_drink: e.target.checked });
                save({ loyalty_drink: e.target.checked });
              }}
            />
            Loyalty drink
          </label>
          <label
            className="inline-flex items-center gap-1"
            title="Hot/cooked item — kitchen tickets containing it show BLUE"
          >
            <input
              type="checkbox"
              checked={!!form.needs_cooking}
              onChange={(e) => {
                setForm({ ...form, needs_cooking: e.target.checked });
                save({ needs_cooking: e.target.checked });
              }}
            />
            Needs cooking
          </label>
          <label
            className="inline-flex items-center gap-1"
            title="Shown on the dedicated Juror Menu"
          >
            <input
              type="checkbox"
              checked={!!form.juror_menu}
              onChange={(e) => {
                setForm({ ...form, juror_menu: e.target.checked });
                save({ juror_menu: e.target.checked });
              }}
            />
            Juror menu
          </label>
          <label
            className="inline-flex items-center gap-1"
            title="Drink — excluded from the juror 10% food discount"
          >
            <input
              type="checkbox"
              checked={!!form.is_beverage}
              onChange={(e) => {
                setForm({ ...form, is_beverage: e.target.checked });
                save({ is_beverage: e.target.checked });
              }}
            />
            Beverage
          </label>
          <span className="ml-auto font-semibold text-foreground">{money(form.price_cents)}</span>
        </div>
      </div>

      <div className="col-span-2 flex items-start justify-end md:col-span-1">
        <button
          onClick={async () => {
            if (!confirm(`Delete "${it.name}"?`)) return;
            const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
            if (error) return toast.error(error.message);
            onChanged();
          }}
          className="rounded-lg border border-destructive p-2 text-destructive"
          aria-label="Delete item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ModRow({ m, onChanged }: { m: Mod; onChanged: () => void }) {
  const [form, setForm] = useState(m);
  const [priceText, setPriceText] = useState((m.price_cents / 100).toFixed(2));
  useEffect(() => {
    setForm(m);
    setPriceText((m.price_cents / 100).toFixed(2));
  }, [m]);

  async function save(patch: Partial<Mod>) {
    setForm({ ...form, ...patch });
    const { error } = await supabase.from("menu_modifiers").update(patch).eq("id", m.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="grid items-center gap-2 rounded-lg border border-border bg-background p-2 md:grid-cols-[1fr_1fr_1fr_120px_auto_auto_auto]">
      <input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        onBlur={() => form.name !== m.name && save({ name: form.name })}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium"
        placeholder="Name"
      />
      <input
        value={form.group_name ?? ""}
        onChange={(e) => setForm({ ...form, group_name: e.target.value })}
        onBlur={() => {
          const v = form.group_name?.trim() || null;
          if (v !== m.group_name) save({ group_name: v });
        }}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        placeholder="Group e.g. Choose your flavour"
      />
      <input
        value={form.description ?? ""}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        onBlur={() => {
          const v = form.description?.trim() || null;
          if (v !== m.description) save({ description: v });
        }}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
        placeholder="Description"
      />
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">£</span>
        <input
          value={priceText}
          onChange={(e) => setPriceText(e.target.value)}
          onBlur={() => {
            const n = Math.round(parseFloat(priceText || "0") * 100);
            if (!Number.isFinite(n)) return;
            setPriceText((n / 100).toFixed(2));
            if (n !== m.price_cents) save({ price_cents: n });
          }}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          inputMode="decimal"
        />
      </div>
      <label className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => {
            setForm({ ...form, active: e.target.checked });
            save({ active: e.target.checked });
          }}
        />
        Active
      </label>
      <select
        value={form.group_type ?? "multi"}
        onChange={(e) => {
          setForm({ ...form, group_type: e.target.value });
          save({ group_type: e.target.value });
        }}
        className="rounded-lg border border-input bg-background px-2 py-2 text-sm"
        aria-label="Selection type"
      >
        <option value="multi">Multi-pick</option>
        <option value="single">Choose one</option>
      </select>
      <label className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={!!form.required}
          onChange={(e) => {
            setForm({ ...form, required: e.target.checked });
            save({ required: e.target.checked });
          }}
        />
        Required
      </label>
      <button
        onClick={async () => {
          if (!confirm(`Delete modifier "${m.name}"?`)) return;
          const { error } = await supabase.from("menu_modifiers").delete().eq("id", m.id);
          if (error) return toast.error(error.message);
          onChanged();
        }}
        className="rounded-lg border border-destructive p-2 text-destructive"
        aria-label="Delete modifier"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
