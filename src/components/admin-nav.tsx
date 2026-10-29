import { Link, useRouterState } from "@tanstack/react-router";
import { useSession, useRoles } from "@/hooks/use-auth";
import { signOutAndRedirect } from "@/lib/sign-out";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BadgePercent,
  BarChart3,
  Bike,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MonitorPlay,
  Newspaper,
  ReceiptText,
  Settings,
  ShieldCheck,
  Ticket,
  UserCog,
  QrCode,
} from "lucide-react";

type NavPath =
  | "/staff"
  | "/admin"
  | "/admin/menu"
  | "/admin/pos"
  | "/admin/reports"
  | "/admin/operations"
  | "/admin/inventory"
  | "/admin/staff-ops"
  | "/admin/security"
  | "/admin/locations"
  | "/admin/juror-attendance"
  | "/admin/blog"
  | "/admin/broadcasts"
  | "/admin/banners"
  | "/admin/promos"
  | "/admin/customer-discounts"
  | "/admin/court-staff"
  | "/admin/vouchers"
  | "/admin/settings"
  | "/admin/accounts"
  | "/admin/users"
  | "/landlord"
  | "/kds"
  | "/driver";

type Item = {
  to: NavPath;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  need?: "admin" | "driver";
};

const QUICK: Item[] = [
  { to: "/staff", label: "Hub", icon: Home },
  { to: "/admin", label: "Orders", icon: LayoutDashboard },
  { to: "/kds", label: "Kitchen", icon: MonitorPlay },
  { to: "/admin/pos", label: "Till", icon: Calculator },
];

const GROUPS: Array<{ label: string; items: Item[] }> = [
  {
    label: "Operations",
    items: [
      { to: "/admin/operations", label: "Daily controls", icon: ClipboardCheck },
      { to: "/admin/inventory", label: "Inventory & recipes", icon: Boxes },
      { to: "/admin/staff-ops", label: "Staff time", icon: Clock3 },
      { to: "/driver", label: "Driver", icon: Bike, need: "driver" },
      { to: "/admin/menu", label: "Menu & stock", icon: BookOpen },
    ],
  },
  {
    label: "Customers",
    items: [
      { to: "/admin/customer-discounts", label: "Members", icon: BadgePercent },
      { to: "/admin/court-staff", label: "Court staff", icon: ShieldCheck },
      { to: "/admin/vouchers", label: "Juror vouchers", icon: Ticket },
      { to: "/admin/juror-attendance", label: "Attendance QR", icon: QrCode },
      { to: "/admin/accounts", label: "Accounts & judge tabs", icon: ReceiptText },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/admin/blog", label: "Blog", icon: Newspaper },
      { to: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone },
      { to: "/admin/banners", label: "Display banners", icon: ImageIcon },
      { to: "/admin/promos", label: "Promo codes", icon: Ticket },
    ],
  },
  {
    label: "Management",
    items: [
      { to: "/admin/reports", label: "Financials & KPIs", icon: BarChart3, need: "admin" },
      { to: "/admin/settings", label: "Settings", icon: Settings },
      { to: "/admin/security", label: "Security & alerts", icon: ShieldCheck, need: "admin" },
      { to: "/admin/locations", label: "Sites & legal entities", icon: Building2, need: "admin" },
      { to: "/landlord", label: "Landlord & tenants", icon: Building2, need: "admin" },
      { to: "/admin/users", label: "Users & roles", icon: UserCog, need: "admin" },
    ],
  },
];

function isActive(pathname: string, to: NavPath) {
  return pathname === to || (to !== "/staff" && pathname.startsWith(`${to}/`));
}

export function AdminNav() {
  const { user } = useSession();
  const { has } = useRoles(user);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!user) return null;
  const isStaff = has("admin") || has("staff");
  const isDriver = has("driver");
  if (!isStaff && !isDriver) return null;

  const allowed = (item: Item) => {
    if (item.need === "admin") return has("admin");
    if (item.need === "driver") return isDriver || has("admin");
    return isStaff;
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2">
        <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
          Café1
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {QUICK.filter(allowed).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isActive(pathname, item.to)
                    ? "bg-primary text-primary-foreground shadow-brand"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}

          {GROUPS.map((group) => {
            const items = group.items.filter(allowed);
            if (!items.length) return null;
            const active = items.some((item) => isActive(pathname, item.to));
            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition ${
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    {group.label} <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-48">
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.to} asChild>
                        <Link to={item.to} className="flex cursor-pointer items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-border pl-2">
          <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">
            {user.email}
          </span>
          <button
            onClick={() => void signOutAndRedirect()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-brand transition hover:opacity-90"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
