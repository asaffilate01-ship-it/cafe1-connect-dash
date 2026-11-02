/**
 * Match the provider's immutable checkout to exactly one Cafe 1 order before
 * fulfilling it. An unauthenticated webhook body is never sufficient evidence.
 */
export type VerifiedOrderFields = {
  sumup_checkout_id: string | null;
  sumup_reference: string | null;
  total_cents: number;
};

export type ProviderCheckoutFields = {
  id: string;
  checkout_reference: string;
  currency: string;
  amount: number;
};

export function sumupCheckoutMatchesOrder(
  order: VerifiedOrderFields,
  checkout: ProviderCheckoutFields,
): boolean {
  return (
    Boolean(order.sumup_checkout_id && order.sumup_reference) &&
    checkout.id === order.sumup_checkout_id &&
    checkout.checkout_reference === order.sumup_reference &&
    checkout.currency === "GBP" &&
    Number.isFinite(checkout.amount) &&
    Number.isSafeInteger(order.total_cents) &&
    order.total_cents >= 0 &&
    Math.round(checkout.amount * 100) === order.total_cents
  );
}
