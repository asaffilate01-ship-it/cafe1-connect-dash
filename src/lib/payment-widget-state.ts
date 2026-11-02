/**
 * A third-party widget event is not proof of settlement. Only the server's
 * SumUp verification (or signed webhook) can produce the "paid" UI state.
 */
export type PaymentWidgetAction = "verify" | "failed" | "ignore";

export function paymentWidgetAction(eventType: string): PaymentWidgetAction {
  switch (eventType.toLowerCase()) {
    case "sent":
    case "auth-screen":
    case "success":
      return "verify";
    case "error":
    case "fail":
    case "invalid":
      return "failed";
    default:
      return "ignore";
  }
}
