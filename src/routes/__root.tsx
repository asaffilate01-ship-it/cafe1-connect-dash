import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/fraunces/latin-700.css";

import appCss from "../styles.css?url";
import { isExpectedCancellation, reportLovableError } from "../lib/lovable-error-reporting";
import { CookieBanner } from "../components/cookie-banner";
import { ConsentIntegrations } from "../components/consent-integrations";
import { MobileTabBar } from "../components/mobile-tabbar";
import { BackToTop } from "../components/back-to-top";
import { ConfirmHost } from "../components/confirm-dialog";
import { Toaster } from "../components/ui/sonner";
import { registerServiceWorker } from "../lib/register-sw";
import { LegacyBrowserNotice } from "../components/legacy-browser-notice";
import { jsonLdScript, websiteJsonLd } from "../lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const cancelled = isExpectedCancellation(error);
  useEffect(() => {
    if (cancelled) {
      // A superseded preload/navigation should leave the current route intact,
      // never become a fatal page or an editor blank-screen runtime report.
      reset();
      return;
    }
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [cancelled, error, reset]);

  if (cancelled) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { title: "Halal Café in St Albans | Breakfast & Lunch | Café 1" },
      {
        name: "description",
        content:
          "Café 1 is a halal café in St Albans serving all-day breakfast, Desi favourites, lunch and coffee. Visit AL1 3JU or order for collection and local delivery.",
      },
      { name: "author", content: "Café 1 St Albans team" },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { name: "google-site-verification", content: "NoUffm8Qa2gTyc2dGJ6FFtKs0hjsOSm9z2UX72WRVDQ" },
      { property: "og:site_name", content: "Café 1 St Albans" },
      { property: "og:locale", content: "en_GB" },
      { property: "og:title", content: "Halal Café in St Albans | Breakfast & Lunch | Café 1" },
      {
        property: "og:description",
        content:
          "All-day halal breakfast, Desi favourites, lunch and coffee at St Albans Crown Court, AL1 3JU.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#dc2626" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Cafe1" },
      { name: "format-detection", content: "telephone=no" },
      { name: "twitter:title", content: "Halal Café in St Albans | Breakfast & Lunch | Café 1" },
      {
        name: "twitter:description",
        content:
          "All-day halal breakfast, Desi favourites, lunch and coffee at St Albans Crown Court, AL1 3JU.",
      },
      {
        property: "og:image",
        content: "https://cafe1stalbans.co.uk/icon-512.png",
      },
      {
        name: "twitter:image",
        content: "https://cafe1stalbans.co.uk/icon-512.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    scripts: [jsonLdScript(websiteJsonLd())],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: (props) => (
    <ErrorComponent
      error={props.error instanceof Error ? props.error : new Error(String(props.error))}
      reset={props.reset}
    />
  ),
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <ConsentIntegrations />
      <CookieBanner />
      <BackToTop />
      <ConfirmHost />
      <MobileTabBar />
      {/* Warns staff on very old tablet browsers (Android 8 Chrome, Opera Mini). */}
      <LegacyBrowserNotice />
      {/* Toast host — without this every toast.success/error in the app is silent. */}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
