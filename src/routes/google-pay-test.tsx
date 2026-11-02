import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { GooglePayDemo } from "@/components/google-pay-demo";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/google-pay-test")({
  head: () => ({
    meta: [
      { title: "Google Pay test payment — Café 1 St Albans" },
      {
        name: "description",
        content:
          "Internal sandbox for running Google Pay TEST environment payments against the Café 1 St Albans checkout before going live.",
      },
      { property: "og:title", content: "Google Pay test payment — Café 1 St Albans" },
      {
        property: "og:description",
        content: "Run a Google Pay test-environment payment sheet for Café 1 St Albans.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GooglePayTest,
});

function GooglePayTest() {
  const [amount, setAmount] = useState("1.00");
  const [result, setResult] = useState<string>("");

  // Never render or log payment method tokens, even in Google's TEST mode.
  const onResult = useCallback(() => {
    setResult("The official Google Pay TEST sheet returned successfully. No payment was submitted.");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm uppercase tracking-wider text-muted-foreground">Internal tooling</p>
        <h1 className="font-display text-3xl font-bold">Google Pay test payment</h1>
        <p className="mt-2 text-muted-foreground">
          Runs Google&apos;s payment sheet exactly as the integration checklist requires:{" "}
          <code>isReadyToPay</code>, the official button, then <code>loadPaymentData</code>. In{" "}
          <strong>TEST</strong> no money moves and the returned token is a dummy — it is Google&apos;s
          own sandbox, not SumUp&apos;s.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-brand">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Amount (GBP)
              <input
                className="w-24 rounded-lg border border-border bg-background px-2 py-1"
                value={amount}
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            TEST environment only. Wallet credentials and card tokens are not displayed or stored.
            To test real card acceptance, use a genuine order on the secure SumUp checkout.
          </p>

          <div className="mt-4">
            <GooglePayDemo
              key={amount}
              amount={amount || "1.00"}
              merchantName="Cafe 1 St Albans"
              environment="TEST"
              gatewayMerchantId="TEST_MERCHANT"
              onResult={onResult}
            />
          </div>

          {result && (
            <div className="mt-4">
              <p role="status" className="rounded-xl border border-border bg-muted p-3 text-sm">
                {result}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
          <h2 className="font-display text-lg font-bold">How to run a real end-to-end test</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Use this page in <strong>TEST</strong> on Chrome (desktop or Android, signed into a
              Google account) to confirm the sheet, button and checklist behaviour.
            </li>
            <li>
              For a real charge, place a £1 pickup order on the site and pay on the{" "}
              <code>/pay</code> page — the SumUp widget shows the Google Pay button there. SumUp has
              sandbox support depends on the merchant setup; for a live acceptance test it must be
              a genuine low-value payment (refund it afterwards from SumUp).
            </li>
            <li>
              Google Pay only appears on <code>https</code> origins registered in the Google Pay
              &amp; Wallet Console, so test on the live domain, not the preview URL.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
