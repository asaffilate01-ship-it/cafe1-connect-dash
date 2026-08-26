import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Clock3,
  Heart,
  Landmark,
  Leaf,
  MapPin,
  ShieldCheck,
  Truck,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/site-header";
import hero from "@/assets/cafe1-hero.webp";
import { localBusinessJsonLd } from "@/lib/nap";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  canonicalLink,
  jsonLdScript,
  seoMeta,
  webPageJsonLd,
} from "@/lib/seo";

const title = "About Café 1 | Independent Halal Café in St Albans";
const description =
  "Meet Café 1, an independent halal café open to the public at St Albans Crown Court, serving all-day breakfast, lunch and coffee on weekdays.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: seoMeta({ title, description, path: "/about", image: hero }),
    links: [canonicalLink("/about")],
    scripts: [
      jsonLdScript(localBusinessJsonLd(absoluteUrl(hero))),
      jsonLdScript(webPageJsonLd({ name: title, description, path: "/about" })),
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "About Café 1", path: "/about" },
        ]),
      ),
    ],
  }),
  component: About,
});

const customerGroups = [
  {
    Icon: Landmark,
    title: "Court community",
    text: "Breakfast, lunch and refreshments for jurors, visitors, legal professionals and court staff.",
  },
  {
    Icon: Users,
    title: "Everyone is welcome",
    text: "We are open to local workers, residents and the general public—not only people attending court.",
  },
  {
    Icon: Truck,
    title: "Made for your day",
    text: "Dine in, take away, collect an online order or choose local delivery within half a mile.",
  },
];

function About() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-secondary/50">
          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:py-20">
            <div className="relative z-10">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                Independent since 2008
              </p>
              <h1 className="mt-4 max-w-3xl font-display text-5xl font-bold leading-[0.98] sm:text-6xl">
                Good food, good prices and a friendly welcome.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Café 1 brings freshly prepared, 100% halal breakfasts, lunches, snacks and drinks to
                St Albans Crown Court—with the same honest value our customers have trusted in Luton
                since 2008.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/menu"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90"
                >
                  Explore the menu <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  Plan your visit <MapPin className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-[2rem] border border-white/50 bg-card p-2 shadow-2xl shadow-primary/10">
                <img
                  src={hero}
                  alt="A selection of Café 1 breakfasts, lunches and hot meals"
                  className="aspect-[4/3] w-full rounded-[1.6rem] object-cover"
                  width={1200}
                  height={960}
                  fetchPriority="high"
                />
              </div>
              <div className="absolute -bottom-5 left-4 right-4 flex items-center gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:right-5 sm:w-72">
                <span className="icon-3d-soft h-11 w-11 shrink-0">
                  <Leaf className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">Freshly prepared</p>
                  <p className="text-xs text-muted-foreground">
                    Clear halal, vegetarian and dietary choices.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20" aria-labelledby="our-story">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Our story
              </p>
              <h2 id="our-story" className="mt-2 font-display text-4xl font-bold">
                Local roots, a new St Albans chapter.
              </h2>
              <p className="mt-5 leading-relaxed text-muted-foreground">
                Café 1 started serving the Luton community in 2008 and grew into two popular local
                locations. In May 2026, we opened at St Albans Crown Court, bringing that same
                straightforward promise to a new community: generous choice, sensible prices and
                service that feels personal.
              </p>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Whether you have ten minutes between appointments or time to sit down, our team is
                here to make ordering simple and your visit genuinely welcoming.
              </p>
            </div>

            <ol className="relative space-y-6 border-l border-primary/25 pl-7">
              <li className="relative card-3d rounded-3xl border border-border bg-card p-6">
                <span className="absolute -left-[2.15rem] top-7 h-3 w-3 rounded-full border-4 border-background bg-primary" />
                <p className="text-sm font-bold text-primary">2008</p>
                <h3 className="mt-1 font-display text-2xl font-bold">Café 1 begins in Luton</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  A neighbourhood café built around affordable food, a broad menu and friendly
                  service.
                </p>
              </li>
              <li className="relative card-3d rounded-3xl border border-border bg-card p-6">
                <span className="absolute -left-[2.15rem] top-7 h-3 w-3 rounded-full border-4 border-background bg-primary" />
                <p className="text-sm font-bold text-primary">May 2026</p>
                <h3 className="mt-1 font-display text-2xl font-bold">St Albans opens</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Our newest café opens at St Albans Crown Court for the court community and the
                  wider public.
                </p>
              </li>
              <li className="relative card-3d rounded-3xl border border-primary/30 bg-primary-soft p-6">
                <span className="absolute -left-[2.15rem] top-7 h-3 w-3 rounded-full border-4 border-background bg-primary" />
                <p className="text-sm font-bold text-primary">Today</p>
                <h3 className="mt-1 font-display text-2xl font-bold">In café and online</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Dine-in, takeaway, pickup and tightly local delivery, backed by our own ordering
                  and loyalty experience.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/45">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Who we serve
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold">
                A café for the whole community.
              </h2>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {customerGroups.map(({ Icon, title, text }) => (
                <article
                  key={title}
                  className="card-3d card-3d-hover rounded-3xl border border-border bg-card p-6"
                >
                  <span className="icon-3d h-12 w-12">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 font-display text-2xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
          <div className="grid overflow-hidden rounded-[2rem] border border-border bg-neutral-950 text-white shadow-2xl lg:grid-cols-[1fr_0.75fr]">
            <div className="p-8 sm:p-10">
              <Heart className="h-8 w-8 text-primary" />
              <h2 className="mt-5 font-display text-4xl font-bold">
                Straightforward food. Thoughtful service.
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-white/65">
                We keep the things that matter clear: fair prices, reliable opening times, food made
                with care and dietary information that helps you choose confidently.
              </p>
              <Link
                to="/menu"
                className="mt-7 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
              >
                Browse the Café 1 menu <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-1">
              {[
                {
                  Icon: Clock3,
                  title: "Mon–Fri",
                  text: "Dine-in, pickup and takeaway · 08:00–17:00",
                },
                {
                  Icon: Truck,
                  title: "Local delivery",
                  text: "08:30–16:30 · within half a mile of AL1 3JU",
                },
                {
                  Icon: ShieldCheck,
                  title: "Clear choices",
                  text: "100% halal with vegetarian and dietary labels",
                },
                {
                  Icon: UtensilsCrossed,
                  title: "Closed",
                  text: "Weekends and England/Wales bank holidays",
                },
              ].map(({ Icon, title, text }) => (
                <div key={title} className="flex items-start gap-4 bg-neutral-950 p-6">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-white/55">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
