# Café 1 St Albans — SumUp Google Pay integration

This package is for the existing React/TypeScript Café 1 checkout. It uses the
official SumUp Payment Widget, which in turn renders Google's official Google
Pay button. It does not recreate the Google Pay button or fabricate payment
screens.

## Files

- `src/Cafe1SumUpGooglePay.tsx` — drop-in production component.
- `src/PaymentPage.example.tsx` — minimal usage example.

## Install

1. Copy `Cafe1SumUpGooglePay.tsx` into your components/payments folder.
2. Import it into the existing `/pay/$orderId` page.
3. Continue creating the SumUp checkout on the server. Pass only the returned
   checkout ID to the component.
4. Pass the public Google Pay merchant ID from your hosting configuration as
   `googlePayMerchantId`.
5. Never put the SumUp API key, access token or webhook secret in browser code.

Example:

```tsx
<Cafe1SumUpGooglePay
  checkoutId={order.sumup_checkout_id}
  customerEmail={order.customer_email}
  amount={(order.total_cents / 100).toFixed(2)}
  googlePayMerchantId={googlePayMerchantId}
  merchantName="Cafe 1 St Albans"
/>
```

The server-created SumUp checkout remains the authoritative source for the
amount and currency. Verify success on the server through the SumUp Checkout
API or a signed webhook before marking the Café 1 order as paid.

## Google approval screenshots and testing

Google Pay testing and production charging are separate, to prevent a demonstration
wallet sheet from ever appearing on the real customer checkout.

- Use `/google-pay-test` in Google's **TEST** environment for official onboarding screenshots. The returned payment data must not be saved, logged or rendered as raw JSON.
- Use `/pay/<real-order-id>?token=<real-order-token>` only for a real server-created SumUp checkout and normal provider processing. The payment page no longer accepts a simulated-order hash mode.
- Complete Google merchant/domain approval in the Google Pay & Wallet Console, and activate the relevant wallets with SumUp, before testing real low-value checkout charges on Android Chrome and Apple Safari.
- The server must confirm the SumUp order reference, amount and GBP currency before marking an order as paid or sending it to the kitchen. A widget success event alone is **not proof of settlement**.

Avoid fabricated payment confirmations, card numbers or fake screenshot overlays in approval submissions.

## Security headers

The payment page must permit SumUp and Google Pay. Merge these values into the
site's existing Content Security Policy rather than replacing the whole policy:

```text
script-src ... https://gateway.sumup.com https://pay.google.com;
frame-src ... https://gateway.sumup.com https://pay.google.com;
connect-src ... https://api.sumup.com https://gateway.sumup.com https://pay.google.com;
```

Keep HTTPS enabled and do not put the payment page inside another site's frame.

## Production checklist

- SumUp has enabled Google Pay for the live merchant account.
- Google has approved `cafe1stalbans.co.uk`.
- The Google merchant ID passed to the component matches the approved domain.
- The page uses a genuine server-created SumUp checkout ID.
- The confirmation handler verifies payment status server-side.
- Test on Chrome desktop and Android with a Google account and supported card.
