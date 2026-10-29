import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { useSession, useRoles } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  MonitorPlay,
  Bike,
  BookOpen,
  Megaphone,
  ReceiptText,
  UserCog,
  Settings,
  Image as ImageIcon,
  Ticket,
  BadgePercent,
  Boxes,
  ClipboardCheck,
  Clock3,
  ShieldCheck,
  Building2,
  QrCode,
} from "lucide-react";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff — Cafe1" },
      { name: "description", content: "Cafe1 staff hub." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  return (
    <RequireRole roles={["admin", "staff", "driver"]} next="/staff">
      <StaffHub />
    </RequireRole>
  );
}

function StaffHub() {
  const { user, loading } = useSession();
  const { roles, has } = useRoles(user);
  void loading;

  const cards = [
    {
      to: "/staff-hours" as const,
      icon: Clock3,
      title: "My hours & pay",
      desc: "Approved phones, attendance, hours and gross pay.",
      show: has("admin") || has("staff") || has("driver"),
    },
    {
      to: "/admin" as const,
      icon: LayoutDashboard,
      title: "Admin dashboard",
      desc: "Orders, menu, drivers.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/menu" as const,
      icon: BookOpen,
      title: "Menu manager",
      desc: "Categories, items, modifiers, images.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/operations" as const,
      icon: ClipboardCheck,
      title: "Daily controls",
      desc: "Opening, closing, Friday accounts and month-end sign-off.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/inventory" as const,
      icon: Boxes,
      title: "Inventory & recipes",
      desc: "Stock, waste, portions, food cost and stocktakes.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/staff-ops" as const,
      icon: Clock3,
      title: "Clock in & hours",
      desc: "Individual shifts, breaks and payroll-ready hours.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/broadcasts" as const,
      icon: Megaphone,
      title: "Broadcasts",
      desc: "Publish offers and announcements.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/banners" as const,
      icon: ImageIcon,
      title: "Promo banners",
      desc: "Hero carousel for home & menu.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/promos" as const,
      icon: Ticket,
      title: "Promo codes",
      desc: "Discount codes for checkout.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/customer-discounts" as const,
      icon: BadgePercent,
      title: "Approved members",
      desc: "Who gets the member discount, by email.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/vouchers" as const,
      icon: Ticket,
      title: "Court vouchers",
      desc: "Daily allowances & weekly reimbursement report.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/juror-attendance" as const,
      icon: QrCode,
      title: "Jury-room attendance",
      desc: "Generate approved short-life attendance QR codes.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/settings" as const,
      icon: Settings,
      title: "Store settings",
      desc: "Hours, fees, minimum order.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/accounts" as const,
      icon: ReceiptText,
      title: "Tab accounts",
      desc: "Business tabs, access codes and bills.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/admin/users" as const,
      icon: UserCog,
      title: "Users & roles",
      desc: "Grant staff, driver or admin access.",
      show: has("admin"),
    },
    {
      to: "/admin/security" as const,
      icon: ShieldCheck,
      title: "Security & alerts",
      desc: "Audit events, suspicious attempts and operational alerts.",
      show: has("admin"),
    },
    {
      to: "/admin/locations" as const,
      icon: Building2,
      title: "Sites & legal entities",
      desc: "Keep each Cafe 1 company, location and channel separated.",
      show: has("admin"),
    },
    {
      to: "/kds" as const,
      icon: MonitorPlay,
      title: "Kitchen display",
      desc: "Live tickets for the kitchen.",
      show: has("admin") || has("staff"),
    },
    {
      to: "/driver" as const,
      icon: Bike,
      title: "Driver app",
      desc: "Pick up and deliver orders.",
      show: has("admin") || has("driver"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-4xl font-bold">Staff tools</h1>
        <p className="mt-1 text-muted-foreground">
          Signed in as {user?.email} · roles: {roles.join(", ") || "customer"}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards
            .filter((c) => c.show)
            .map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-brand"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <c.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-semibold">{c.title}</p>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
              </Link>
            ))}
          {!has("admin") && !has("staff") && !has("driver") && (
            <p className="text-sm text-muted-foreground">
              You don't have staff access. An admin can grant a role in the user_roles table.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
