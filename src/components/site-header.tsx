import { NAP } from "@/lib/nap";
import { Link } from "@tanstack/react-router";
import itechloungeLogo from "@/assets/itechlounge-logo.webp";
import {
  ShoppingBag,
  ReceiptText,
  MapPin,
  Facebook,
  Instagram,
  Youtube,
  Music2,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { openCookieSettings } from "@/lib/cookie-consent";
import { GOOGLE_REVIEWS_URL, SOCIAL_PROFILES, type SocialPlatform } from "@/lib/social-media";
// Compressed WebP: the original logo was a 500 KB PNG on every page.
import logo from "@/assets/cafe1-logo.webp";
import { useCart } from "@/lib/cart";
import { useSession } from "@/hooks/use-auth";
import { useTab } from "@/lib/tab";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.67-.06-1.32-.17-1.95H12v3.7h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.27z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A9.99 9.99 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.89A6.02 6.02 0 0 1 6.09 12c0-.66.11-1.3.32-1.89V7.52H3.07A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.07 4.48l3.34-2.59z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.78.5 3.82 1.5l2.86-2.86C16.95 2.99 14.7 2 12 2A9.99 9.99 0 0 0 3.07 7.52l3.34 2.59C7.2 7.74 9.4 5.98 12 5.98z"
      />
    </svg>
  );
}

export function SiteHeader() {
  const c = useCart();
  const { user } = useSession();
  const tabSession = useTab();
  const [open, setOpen] = useState(false);
  const count = c.items.reduce((s, i) => s + i.qty, 0);
  const links: { to: string; label: string; exact?: boolean }[] = [
    { to: "/", label: "Home", exact: true },
    { to: "/menu", label: "Menu" },
    { to: "/order-direct", label: "Why order direct" },
    { to: "/blog", label: "Blog" },
    { to: "/socials", label: "Socials" },
    { to: "/about", label: "About" },
    { to: "/contact", label: "Contact" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logo}
            alt="Café 1 logo"
            className="h-14 w-auto sm:h-16"
            width={64}
            height={64}
            fetchPriority="high"
          />
          <span className="sr-only">Café 1</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium lg:flex">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            Home
          </Link>
          <Link
            to="/menu"
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            Menu
          </Link>
          <Link
            to="/order-direct"
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            Why order direct
          </Link>
          <Link
            to="/blog"
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            Blog
          </Link>
          <Link
            to="/socials"
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            Socials
          </Link>
          <Link
            to="/about"
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            About
          </Link>
          <Link
            to="/contact"
            activeProps={{ className: "text-primary" }}
            className="hover:text-primary"
          >
            Contact
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {tabSession && (
            <Link
              to="/tab"
              className="hidden items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary lg:inline-flex"
              title={`Tab: ${tabSession.name}`}
            >
              <ReceiptText className="h-3.5 w-3.5" />
              <span className="max-w-[8rem] truncate">{tabSession.name}</span>
            </Link>
          )}
          <Link
            to="/cart"
            className="relative inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:border-primary hover:text-primary"
          >
            <ShoppingBag className="h-4 w-4" />
            Cart
            {count > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </Link>
          {user ? (
            <Link to="/account" className="hidden text-sm font-medium hover:text-primary lg:inline">
              Account
            </Link>
          ) : (
            <Link to="/auth" className="hidden text-sm font-medium hover:text-primary lg:inline">
              Sign in
            </Link>
          )}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:border-primary hover:text-primary lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-6 flex flex-col gap-1 text-base font-medium">
                {links.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    activeOptions={l.exact ? { exact: true } : undefined}
                    activeProps={{ className: "text-primary" }}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-2.5 hover:bg-muted hover:text-primary"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="my-2 h-px bg-border" />
                <Link
                  to={user ? "/account" : "/auth"}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 hover:bg-muted hover:text-primary"
                >
                  {user ? "My account" : "Sign in"}
                </Link>
                {tabSession && (
                  <Link
                    to="/tab"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-3 py-2.5 text-primary hover:bg-muted"
                  >
                    Tab: {tabSession.name}
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const icons: Record<SocialPlatform, typeof Facebook> = {
    facebook: Facebook,
    instagram: Instagram,
    tiktok: Music2,
    youtube: Youtube,
  };
  const profiles = SOCIAL_PROFILES.map((profile) => ({
    href: profile.url,
    label: `Café 1 on ${profile.label}`,
    Icon: icons[profile.platform],
  }));
  return (
    <footer className="mt-24 border-t border-border bg-secondary/50 pb-16 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <img
              src={logo}
              alt="Café 1 logo"
              className="h-10 w-auto"
              width={40}
              height={40}
              loading="lazy"
            />
            <span>© {new Date().getFullYear()}</span>
          </div>
          <address className="flex flex-col gap-1 not-italic">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {NAP.name}, {NAP.streetAddress}, {NAP.addressLocality}, {NAP.addressRegion}{" "}
              {NAP.postalCode}
            </span>
            <span className="flex flex-wrap items-center gap-x-3">
              <a href={`tel:${NAP.telephone.replace(/\s/g, "")}`} className="hover:text-primary">
                {NAP.telephone}
              </a>
              <a href={`mailto:${NAP.email}`} className="hover:text-primary">
                {NAP.email}
              </a>
            </span>
          </address>
          <div className="mt-3 flex items-center gap-2">
            {[
              {
                href: GOOGLE_REVIEWS_URL,
                label: "Café 1 on Google",
                Icon: GoogleIcon,
              },
              ...profiles,
            ].map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                title={label}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-2">
          <a href="/breakfast-st-albans" className="hover:text-primary">
            Breakfast in St Albans
          </a>
          <a href="/halal-food-st-albans" className="hover:text-primary">
            Halal food in St Albans
          </a>
          <a href="/lunch-st-albans" className="hover:text-primary">
            Lunch in St Albans
          </a>
          <Link to="/menu" className="hover:text-primary">
            Menu
          </Link>
          <Link to="/order-direct" className="hover:text-primary">
            Why order direct
          </Link>
          <Link to="/blog" className="hover:text-primary">
            Blog
          </Link>
          <Link to="/socials" className="hover:text-primary">
            Socials
          </Link>
          <Link to="/about" className="hover:text-primary">
            About
          </Link>
          <Link to="/contact" className="hover:text-primary">
            Contact
          </Link>
          <Link to="/privacy" className="hover:text-primary">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-primary">
            Terms &amp; Conditions
          </Link>
          <Link to="/cookies" className="hover:text-primary">
            Cookie Policy
          </Link>
          <Link to="/gdpr" className="hover:text-primary">
            GDPR
          </Link>
          <Link to="/complaints" className="hover:text-primary">
            Complaints
          </Link>
          <button onClick={openCookieSettings} className="text-left hover:text-primary">
            Cookie settings
          </button>
        </nav>
      </div>
      <div className="border-t border-border bg-secondary/50 py-4 text-center text-xs text-muted-foreground">
        <span className="mx-auto max-w-6xl px-4">
          A project by{" "}
          <a
            href="https://itechlounge.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 align-middle font-medium text-foreground transition hover:text-primary"
          >
            <img
              src={itechloungeLogo}
              alt="iTechLounge"
              width={112}
              height={112}
              className="h-7 w-auto"
              loading="lazy"
              decoding="async"
            />
            iTechLounge
          </a>
        </span>
      </div>
    </footer>
  );
}
