import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Banner = {
  id: string; title: string; subtitle: string | null; badge: string | null;
  image_url: string | null; bg_color: string | null;
  cta_label: string | null; cta_url: string | null;
};

export function PromoCarousel() {
  const { data } = useQuery({
    queryKey: ["promo-banners"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("promo_banners")
        .select("id,title,subtitle,badge,image_url,bg_color,cta_label,cta_url")
        .order("sort_order");
      return (data ?? []) as Banner[];
    },
  });

  const banners = data ?? [];
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [banners.length]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  }, [idx]);

  if (!banners.length) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b) => {
          const cardStyle = b.image_url
            ? { backgroundImage: `linear-gradient(120deg, rgba(20,20,20,.55), rgba(20,20,20,.15)), url(${b.image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: `linear-gradient(120deg, ${b.bg_color ?? "oklch(0.55 0.22 27)"}, color-mix(in oklab, ${b.bg_color ?? "oklch(0.55 0.22 27)"} 60%, black))` };
          const inner = (
            <div
              className="banner-gloss flex min-h-[104px] w-full min-w-full snap-start items-end rounded-2xl px-4 py-3 text-white sm:h-56 sm:min-h-0 sm:px-16 sm:py-6"
              style={cardStyle}
            >
              <div className="max-w-md">
                {b.badge && (
                  <span className="inline-block rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary shadow-[0_2px_6px_-1px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-2.5 sm:text-[11px]">
                    {b.badge}
                  </span>
                )}
                <p className="mt-1 line-clamp-2 font-display text-lg font-bold leading-tight [text-shadow:0_2px_8px_rgba(0,0,0,0.45)] sm:mt-2 sm:line-clamp-none sm:text-3xl">{b.title}</p>
                {b.subtitle && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug opacity-95 [text-shadow:0_1px_5px_rgba(0,0,0,0.4)] sm:mt-1 sm:line-clamp-none sm:text-base">{b.subtitle}</p>
                )}
                {b.cta_label && b.cta_url && (
                  <span className="mt-1.5 inline-block rounded-full bg-gradient-to-b from-white to-white/85 px-3 py-1 text-xs font-semibold text-primary shadow-[0_6px_16px_-6px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] sm:mt-3 sm:px-4 sm:py-1.5 sm:text-sm">
                    {b.cta_label} →
                  </span>
                )}
              </div>
            </div>
          );
          if (b.cta_url?.startsWith("/")) {
            return (
              <Link key={b.id} to={b.cta_url} className="min-w-full snap-start">
                {inner}
              </Link>
            );
          }
          if (b.cta_url) {
            return (
              <a key={b.id} href={b.cta_url} className="min-w-full snap-start">
                {inner}
              </a>
            );
          }
          return <div key={b.id} className="min-w-full snap-start">{inner}</div>;
        })}
      </div>
      {banners.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + banners.length) % banners.length)}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 text-primary shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm hover:bg-white sm:block"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % banners.length)}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 text-primary shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm hover:bg-white sm:block"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mt-2 flex justify-center gap-1.5">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}