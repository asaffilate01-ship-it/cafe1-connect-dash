import { useEffect, useRef, useState } from "react";
import { loadMaps } from "./live-map";
import type { BoundaryPoint } from "@/lib/attendance.functions";
export function AttendanceBoundary({
  points,
  onChange,
}: {
  points: BoundaryPoint[];
  onChange: (p: BoundaryPoint[]) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const shape = useRef<google.maps.Polygon | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let listener: google.maps.MapsEventListener | undefined;
    loadMaps()
      .then(() => {
        if (stopped || !el.current) return;
        map.current = new google.maps.Map(el.current, {
          center: pointsRef.current[0] ?? { lat: 51.7522619, lng: -0.3352086 },
          zoom: 19,
          mapTypeId: "satellite",
          streetViewControl: false,
        });
        listener = map.current.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng && pointsRef.current.length < 60)
            change.current([...pointsRef.current, { lat: e.latLng.lat(), lng: e.latLng.lng() }]);
        });
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      stopped = true;
      listener?.remove();
      shape.current?.setMap(null);
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    shape.current?.setMap(null);
    const poly = new google.maps.Polygon({
      paths: points,
      map: map.current,
      editable: true,
      strokeColor: "#dc2626",
      fillOpacity: 0.2,
    });
    shape.current = poly;
    const sync = () =>
      change.current(
        poly
          .getPath()
          .getArray()
          .map((p) => ({ lat: p.lat(), lng: p.lng() })),
      );
    const listeners = [
      poly.getPath().addListener("set_at", sync),
      poly.getPath().addListener("insert_at", sync),
      poly.getPath().addListener("remove_at", sync),
    ];
    return () => {
      listeners.forEach((l) => l.remove());
      poly.setMap(null);
    };
  }, [points, ready]);
  return (
    <section className="space-y-3">
      <p>
        Tap outside corners in order around the whole workplace. Drag corners to adjust. The
        clocking zone adds 5 metres outside this outline. Map imagery is a guide: verify it on foot.
      </p>
      {error ? (
        <p role="alert">
          Map unavailable: {error}. Configure the existing Google Maps browser key to draw a
          boundary.
        </p>
      ) : (
        <div
          ref={el}
          className="h-96 rounded-xl border"
          aria-label="Satellite map boundary editor"
        />
      )}
      <p>{points.length} corners · 5m buffer · Arrival 60 seconds · Departure 180 seconds</p>
      <button
        type="button"
        className="rounded border p-2"
        onClick={() => onChange(points.slice(0, -1))}
      >
        Undo last corner
      </button>
      <button type="button" className="ml-2 rounded border p-2" onClick={() => onChange([])}>
        Clear outline
      </button>
    </section>
  );
}
