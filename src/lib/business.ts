// Shared browser-safe helpers for store status.
export type HourRow = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  closed: boolean;
};
export type BankHoliday = { holiday_date: string; name: string };
export type BusinessSettings = {
  id: string;
  name: string;
  accepting_orders: boolean;
  allow_preorder_when_closed: boolean;
  prep_minutes: number;
  delivery_minutes: number;
  min_order_cents: number;
  delivery_fee_cents: number;
  free_delivery_threshold_cents: number | null;
  closed_message: string | null;
  delivery_open_time?: string;
  delivery_close_time?: string;
  delivery_origin_postcode?: string;
  delivery_radius_m?: number;
  vat_registered?: boolean;
  vat_number?: string | null;
};

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function toMinutes(t: string) {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

export type StoreStatus = {
  open: boolean;
  reason: "closed_day" | "before_open" | "after_close" | "not_accepting" | "bank_holiday" | "open";
  todayOpen?: string;
  todayClose?: string;
  nextOpenLabel?: string;
  holidayName?: string;
};

export function computeStoreStatus(
  hours: HourRow[],
  settings: BusinessSettings | null,
  now = new Date(),
  holidays: BankHoliday[] = [],
): StoreStatus {
  if (settings && !settings.accepting_orders) {
    return { open: false, reason: "not_accepting" };
  }
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const bh = holidays.find((h) => h.holiday_date === todayIso);
  if (bh) {
    return {
      open: false,
      reason: "bank_holiday",
      holidayName: bh.name,
      nextOpenLabel: findNextOpen(hours, now.getDay() + 1, holidays, now),
    };
  }
  const dow = now.getDay();
  const today = hours.find((h) => h.day_of_week === dow);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (!today || today.closed) {
    return {
      open: false,
      reason: "closed_day",
      nextOpenLabel: findNextOpen(hours, dow, holidays, now),
    };
  }
  const o = toMinutes(today.open_time),
    c = toMinutes(today.close_time);
  if (nowMin < o)
    return {
      open: false,
      reason: "before_open",
      todayOpen: today.open_time,
      todayClose: today.close_time,
    };
  if (nowMin >= c)
    return {
      open: false,
      reason: "after_close",
      todayOpen: today.open_time,
      todayClose: today.close_time,
      nextOpenLabel: findNextOpen(hours, dow + 1, holidays, now),
    };
  return { open: true, reason: "open", todayOpen: today.open_time, todayClose: today.close_time };
}

function findNextOpen(
  hours: HourRow[],
  fromDow: number,
  holidays: BankHoliday[] = [],
  base = new Date(),
): string | undefined {
  const holidaySet = new Set(holidays.map((h) => h.holiday_date));
  const startOffset = ((fromDow - base.getDay()) % 7 + 7) % 7;
  for (let i = 0; i < 7; i++) {
    const offset = startOffset + i;
    const day = new Date(base);
    day.setDate(base.getDate() + offset);
    const d = day.getDay();
    const row = hours.find((h) => h.day_of_week === d);
    if (!row || row.closed) continue;
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    if (holidaySet.has(iso)) continue;
    return `${DAY_NAMES[d]} · ${row.open_time.slice(0, 5)}`;
  }
  return undefined;
}

export function formatHHMM(t: string) {
  return t.slice(0, 5);
}

export type ScheduleSlot = { value: string; label: string; day: string };

/**
 * Build selectable "schedule for later" slots that only fall inside real
 * trading hours (skips closed days and bank holidays). Delivery orders are
 * further constrained to the delivery window in business settings.
 */
export function buildScheduleSlots(opts: {
  hours: HourRow[];
  holidays?: BankHoliday[];
  settings?: BusinessSettings | null;
  mode?: "delivery" | "collection" | "dine_in";
  now?: Date;
  daysAhead?: number;
  intervalMinutes?: number;
}): ScheduleSlot[] {
  const { hours, holidays = [], settings = null, mode = "collection", now = new Date() } = opts;
  const daysAhead = opts.daysAhead ?? 7;
  const step = opts.intervalMinutes ?? 15;
  if (!hours.length) return [];

  const leadMinutes =
    mode === "delivery" ? (settings?.delivery_minutes ?? 45) : (settings?.prep_minutes ?? 20);
  const earliest = new Date(now.getTime() + leadMinutes * 60 * 1000);
  const holidaySet = new Set(holidays.map((h) => h.holiday_date));
  const slots: ScheduleSlot[] = [];

  for (let i = 0; i < daysAhead && slots.length < 96; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    day.setHours(0, 0, 0, 0);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    if (holidaySet.has(iso)) continue;
    const row = hours.find((h) => h.day_of_week === day.getDay());
    if (!row || row.closed) continue;

    let openMin = toMinutes(row.open_time);
    let closeMin = toMinutes(row.close_time);
    if (mode === "delivery") {
      if (settings?.delivery_open_time)
        openMin = Math.max(openMin, toMinutes(settings.delivery_open_time));
      if (settings?.delivery_close_time)
        closeMin = Math.min(closeMin, toMinutes(settings.delivery_close_time));
    }
    if (closeMin <= openMin) continue;

    // align first slot to the interval grid
    const startMin = Math.ceil(openMin / step) * step;
    for (let m = startMin; m <= closeMin - step; m += step) {
      const d = new Date(day);
      d.setMinutes(m);
      if (d < earliest) continue;
      const dayLabel =
        i === 0
          ? "Today"
          : i === 1
            ? "Tomorrow"
            : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
      slots.push({
        value: d.toISOString(),
        day: dayLabel,
        label: `${dayLabel} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      });
      if (slots.length >= 96) break;
    }
  }
  return slots;
}
