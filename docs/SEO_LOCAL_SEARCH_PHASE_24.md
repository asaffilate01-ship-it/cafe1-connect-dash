# Phase 24 — local search and organic content

Phase 24 gives Café 1 a technically crawlable, people-first local search foundation. It does not
guarantee a position in Google: ranking also depends on distance, competition, the Google Business
Profile, reviews, links and time for crawling and evaluation.

## Search intent map

Each important intent has one primary page. Blog articles support these pages with narrower,
practical questions; they must not be rewritten as duplicate landing pages.

| Search intent                            | Primary page                            | Supporting content                                                        |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| halal café / cafe in St Albans           | `/`                                     | About, menu, contact and local guides                                     |
| breakfast in St Albans / halal breakfast | `/breakfast-st-albans`                  | `/blog/halal-breakfast-st-albans`, `/blog/desi-breakfast-guide-st-albans` |
| halal food in St Albans                  | `/halal-food-st-albans`                 | Halal breakfast and courthouse food articles                              |
| lunch in St Albans / halal lunch         | `/lunch-st-albans`                      | Quick weekday lunch and office delivery articles                          |
| food near St Albans Crown Court          | `/blog/food-near-st-albans-crown-court` | Contact and lunch pages                                                   |
| coffee in St Albans                      | `/blog/italian-coffee-in-st-albans`     | Menu and breakfast page                                                   |
| office food delivery near AL1 3JU        | `/blog/office-delivery-crown-court`     | Lunch page and live menu                                                  |

## Technical controls delivered

- Shared title, description, canonical, Open Graph, X/Twitter and crawler metadata helpers.
- Accurate `Restaurant`, `WebSite`, `WebPage`, `BreadcrumbList` and `Article` JSON-LD.
- Correct NAP: Café 1 St Albans, St Albans Crown Court, Bricket Road, St Albans,
  Hertfordshire AL1 3JU, +44 1727 753228.
- Accurate weekday hours and half-mile delivery area in business structured data.
- No unsupported aggregate rating, review, halal certification or wallet-payment claims.
- Server-rendered public menu and blog index so their content is present before browser JavaScript.
- XML sitemap with the three local landing pages, public pages, published articles and truthful
  article `lastmod` dates.
- `X-Robots-Tag: noindex, nofollow, noarchive` on private application route families.
- Robots controls for operational, checkout, account and API paths.
- Homepage and footer internal links to each primary local search page.
- Six substantial articles in one forward-only migration: three rewritten existing posts and three
  new long-tail guides.
- Automated `npm run verify:seo` and production smoke coverage.

## Required deployment work

1. Apply `supabase/migrations/20260809234000_local_search_content_phase24.sql` once through the
   existing migration workflow. This publishes the rewritten and new blog content.
2. Commit the complete Phase 24 update to `main` without amending or force-pushing published
   history.
3. Copy that new 40-character commit into production `PUBLIC_RELEASE_SHA`.
4. Deploy that exact commit and run `npm run smoke:production -- https://cafe1stalbans.co.uk` with
   `EXPECTED_RELEASE_SHA` set to the same commit.
5. Open the homepage, menu, three landing pages, blog index and at least one article. Confirm titles,
   visible content, images, links and structured data are present in the rendered HTML.

## Google Search Console actions

These steps cannot be completed only by shipping code; they require access to the verified Search
Console property.

1. Submit `https://cafe1stalbans.co.uk/sitemap.xml`.
2. Inspect and request indexing for `/`, `/menu`, `/breakfast-st-albans`,
   `/halal-food-st-albans`, `/lunch-st-albans` and `/blog`.
3. Test the homepage, each landing page and one article with Google's Rich Results Test. Fix any
   invalid items before requesting another crawl.
4. Check Page indexing after Google recrawls. Investigate server errors, unexpected `noindex`,
   duplicate canonicals or crawled-not-indexed pages; do not submit the same URL repeatedly.
5. Record a baseline for impressions, clicks, click-through rate and average position by page and
   query. Compare 28-day periods only after enough data exists.

## Google Business Profile actions

The website and Business Profile must describe the same real business.

- Use the exact NAP above; do not shorten the postcode to an older value.
- Set regular hours to Monday–Friday 08:00–17:00 and mark weekends closed.
- Maintain special hours for every UK public holiday rather than assuming Google knows the café is
  closed.
- Choose the most accurate primary category and only relevant secondary categories. Do not add a
  category just because it contains a target phrase.
- Link the menu field to `https://cafe1stalbans.co.uk/menu` and the main website to the canonical
  homepage. Use the appropriate order link if the profile supports it.
- Add recent, truthful food, counter, entrance and team photographs. Do not use stock images as if
  they show the premises.
- Ask real customers for honest reviews without incentives or review gating. Reply to positive and
  negative reviews professionally; never create staff, family or duplicate reviews.
- Add services or attributes only when they are operationally true, including public access and
  available ordering modes.

## Organic content operating rule

Publish when the café has something first-hand and useful to add: a new menu range, a clear dietary
explanation, a seasonal opening update, an ordering guide or a local customer question. Every post
must have a real authoring organisation, visible date, unique purpose, current facts and links to the
single primary landing page for its topic.

Do not create dozens of near-identical postcode or “best café” pages, hide keywords, buy links,
invent awards, fabricate reviews or refresh dates without a meaningful content change. Review all
opening-hour, delivery, menu and payment statements before publication.

## Monthly measurement

- Search Console: branded vs non-branded queries, landing-page clicks, CTR and indexing.
- Business Profile: calls, website clicks, direction requests, review count and response coverage.
- Website analytics: organic entry page, menu clicks, order-starts and completed orders.
- Content accuracy: broken links, unavailable items, old prices, old hours and unsupported claims.

Ranking movement should be evaluated over several weeks and compared with conversions, not treated
as a same-day release check.
