import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkDeliveryPostcode } from "@/lib/delivery.functions";
import {
  orderContext,
  type OrderContext,
  type OrderMode,
  type ScheduleMode,
  useOrderContext,
} from "@/lib/order-context";
import { useStoreStatus } from "@/hooks/use-store-status";
import { buildScheduleSlots } from "@/lib/business";
import { X, MapPin, Clock, Store, Bike, Utensils, Eye, ExternalLink } from "lucide-react";

/**
 * Jury Only menu: delivery is restricted to the court jury areas — nowhere else.
 */
export const JURY_DELIVERY_ROOMS = [
  { id: "crown-lounge", label: "Main Jury Lounge — St Albans Crown Court", postcode: "AL1 3JU" },
  { id: "crown-rooms", label: "Jury Rooms — St Albans Crown Court", postcode: "AL1 3JU" },
  {
    id: "magistrates-rooms",
    label: "Jury Rooms — St Albans Magistrates' Court",
    postcode: "AL1 3JU",
  },
] as const;

export function OrderSetupGate({
  open,
  onClose,
  onBrowse,
  dismissible = true,
  juryOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Public menu only: leave without creating an order context. */
  onBrowse?: () => void;
  dismissible?: boolean;
  /** Restrict delivery to the court jury areas (Jury Only menu). */
  juryOnly?: boolean;
}) {
  const existing = useOrderContext();
  const { status, settings, hours, holidays } = useStoreStatus();
  const checkArea = useServerFn(checkDeliveryPostcode);

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<OrderMode>(existing?.mode ?? "collection");
  const [postcode, setPostcode] = useState(existing?.postcode ?? "");
  const [area, setArea] = useState<
    null | {
      ok: boolean;
      message: string;
      distance_m?: number;
      deliveroo_url?: string | null;
      justeat_url?: string | null;
    }
  >(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(existing?.schedule_mode ?? "asap");
  const [scheduledFor, setScheduledFor] = useState<string>(existing?.scheduled_for ?? "");
  const [juryRoom, setJuryRoom] = useState<string>(existing?.jury_room ?? "");
  const timeSlots = useMemo(
    () => buildScheduleSlots({ hours, holidays, settings, mode }),
    [hours, holidays, settings, mode],
  );

  // Drop a previously chosen slot if it's no longer valid for this mode/day.
  useEffect(() => {
    if (scheduledFor && !timeSlots.some((s) => s.value === scheduledFor)) setScheduledFor("");
  }, [timeSlots, scheduledFor]);

  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  async function verify() {
    const pc = postcode.trim();
    if (!pc) return;
    setAreaBusy(true);
    try {
      const res = await checkArea({ data: { postcode: pc } });
      if (res.ok) {
        setArea({
          ok: true,
          distance_m: res.distance_m ?? 0,
          message: `You're in our delivery area (${((res.distance_m ?? 0) / 1609.34).toFixed(2)} mi away).`,
          deliveroo_url: res.deliveroo_url,
          justeat_url: res.justeat_url,
        });
      } else {
        setArea({
          ok: false,
          message: res.reason,
          deliveroo_url: res.deliveroo_url,
          justeat_url: res.justeat_url,
        });
      }
    } catch {
      setArea({ ok: false, message: "Couldn't check that postcode. Try again." });
    } finally {
      setAreaBusy(false);
    }
  }

  function canContinueStep1() {
    if (mode !== "delivery") return true;
    if (juryOnly) return !!juryRoom;
    return !!area?.ok;
  }

  function finish() {
    const next: OrderContext = {
      mode,
      schedule_mode: scheduleMode,
      scheduled_for: scheduleMode === "scheduled" ? scheduledFor : undefined,
      postcode:
        mode === "delivery"
          ? juryOnly
            ? (JURY_DELIVERY_ROOMS.find((r) => r.label === juryRoom)?.postcode ?? "AL1 3JU")
            : postcode.trim().toUpperCase()
          : undefined,
      distance_m: mode === "delivery" && !juryOnly ? area?.distance_m : undefined,
      jury_room: juryOnly && mode === "delivery" ? juryRoom : undefined,
    };
    orderContext.set(next);
    onClose();
  }

  const canPreorder = !!settings?.allow_preorder_when_closed;
  const forceScheduled = !status.open && canPreorder;

  useEffect(() => {
    if (forceScheduled && scheduleMode === "asap") setScheduleMode("scheduled");
  }, [forceScheduled, scheduleMode]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-setup-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && dismissible) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Cafe1</p>
            <h2 id="order-setup-title" className="font-display text-lg font-bold">
              {step === 1
                ? onBrowse
                  ? "Order now or just browse?"
                  : "How would you like your order?"
                : "When?"}
            </h2>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-5 px-5 py-5">
          {step === 1 && (
            <>
              {onBrowse && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Choose an ordering option, or look through the menu without selecting delivery,
                  pickup or dine-in.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { m: "collection" as const, label: "Pickup", icon: Store },
                  { m: "delivery" as const, label: "Delivery", icon: Bike },
                  { m: "dine_in" as const, label: "Dine in", icon: Utensils },
                ].map(({ m, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => {
                      setMode(m);
                      if (m !== "delivery") setArea(null);
                    }}
                    className={`flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition ${
                      mode === m
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                ))}
              </div>

              {mode === "delivery" && juryOnly && (
                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-primary" /> Where in the court?
                  </p>
                  <div className="mt-3 space-y-2">
                    {JURY_DELIVERY_ROOMS.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => setJuryRoom(r.label)}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          juryRoom === r.label
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:border-primary"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Jury Only orders are delivered to these jury areas only — we can't deliver
                    anywhere else. You can also choose Pickup or Dine in at Café 1.
                  </p>
                </div>
              )}

              {mode === "delivery" && !juryOnly && (
                <div className="rounded-2xl border border-border bg-background p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-primary" /> Delivery postcode
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={postcode}
                      onChange={(e) => {
                        setPostcode(e.target.value);
                        setArea(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void verify();
                        }
                      }}
                      placeholder="e.g. AL1 3JU"
                      className="h-11 flex-1 rounded-xl border border-border bg-card px-4 uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => void verify()}
                      disabled={areaBusy || !postcode.trim()}
                      className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                    >
                      {areaBusy ? "Checking…" : "Check"}
                    </button>
                  </div>
                  {area && (
                    <p
                      className={`mt-2 rounded-xl px-3 py-2 text-xs font-medium ${
                        area.ok
                          ? "bg-primary/10 text-primary"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {area.message}
                    </p>
                  )}
                  {area && !area.ok && (
                    <div className="mt-2 flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("collection");
                          setArea(null);
                        }}
                        className="rounded-full border border-primary/40 px-3 py-1 font-semibold text-primary hover:bg-primary/10"
                      >
                        Switch to Pickup
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("dine_in");
                          setArea(null);
                        }}
                        className="rounded-full border border-primary/40 px-3 py-1 font-semibold text-primary hover:bg-primary/10"
                      >
                        Switch to Dine in
                      </button>
                    </div>
                  )}
                  {area && !area.ok && (area.deliveroo_url || area.justeat_url) && (
                    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary">
                        You're just outside our own delivery area
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        You can still get Cafe 1 delivered through our partners:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {area.deliveroo_url && (
                          <a
                            href={area.deliveroo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary-hover"
                          >
                            Order on Deliveroo <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {area.justeat_url && (
                          <a
                            href={area.justeat_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground hover:bg-secondary/80"
                          >
                            Order on Just Eat <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    We deliver up to ½ mile from {settings?.delivery_origin_postcode ?? "AL1 3JU"},{" "}
                    {(settings?.delivery_open_time ?? "08:30").slice(0, 5)}–
                    {(settings?.delivery_close_time ?? "16:30").slice(0, 5)}.
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={!canContinueStep1()}
                onClick={() => setStep(2)}
                className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover disabled:opacity-60"
              >
                Continue
              </button>

              {onBrowse && (
                <>
                  <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <span className="h-px flex-1 bg-border" /> Or{" "}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <button
                    type="button"
                    onClick={onBrowse}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-4 font-semibold transition hover:border-primary hover:bg-primary/5 hover:text-primary"
                  >
                    <Eye className="h-4 w-4" /> Just browsing
                  </button>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(["asap", "scheduled"] as const).map((s) => {
                  const disabled = s === "asap" && forceScheduled;
                  return (
                    <button
                      type="button"
                      key={s}
                      disabled={disabled}
                      onClick={() => setScheduleMode(s)}
                      className={`flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-semibold transition ${
                        scheduleMode === s
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <Clock className="h-4 w-4" />
                      {s === "asap" ? "ASAP (~20 min)" : "Schedule for later"}
                    </button>
                  );
                })}
              </div>

              {scheduleMode === "scheduled" && (
                <select
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-background px-4"
                >
                  <option value="">Select a time slot…</option>
                  {timeSlots.length === 0 && <option disabled>No slots available</option>}
                  {timeSlots.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}

              {forceScheduled && (
                <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900">
                  We're closed right now — pre-order for a later time.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="h-12 flex-1 rounded-full border border-border font-semibold hover:bg-muted"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={finish}
                  disabled={scheduleMode === "scheduled" && !scheduledFor}
                  className="h-12 flex-[2] rounded-full bg-primary font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover disabled:opacity-60"
                >
                  Start ordering
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
