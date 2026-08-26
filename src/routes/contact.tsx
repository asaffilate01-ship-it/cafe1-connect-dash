import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { MapPin, Phone, Mail, Clock, ArrowUpRight } from "lucide-react";
import { localBusinessJsonLd } from "@/lib/nap";
import { breadcrumbJsonLd, canonicalLink, jsonLdScript, seoMeta, webPageJsonLd } from "@/lib/seo";

const title = "Contact Café 1 St Albans | Hours, Address & Directions";
const description =
  "Find Café 1 at St Albans Crown Court, Bricket Road, AL1 3JU. Open Monday–Friday 8am–5pm; delivery 8:30am–4:30pm. Call 01727 400117.";

const STORE = {
  lat: 51.7522619,
  lng: -0.3352086,
  label: "Café 1, St Albans Crown Court",
  kind: "store" as const,
};
const DIRECTIONS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=" +
  encodeURIComponent("St Albans Crown Court, Bricket Road, St Albans AL1 3JU");

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: seoMeta({ title, description, path: "/contact" }),
    links: [canonicalLink("/contact")],
    scripts: [
      jsonLdScript(localBusinessJsonLd("https://cafe1stalbans.co.uk/icon-512.png")),
      jsonLdScript(webPageJsonLd({ name: title, description, path: "/contact" })),
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact Café 1", path: "/contact" },
        ]),
      ),
    ],
  }),
  component: Contact,
});

function Contact() {
  const rows = [
    { icon: Phone, label: "Call", value: "01727 400117" },
    { icon: Mail, label: "Email", value: "info@cafe1stalbans.co.uk" },
    {
      icon: Clock,
      label: "Open",
      value: "Mon–Fri · 8:00–17:00 (deliveries 8:30–16:30) · weekends and bank holidays closed",
    },
  ];
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-display text-5xl font-bold">Say hello</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Pop in for a coffee, or reach out any time.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="card-3d card-3d-hover overflow-hidden sm:col-span-2">
            <div className="flex flex-wrap items-start gap-4 p-6 pb-5">
              <span className="icon-3d h-12 w-12 shrink-0">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Visit
                </p>
                <p className="mt-1 text-lg font-semibold leading-snug">
                  Cafe 1, St Albans Crown Court, AL1 3JU
                </p>
                <a
                  href={DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-accent"
                >
                  Get directions
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </div>
            <div className="px-3 pb-3">
              <iframe
                title="Map showing Café 1 at St Albans Crown Court, Bricket Road, AL1 3JU"
                src={`https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s${STORE.lat},${STORE.lng}!6i16`}
                className="h-64 w-full rounded-xl border border-border"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.label} className="card-3d card-3d-hover flex items-start gap-4 p-6">
              <span className="icon-3d-soft h-12 w-12 shrink-0">
                <r.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {r.label}
                </p>
                <p className="mt-1 font-semibold leading-snug">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
