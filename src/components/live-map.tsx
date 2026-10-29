import { useEffect, useRef, useState } from "react";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
  kind: "driver" | "destination" | "store";
};

declare global {
  interface Window {
    google?: typeof google;
    __cafe1MapReady?: () => void;
    gm_authFailure?: () => void;
  }
}

const authFailureListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.gm_authFailure = () => authFailureListeners.forEach((fn) => fn());
}

let loaderPromise: Promise<void> | null = null;

export function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Maps key missing"));
  loaderPromise = new Promise<void>((resolve, reject) => {
    window.__cafe1MapReady = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__cafe1MapReady${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.onerror = () => reject(new Error("Maps failed to load"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

const PIN: Record<MapPoint["kind"], string> = {
  driver: "#dc2626",
  destination: "#111827",
  store: "#f59e0b",
};

export function LiveMap({
  points,
  className = "",
  fallbackHref,
}: {
  points: MapPoint[];
  className?: string;
  fallbackHref?: string;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<google.maps.Marker[]>([]);
  const infos = useRef<google.maps.InfoWindow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onAuthFail = () => setError("Live map unavailable");
    authFailureListeners.add(onAuthFail);
    return () => {
      authFailureListeners.delete(onAuthFail);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !el.current) return;
        map.current = new window.google.maps.Map(el.current, {
          center: points[0] ?? { lat: 51.7486, lng: -0.3345 },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
        });
        setReady(true);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Map unavailable"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !window.google?.maps) return;
    markers.current.forEach((m) => m.setMap(null));
    infos.current.forEach((i) => i.close());
    infos.current = [];
    markers.current = points.map((p) => {
      const marker = new window.google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: map.current,
        title: p.label,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: p.kind === "driver" ? 10 : 7,
          fillColor: PIN[p.kind],
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      if (p.kind === "store") {
        const info = new window.google.maps.InfoWindow({
          content: `<div style="font:600 13px/1.3 system-ui,sans-serif;color:#111827;padding:2px 4px">${p.label}</div>`,
          disableAutoPan: true,
        });
        info.open({ map: map.current, anchor: marker });
        infos.current.push(info);
      }
      return marker;
    });
    if (points.length === 1) {
      map.current.setCenter(points[0]);
    } else if (points.length > 1) {
      const b = new window.google.maps.LatLngBounds();
      points.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      map.current.fitBounds(b, 64);
    }
  }, [points, ready]);

  if (error) {
    return (
      <div
        className={`grid place-items-center gap-2 rounded-2xl border border-border bg-secondary p-4 text-center text-sm text-muted-foreground ${className}`}
      >
        <span>Live map unavailable</span>
        {fallbackHref && (
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Open in Google Maps
          </a>
        )}
      </div>
    );
  }
  return <div ref={el} className={`rounded-2xl border border-border ${className}`} />;
}
