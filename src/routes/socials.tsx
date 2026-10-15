import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { TikTokCreatorFeed } from "@/components/tiktok-creator-feed";
import { FacebookPageFeed } from "@/components/facebook-page-feed";
import { SocialFeedCarousel } from "@/components/social-feed-carousel";
import { getAutomaticSocialFeed } from "@/lib/social-feed.functions";
import {
  GOOGLE_REVIEWS_URL,
  SOCIAL_POSTS,
  SOCIAL_PROFILES,
  findSocialProfile,
  mergeSocialPosts,
} from "@/lib/social-media";
import { canonicalLink, seoMeta } from "@/lib/seo";

const title = "Café 1 St Albans | Social videos and community";
const description =
  "See the latest updates, food videos and social posts from Café 1 St Albans. Third-party social content loads only with your consent.";

export const Route = createFileRoute("/socials")({
  head: () => ({
    meta: seoMeta({ title, description, path: "/socials" }),
    links: [canonicalLink("/socials")],
  }),
  component: SocialsPage,
});

function SocialsPage() {
  const load = useServerFn(getAutomaticSocialFeed);
  const { data, isError } = useQuery({
    queryKey: ["cafe1", "public-social-feed"],
    queryFn: () => load(),
    staleTime: 15 * 60_000,
    retry: 1,
  });
  const tiktok = findSocialProfile(SOCIAL_PROFILES, "tiktok");
  const facebook = findSocialProfile(SOCIAL_PROFILES, "facebook");
  const posts = mergeSocialPosts(data?.posts ?? [], SOCIAL_POSTS);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            From our kitchen
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">
            Café 1 on social media
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Discover our latest café updates, behind-the-scenes videos and customer favourites.
            Social players remain paused until you choose to enable marketing cookies.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {tiktok && (
            <section aria-label="Café 1 TikTok profile">
              <h2 className="mb-4 font-display text-2xl font-bold">TikTok</h2>
              <TikTokCreatorFeed profileUrl={tiktok.url} />
            </section>
          )}
          {facebook && (
            <section aria-label="Café 1 Facebook page">
              <h2 className="mb-4 font-display text-2xl font-bold">Facebook</h2>
              <FacebookPageFeed profileUrl={facebook.url} />
            </section>
          )}
        </div>

        <section className="mt-14" aria-labelledby="latest-social-posts">
          <h2 id="latest-social-posts" className="font-display text-3xl font-bold">
            Recent videos and reels
          </h2>
          {posts.length > 0 ? (
            <SocialFeedCarousel posts={posts} />
          ) : (
            <div className="mt-5 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {isError
                ? "Automatic videos are unavailable at the moment. You can still visit our official social profiles."
                : "Our latest public videos will appear here as they become available."}
            </div>
          )}
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-2xl font-bold">Official profiles and reviews</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {SOCIAL_PROFILES.map((profile) => (
              <a
                key={profile.platform}
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                {profile.label}
              </a>
            ))}
            <a
              href={GOOGLE_REVIEWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-primary"
            >
              Find us on Google
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
