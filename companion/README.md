# Café 1 staff companion — pre-release

The website `/staff-hours` provides an installable hours/pay dashboard. This separate Expo development-client app supplies native background location. It is not an Expo Go app, signed APK, TestFlight release or a guarantee of five-metre GPS accuracy.

## Behaviour

An administrator draws the **entire building outline**, checks the corners on site, and enables a fixed **5-metre outward buffer**. No guessed boundary is installed. Each staff member signs in with their own account, acknowledges location use and registers a phone; a manager approves it. One approved phone per staff member is allowed. Tokens persist in OS secure storage until sign-out, expiry/revocation or OS removal; login cannot be promised permanently.

The server requires 60 seconds of confident inside samples to clock in and 180 seconds of confident outside samples to clock out. The first confirmed candidate time is recorded. A gap exceeding 90 seconds resets confirmation. Accuracy over 10 metres, mocked coordinates and uncertainty across the boundary do not change attendance. Pausing, missing GPS, force-closing, rebooting or revoking permissions does not clock out. A manager must correct missing time. Client coordinates are evidence, not tamper-proof proof of attendance.

The encrypted SQLCipher queue separates accounts, uploads idempotently and deletes acknowledged coordinates. Samples older than five minutes go to review instead of silently changing pay. Coordinates older than seven days are cleared when syncing; no travel coordinates are retained in the server evidence table. The phone collects location while tracking is enabled, including outside the workplace. Pause tracking when not needed. Server evidence retention and backup retention require an operational policy before rollout.

Hours/pay uses London calendar dates and shifts starting in the selected period. Gross estimates use effective hourly rates and unpaid breaks; approval snapshots the amount. This is not payroll tax, overtime, holiday-pay or payment processing. Review anomalies and approve closed shifts before paying. Existing manual clocking remains available in Staff operations; entirely missed shifts currently need an administrator-assisted manual record/correction.

## Setup and checks

1. Apply `../supabase/migrations/20261029071724_staff_attendance_companion.sql` to a staging copy of **Cafe1** and run integration tests against the complete schema before production. The available database connection in this session exposed Dishbee, not Cafe1; no live migration was applied.
2. Configure the existing Google Maps browser key for the boundary editor.
3. In this directory run `npm ci`, copy `.env.example` to `.env` and set the Cafe1 public URL and publishable key. Never put a service-role key in the app.
4. Run `npm run typecheck`, `npm test`, `npx expo install --check` and `npm run export`. The SQL tests use real PostgreSQL via PGlite with a minimal fixture schema; they do not replace full Supabase/RLS integration testing.
5. Build native development clients with `npm run android` / `npm run ios`, or configure your own EAS project and use the supplied profiles. Apple/Google developer accounts, signing, physical phones and permission review are still required. SQLCipher needs a native rebuild.
6. Register staff, set rates, approve phones and draw/verify the boundary before enabling it. The map starts near the café only to aid navigation; it is not a surveyed boundary.

## Physical-device acceptance

Test every side of the building, indoor movement, entry, departure, a short step outside, weak GPS, locked screens for a full shift, Wi-Fi/mobile changes, airplane-mode recovery, revoked permission/device, sign-out/account changes, force-close, reboot and battery restrictions on both platforms. Check first-candidate timestamps, breaks, corrections and gross totals against a manual timesheet. Set up manager review of open shifts and stale last-sync times. If indoor GPS cannot distinguish this buffer, use a separately implemented on-site presence method such as managed Bluetooth beacons; this release does not implement beacons.

## Validation at preparation

- Website production build, typecheck and lint passed (warnings only); 143 Vitest tests and 76 script tests passed.
- Native typecheck, Expo dependency compatibility and Android/iOS JavaScript exports passed.
- SQL scenarios cover polygon validation, automatic arrival/departure, poor GPS, duplicates, out-of-order evidence, device revocation, cross-staff isolation and approved-pay snapshots.
- The full repository `npm run check` is blocked by a pre-existing opening-hours contract mismatch: `src/lib/nap.ts` lacks the verifier's required `openTime: "08:00"` marker. This feature does not change opening hours.
- No live database migration, signed binary, app-store publication or on-site accuracy claim has been made.
