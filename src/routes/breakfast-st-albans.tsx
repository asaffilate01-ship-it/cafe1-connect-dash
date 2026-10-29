import { createFileRoute } from "@tanstack/react-router";

import heroImage from "@/assets/cafe1-hero.webp";
import { LocalSearchPage } from "@/components/local-search-page";
import { config } from "@/lib/local-pages/breakfast-st-albans";
import { localBusinessJsonLd } from "@/lib/nap";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  canonicalLink,
  faqJsonLd,
  jsonLdScript,
  seoMeta,
  webPageJsonLd,
} from "@/lib/seo";

const path = "/breakfast-st-albans";
const title = "Breakfast in St Albans | Halal & All Day | Café 1";
const description =
  "Enjoy halal breakfast in St Albans from 8am: breakfast plates, Desi breakfast, parathas and omelettes at Café 1, AL1 3JU. Order or dine in.";

export const Route = createFileRoute("/breakfast-st-albans")({
  head: () => ({
    meta: seoMeta({ title, description, path, image: heroImage }),
    links: [canonicalLink(path), { rel: "preload", as: "image", href: heroImage }],
    scripts: [
      jsonLdScript(localBusinessJsonLd(absoluteUrl(heroImage))),
      jsonLdScript(
        webPageJsonLd({
          name: title,
          description,
          path,
          about: ["Breakfast in St Albans", "Halal breakfast", "Desi breakfast"],
        }),
      ),
      jsonLdScript(faqJsonLd(config.faqs)),
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Breakfast in St Albans", path },
        ]),
      ),
    ],
  }),
  component: BreakfastStAlbans,
});

function BreakfastStAlbans() {
  return <LocalSearchPage config={config} />;
}
