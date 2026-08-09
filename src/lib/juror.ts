/**
 * HMCTS Juror Voucher Scheme — shared rules.
 *
 * • The HMCTS Juror ID is also the voucher code; no second code is generated.
 * • Codes carry a daily allowance on court sitting days only; unused value
 *   expires at the end of the day and never carries forward.
 * • Cafe 1 only ever claims the value actually redeemed.
 * • Scheme members get 10% off food (drinks excluded) on anything payable
 *   above the daily allowance — the voucher is always applied first.
 */
/**
 * Legacy localStorage key. Codes are NO LONGER remembered on the device —
 * for fraud prevention the juror must key the code in on every order, at the
 * till and online. The constant is kept only so old values can be purged.
 */
export const JUROR_CODE_KEY = "cafe1-juror-code";
export const JUROR_DAILY_ALLOWANCE_CENTS = 571;
/** Current GOV.UK food-and-drink maximum where attendance exceeds 10 hours. */
export const JUROR_EXTENDED_DAY_ALLOWANCE_CENTS = 1217;
export const JUROR_FOOD_DISCOUNT_PERCENT = 10;
export const JUROR_PIN_LENGTH = 6;

/**
 * Voucher orders may only be delivered inside the court estate — never to a
 * home or office address. Anything else must be collected.
 */
export const JUROR_DELIVERY_VENUES = [
  {
    id: "crown",
    label: "St Albans Crown Court",
    address_line1: "St Albans Crown Court, Bricket Road",
    city: "St Albans",
    postcode: "AL1 3JU",
  },
  {
    id: "magistrates",
    label: "St Albans Magistrates' Court",
    address_line1: "St Albans Magistrates' Court, Bricket Road",
    city: "St Albans",
    postcode: "AL1 3JU",
  },
] as const;

export type JurorVenueId = (typeof JUROR_DELIVERY_VENUES)[number]["id"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when a delivery address is one of the permitted court buildings. */
export function isCourtDeliveryAddress(
  addressLine1?: string | null,
  postcode?: string | null,
): boolean {
  const a = norm(addressLine1 ?? "");
  const p = norm(postcode ?? "");
  return JUROR_DELIVERY_VENUES.some((v) => norm(v.address_line1) === a && norm(v.postcode) === p);
}

export const JUROR_DELIVERY_RULE_MESSAGE =
  "Voucher orders can only be delivered inside the court — choose St Albans Crown Court or St Albans Magistrates' Court, or select collection.";
/** Fixed validity window for each activated HMCTS Juror ID. */
export const JUROR_VALIDITY_WEEKS = 12;

/** 10% of the food value, capped at what is still payable after the voucher. */
export function jurorFoodDiscount(payableAfterVoucher: number, foodSubtotalCents: number): number {
  if (payableAfterVoucher <= 0 || foodSubtotalCents <= 0) return 0;
  return Math.round(
    (Math.min(foodSubtotalCents, payableAfterVoucher) * JUROR_FOOD_DISCOUNT_PERCENT) / 100,
  );
}

/** Adds N working days (Mon–Fri) to a date — bank holidays are handled server-side. */
export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days - 1;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const JUROR_STATUS_LABEL: Record<string, string> = {
  ok: "Active",
  inactive: "Deactivated",
  not_started: "Not started",
  expired: "Expired",
  non_sitting_day: "Non-sitting day",
};
