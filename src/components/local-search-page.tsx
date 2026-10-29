import {
  ArrowRight,
  BadgeCheck,
  Bike,
  Clock3,
  Coffee,
  MapPin,
  Salad,
  UtensilsCrossed,
} from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/site-header";
import heroImage from "@/assets/cafe1-hero.webp";
import { NAP } from "@/lib/nap";

export type LocalSearchPageConfig = {
  eyebrow: string;
  title: string;
  intro: string;
  path: string;
  imageAlt: string;
  highlights: Array<{ title: string; text: string }>;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
  faqs: Array<{ question: string; answer: string }>;
};

const guideLinks = [
  { href: "/breakfast-st-albans", label: "Breakfast in St Albans" },
  { href: "/halal-food-st-albans", label: "Halal food in St Albans" },
  { href: "/lunch-st-albans", label: "Lunch in St Albans" },
];

export function LocalSearchPage({ config }: { config: LocalSearchPageConfig }) {
  const currentLinks = guideLinks.filter((link) => link.href !== config.path);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border bg-secondary/45">
          <div className="pointer-events-none absolute -left-28 top-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1fr_0.86fr] lg:items-center lg:py-20">
            <div className="relative z-10">
              <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
                <ol className="flex flex-wrap items-center gap-2">
                  <li>
                    <a href="/" className="hover:text-primary">
                      Home
                    </a>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="font-medium text-foreground">
                    {config.eyebrow}
                  </li>
                </ol>
              </nav>
              <p className="mt-7 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                {config.eyebrow}
              </p>
              <h1 className="mt-3 max-w-3xl font-display text-5xl font-bold leading-[0.98] sm:text-6xl">
                {config.title}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {config.intro}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/menu"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover"
                >
                  View the live menu <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/contact"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-6 font-semibold hover:border-primary hover:text-primary"
                >
                  Plan your visit <MapPin className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="relative">
              <img
                src={heroImage}
                alt={config.imageAlt}
                width={1200}
                height={960}
                fetchPriority="high"
                className="aspect-[5/4] w-full rounded-[2rem] object-cover shadow-brand-lg"
              />
              <div className="absolute -bottom-5 left-4 right-4 rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur sm:left-8 sm:right-8">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold">All food served at Café 1 is halal</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Ask our team about ingredients, suppliers, dietary requirements or allergens.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-soft" aria-label="Café 1 essentials">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                Icon: Clock3,
                title: "Monday to Friday",
                text: "Open 8am–5pm. Closed weekends and public holidays.",
              },
              {
                Icon: MapPin,
                title: "AL1 3JU",
                text: "Inside St Albans Crown Court on Bricket Road.",
              },
              {
                Icon: Bike,
                title: "Four ways to order",
                text: "Dine in, take away, collect or choose local delivery.",
              },
              {
                Icon: Coffee,
                title: "Breakfast to lunch",
                text: "Coffee, all-day breakfast, hot meals and lighter choices.",
              },
            ].map(({ Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="mt-3 font-display text-lg font-bold">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                What you can order
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold">Made for a real working day.</h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Choose from the current menu when you order. Availability and prices can change, so
                the live menu is always the source of truth.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {config.highlights.map((highlight, index) => {
                const Icon = [UtensilsCrossed, Salad, Coffee, BadgeCheck][index % 4];
                return (
                  <article key={highlight.title} className="card-3d card-3d-hover p-6">
                    <span className="icon-3d-soft h-11 w-11">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-display text-xl font-bold">{highlight.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {highlight.text}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/35">
          <div className="mx-auto max-w-4xl space-y-12 px-4 py-16 lg:py-20">
            {config.sections.map((section) => (
              <article key={section.heading}>
                <h2 className="font-display text-3xl font-bold">{section.heading}</h2>
                <div className="mt-4 space-y-4 leading-7 text-muted-foreground">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.bullets && (
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {section.bullets.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-sm"
                      >
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 lg:py-20" aria-labelledby="local-faq">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Useful answers
          </p>
          <h2 id="local-faq" className="mt-2 font-display text-4xl font-bold">
            Before you order or visit
          </h2>
          <div className="mt-7 divide-y divide-border rounded-2xl border border-border bg-card px-5 sm:px-7">
            {config.faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 font-semibold marker:hidden">
                  {faq.question}
                  <span
                    className="float-right text-primary group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] opacity-80">
                  Café 1 St Albans
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                  Order online or visit us at the Crown Court.
                </h2>
                <p className="mt-3 max-w-2xl opacity-90">
                  {NAP.streetAddress}, {NAP.addressLocality}, {NAP.postalCode}. Collection, dine-in
                  and takeaway are available 8am–5pm; delivery runs 8:30am–4:30pm on open weekdays.
                </p>
              </div>
              <a
                href="/menu"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 font-semibold text-primary shadow-lg hover:bg-white/90"
              >
                Order from the menu <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <nav aria-label="More local food guides" className="mt-8 flex flex-wrap gap-3">
            <span className="py-2 text-sm font-semibold">More local guides:</span>
            {currentLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/blog"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              St Albans food journal
            </a>
          </nav>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
