import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bike,
  Coffee,
  Croissant,
  MapPin,
  BadgeCheck,
  UtensilsCrossed,
  ChefHat,
  Flame,
  Sandwich,
  CupSoda,
  Egg,
  Salad,
  Clock3,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PromoBanner } from "@/components/promo-banner";
import { PromoCarousel } from "@/components/promo-carousel";
import { StoreStatus } from "@/components/store-status";
// Compressed WebP: the original hero was a 740 KB JPEG and was the slowest
// thing on first paint.
import heroImage from "@/assets/cafe1-hero.webp";
import { localBusinessJsonLd } from "@/lib/nap";
import { absoluteUrl, canonicalLink, jsonLdScript, seoMeta, webPageJsonLd } from "@/lib/seo";

const title = "Halal Café in St Albans | Breakfast & Lunch | Café 1";
const description =
  "Visit Café 1 for halal breakfast and lunch in St Albans: all-day breakfast, Desi favourites, hot meals and coffee at Crown Court, AL1 3JU.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: seoMeta({ title, description, path: "/", image: heroImage }),
    links: [
      canonicalLink("/"),
      { rel: "preload", as: "image", href: heroImage, fetchPriority: "high" },
    ],
    scripts: [
      jsonLdScript(localBusinessJsonLd(absoluteUrl(heroImage))),
      jsonLdScript(
        webPageJsonLd({
          name: title,
          description,
          path: "/",
          about: ["Halal café in St Albans", "Breakfast in St Albans", "Lunch in St Albans"],
        }),
      ),
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <PromoBanner />
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <PromoCarousel />
      </div>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <StoreStatus />
            <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] sm:text-6xl">
              British Classics. Desi Favourites.
              <br />
              <span className="text-primary">One Great Menu.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Enjoy all-day breakfasts, hot meals, paninis, parathas, cakes, coffees and more from
              Café 1 at St Albans Crown Court. Open to the public — everyone welcome.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/menu"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover"
              >
                Order now <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/menu"
                className="inline-flex h-12 items-center rounded-full border border-border bg-card px-6 font-semibold hover:border-primary hover:text-primary"
              >
                View menu
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" /> All food is halal
              </div>
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" /> Open to the public
              </div>
              <div className="flex items-center gap-2">
                <Bike className="h-4 w-4 text-primary" /> Local delivery
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Cafe 1, St Albans Crown Court, AL1 3JU
              </div>
            </div>
          </div>

          <div className="relative">
            <img
              src={heroImage}
              alt="Café 1 spread: full English breakfast, fish and chips, loaded fries and a mug of tea"
              width={1200}
              height={960}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="aspect-square w-full rounded-[2rem] object-cover shadow-brand-lg"
            />
            <div className="card-3d absolute -bottom-6 -left-6 hidden max-w-xs p-5 sm:block">
              <div className="flex items-center gap-3">
                <span className="icon-3d h-11 w-11">
                  <UtensilsCrossed className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Customer favourite
                  </p>
                  <p className="font-semibold">Full Desi Breakfast · £9.99</p>
                </div>
              </div>
            </div>
            <div className="card-3d absolute -right-4 top-8 hidden p-4 sm:block">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Ready in</p>
              <p className="font-display text-2xl font-bold text-primary">~20 min</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-background" aria-labelledby="opening-hours">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
          <div className="card-3d grid gap-6 p-6 sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <span className="icon-3d h-14 w-14">
              <Clock3 className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Opening hours
              </p>
              <h2 id="opening-hours" className="mt-1 font-display text-2xl font-bold sm:text-3xl">
                Monday to Friday · 8:00am–5:00pm
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Dine-in, takeaway and collection are available throughout café hours. Delivery runs
                from 8:30am–4:30pm.
              </p>
            </div>
            <div className="rounded-2xl bg-soft px-5 py-4 text-sm lg:text-right">
              <p className="font-semibold">Saturday &amp; Sunday</p>
              <p className="text-muted-foreground">Closed, including bank holidays</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-soft">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Coffee,
              title: "Freshly ground coffee",
              body: "Lazy Cow coffee, ground for espresso drinks and served throughout the day.",
            },
            { icon: BadgeCheck, title: "100% halal", body: "All food served at Café 1 is halal." },
            {
              icon: Croissant,
              title: "Made fresh daily",
              body: "Fresh desi food cooked to order, alongside paninis, wraps and all-day breakfasts.",
            },
            {
              icon: Bike,
              title: "Local delivery",
              body: "Eligible addresses within half a mile can order online and track delivery from a phone.",
            },
          ].map((f) => (
            <div key={f.title} className="card-3d card-3d-hover p-6">
              <span className="icon-3d h-14 w-14">
                <f.icon className="h-6 w-6" />
              </span>
              <h2 className="mt-5 font-display text-xl font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="st-albans-food-guides">
        <div className="card-3d mb-16 grid gap-6 p-8 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Order direct
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              Same food, café prices, no app fees.
            </h2>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Ordering here means counter pricing, loyalty points on every order, live driver
              tracking and support that goes straight to the café — not a delivery platform.
            </p>
            <Link
              to="/order-direct"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover"
            >
              See why it's better <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              "No third-party service fees",
              "Loyalty points on every direct order",
              "Live tracking with our own drivers",
              "Tabs and weekly statements for offices",
            ].map((point) => (
              <li key={point} className="flex items-center gap-3 rounded-2xl bg-soft px-4 py-3">
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-medium">{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Eat in St Albans
          </p>
          <h2 id="st-albans-food-guides" className="mt-2 font-display text-4xl font-bold">
            Breakfast, halal food and lunch—made simple.
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Explore what we serve, how to order and what to know before visiting our café inside St
            Albans Crown Court.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            {
              href: "/breakfast-st-albans",
              title: "Breakfast in St Albans",
              body: "Cooked breakfast, Desi breakfast, parathas and omelettes served all day.",
            },
            {
              href: "/halal-food-st-albans",
              title: "Halal food in St Albans",
              body: "How our halal menu works across breakfast, sandwiches and hot meals.",
            },
            {
              href: "/lunch-st-albans",
              title: "Lunch in St Albans",
              body: "Hot lunches, paninis, wraps, rolls and collection for a busy weekday.",
            },
          ].map((guide) => (
            <a key={guide.href} href={guide.href} className="card-3d card-3d-hover group p-6">
              <h3 className="font-display text-2xl font-bold group-hover:text-primary">
                {guide.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{guide.body}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                Read the guide <ArrowRight className="h-4 w-4" />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-border bg-soft px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="card-3d mx-auto max-w-3xl p-8 text-center sm:p-12">
            <span className="icon-3d-soft mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UtensilsCrossed className="h-6 w-6" />
            </span>
            <h2 className="mt-6 font-display text-4xl font-bold sm:text-5xl">Hungry?</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Browse the menu, drop things in your basket, pay in a tap.
            </p>
            <Link
              to="/menu"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover"
            >
              Start your order <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: Egg, label: "Breakfast", href: "/menu" },
              { icon: Flame, label: "Desi Breakfast", href: "/menu" },
              { icon: ChefHat, label: "Cafe 1 Classics", href: "/menu" },
              { icon: Sandwich, label: "Sandwiches", href: "/menu" },
              { icon: CupSoda, label: "Drinks", href: "/menu" },
              { icon: Salad, label: "Salads", href: "/menu" },
            ].map((cat) => (
              <Link
                key={cat.label}
                to={cat.href}
                className="card-3d card-3d-hover group flex flex-col items-center gap-3 p-5 text-center"
              >
                <span className="icon-3d-soft flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <cat.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">{cat.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
