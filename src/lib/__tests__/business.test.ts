import { describe, expect, it } from "vitest";
import { buildScheduleSlots, computeStoreStatus, type HourRow } from "../business";
import { NAP } from "../nap";

const hours: HourRow[] = Array.from({ length: 7 }, (_, day) => ({
  day_of_week: day,
  open_time: "08:30:00",
  close_time: "16:30:00",
  closed: day === 0 || day === 6,
}));

const settings = {
  id: "settings",
  name: "Cafe 1",
  accepting_orders: true,
  allow_preorder_when_closed: true,
  prep_minutes: 20,
  delivery_minutes: 15,
  min_order_cents: 0,
  delivery_fee_cents: 0,
  free_delivery_threshold_cents: null,
  closed_message: null,
  delivery_open_time: "09:00:00",
  delivery_close_time: "16:00:00",
  delivery_origin_postcode: "AL1 3JU",
  delivery_radius_m: 805,
  vat_registered: false,
  vat_number: null,
};

describe("confirmed Cafe 1 trading rules", () => {
  it("publishes the correct structured opening time and half-mile radius", () => {
    expect(NAP.openTime).toBe("08:30");
    expect(NAP.closeTime).toBe("16:30");
    expect(NAP.deliveryRadiusMetres).toBe(805);
  });

  it("closes on weekends and points to Monday", () => {
    const saturday = new Date(2026, 7, 8, 12, 0, 0);
    expect(computeStoreStatus(hours, settings, saturday)).toMatchObject({
      open: false,
      reason: "closed_day",
      nextOpenLabel: "Monday · 08:30",
    });
  });

  it("closes on bank holidays and computes the next date correctly", () => {
    const bankHolidayMonday = new Date(2026, 7, 31, 12, 0, 0);
    expect(
      computeStoreStatus(hours, settings, bankHolidayMonday, [
        { holiday_date: "2026-08-31", name: "Summer bank holiday" },
      ]),
    ).toMatchObject({
      open: false,
      reason: "bank_holiday",
      nextOpenLabel: "Tuesday · 08:30",
    });
  });

  it("opens Monday to Friday at 08:30 and closes at 16:30", () => {
    const wednesdayMorning = new Date(2026, 9, 28, 8, 0, 0); // Wednesday
    expect(computeStoreStatus(hours, settings, wednesdayMorning)).toMatchObject({
      open: false,
      reason: "before_open",
      nextOpenLabel: "Today · 08:30",
    });

    const wednesdayEvening = new Date(2026, 9, 28, 17, 0, 0);
    expect(computeStoreStatus(hours, settings, wednesdayEvening)).toMatchObject({
      open: false,
      reason: "after_close",
      nextOpenLabel: "Tomorrow · 08:30",
    });
  });

  it("only offers delivery slots inside 09:00-16:00 and skips bank holidays", () => {
    const slots = buildScheduleSlots({
      hours,
      settings,
      mode: "delivery",
      now: new Date(2026, 7, 31, 7, 0, 0),
      holidays: [{ holiday_date: "2026-08-31", name: "Summer bank holiday" }],
      daysAhead: 2,
      intervalMinutes: 30,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].day).toBe("Tomorrow");
    expect(new Date(slots[0].value).getHours()).toBe(9);
    expect(new Date(slots[0].value).getMinutes()).toBe(0);
    expect(slots.every((slot) => new Date(slot.value).getHours() < 16)).toBe(true);
  });
});
