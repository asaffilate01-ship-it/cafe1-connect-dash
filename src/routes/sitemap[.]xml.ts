import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://cafe1stalbans.co.uk";
const STATIC_LAST_MODIFIED = "2026-08-09";

const PUBLIC_ROUTES = [
  "/",
  "/menu",
  "/order-direct",
  "/breakfast-st-albans",
  "/halal-food-st-albans",
  "/lunch-st-albans",
  "/blog",
  "/about",
  "/contact",
  "/faq",
  "/privacy",
  "/terms",
  "/cookies",
  "/gdpr",
  "/complaints",
] as const;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function urlEntry(path: string, modified: string | null): string {
  const lastmod = modified ? `<lastmod>${xmlEscape(modified)}</lastmod>` : "";
  return `  <url><loc>${xmlEscape(`${BASE_URL}${path}`)}</loc>${lastmod}</url>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: posts } = await supabase
          .from("blog_posts")
          .select("slug,updated_at,published_at")
          .eq("published", true);

        const urls = PUBLIC_ROUTES.map((path) => urlEntry(path, STATIC_LAST_MODIFIED));
        for (const post of posts ?? []) {
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) continue;
          urls.push(
            urlEntry(
              `/blog/${encodeURIComponent(post.slug)}`,
              isoDate(post.updated_at) ?? isoDate(post.published_at),
            ),
          );
        }

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
