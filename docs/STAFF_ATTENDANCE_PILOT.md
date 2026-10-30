# Staff attendance pilot acceptance — 29 October 2026

Status: **NOT authorised for operational automatic attendance or payroll reliance.**
This is an engineering handoff, not evidence of a surveyed boundary or a completed phone trial.

## Reviewed implementation

Baseline `fc20093` includes PRs 47, 49, 50 and 51. The staff-hours PWA provides personal records and manager reports, corrections, missing-shift creation, effective rates and approval snapshots. The Expo companion provides opt-in native background location. Managers retain device approval, AAL2-protected mutations and reasoned corrections.

The server uses signed distance to the complete polygon plus 5 metres, including concave footprints and rounded corners. Confidence must be wholly inside/outside; accuracy above 10 metres and mocked readings are uncertain. Arrival takes 60 seconds, departure 180 seconds; gaps over 90 seconds reset candidates. No readings means no inferred departure. Samples older than five minutes require review. No migration or boundary activation was performed during this review.

## Changes in this review

- Preserve a coordinate-free phone review indicator when the server accepts evidence but returns offline/out-of-order/shift review. Previously these successful uploads were deleted without a local review indication.
- Scope phone registration IDs to account and site. **Existing prerelease testers must request approval again; managers must revoke the old approved registration first.** Approval is never inherited by another account. Old encrypted queues retain their original owner.
- Bind queue uploads to the verified session token and stop draining when the current account changes. A request already in flight remains bound to its original account.
- Recheck account identity after permission prompts and native startup; stop tracking if the account changed. Local sign-out no longer depends on a successful queue upload.

## Reproducible checks

Run `npm ci` at the repository root and in `companion/`.

- Root: `npm run check` (integrity, production build, typecheck, lint, 147 Vitest tests, 76 script tests and output checks).
- Companion: `npm run typecheck`, `npm test`, `npx expo install --check`, `npm run export`.
- Companion tests: 16 JavaScript tests plus SQL scenarios in a fresh disposable PGlite database. Added coverage includes four edges, corner buffer, concave outline, indoor movement, uncertain/mocked GPS, dwell reset after missing evidence, missed departure, open-shift approval rejection, DST elapsed time, breaks, effective rates, rounding, approval reset and access restrictions. Existing scenarios include arrivals/departures, duplicate and old samples, missing-shift entry, overlap rejection, device revocation and manual clocking.
- `supabase/tests/staff_attendance_pilot.sql` runs the same additional scenarios against the complete schema in the existing GitHub database job. A test prevents the fixture and full-schema scenarios from drifting.
- PGlite verifies all three attendance migrations in dependency order against a minimal fixture, RLS flags and revoked direct grants on all five attendance tables, and cross-account dashboard isolation using `SET ROLE authenticated`. It does **not** verify the entire Supabase stack or Cafe1's deployed schema.

Local test/export results are software evidence only. JavaScript export is not an Android/iOS build, device test, or signing result. Consult the PR checks for the complete-schema CI result; do not treat a queued/skipped/failed job as acceptance.

## Database gate

Only Dishbee (`ebzinvoxundsdubczqfg`) is visible to the connected management account. It was not modified. Cafe1 is `hviprglhhlwgsitdfvxp`. Local Docker/PostgreSQL-server tools are unavailable in this workspace. Therefore **Cafe1 staging and production migration state could not be verified**; the README's earlier unapplied status remains a handoff, not a fresh live inspection.

1. Obtain Cafe1 management access and inspect its migration history/schema drift.
2. Create a disposable Cafe1 staging clone without staff personal data. Confirm the complete historical schema first, then apply in order:
   - `20261029071724_staff_attendance_companion.sql`
   - `20261029080352_staff_attendance_completion.sql`
   - `20261029081748_staff_attendance_site_access.sql`
3. Run all Supabase pgTAP tests, including both attendance files, on the full schema. Validate real Auth/PostgREST requests as anonymous, staff A, staff B, driver, manager AAL1 and manager AAL2. Confirm direct table writes and self-approval are denied, corrections are audited, and exports cannot expose another staff account.
4. Check advisors, backup/restore procedure and coordinate/evidence retention policy. Record project ref, migration hashes, test output and acceptance owner. Keep every boundary disabled until field acceptance.

No new migration is introduced by this change. Dependencies include the existing sites, profiles, user_roles/has_role, staff_time_entries, audit_events and cafe1_assert_operator contracts. CI reconstructs these from the entire migration chain.

## Native distribution gate

App identifiers: `uk.co.cafe1stalbans.staff` (both platforms). SQLCipher, iOS background location and Android foreground/background location are configured. `productionReady` remains false. EAS project ID and signing credentials are not configured in the repository; no usable Expo/Apple/Android signing credentials were available here.

1. Use the business Expo account and initialise/link its EAS project. Configure the **staging** URL and publishable key through the chosen EAS environment; never a service-role key. Check resolved Expo config before building.
2. Build an Android internal APK using the preview profile. For iOS use registered-device internal provisioning or an App Store/TestFlight build with the business Apple account. The preview profile alone is not TestFlight distribution.
3. Verify native SQLCipher at runtime, OS permission prompts, secure-session persistence, notification/background indicators and native service behaviour. Rebuild native clients when plugins change. Expo Go cannot perform this acceptance.
4. Record binary/build ID, source commit, OS/phone models, environment and permissions. Distribute only to named testers until the acceptance below passes.

## Physical acceptance and payroll gate

Manager to record expected and actual timestamps against a manual timesheet for each scenario on both Android and iOS:

| Scenario | Required result |
| --- | --- |
| Survey every external wall, entrance, annex and floor usage | One verified full footprint; 5m guide checked on site, not assumed from satellite imagery |
| Walk inside across all sides and floors | No false departure or extra shift |
| Enter and remain; depart and remain outside | 60s/180s reliable evidence, recorded first-candidate times match observations |
| Short step outside, corner crossing, poor indoor GPS | No premature state change; uncertainty remains visible |
| Locked screen for full shift; battery saving; reboot/force-close | Document OS limits; absent readings trigger manager review, never invented time |
| Airplane mode, Wi-Fi/mobile change, large backlog | Ordered retries, duplicates harmless, stale readings retained as review indicators |
| Revoke approval/permissions, disable location, change boundary | Tracking blocked/paused or clearly degraded; no silent payroll reliance |
| Sign out/switch accounts during prompt, startup and upload | No mixed records, queues or approval inheritance |
| Forgotten arrival or departure | Manager adds/corrects shift with reason; no approval until verified |
| Breaks, midnight/DST, rate change, corrected approved shift | Totals reconciled to manual records; correction clears approval |

Set an accountable manager and daily review of open shifts, missing samples, last-sync time and pending corrections, including shifts outside the currently selected reporting period. Agree retention and staff location/privacy information before testing. Keep an independent manual timesheet throughout the pilot. If indoor positioning cannot resolve the buffer, do not relax the uncertainty guard: use manual attendance or separately implement and test an on-site presence method.

Only after database acceptance, signed-device testing, boundary measurements and permission review may the responsible manager authorise a limited operational pilot. Payroll reliance requires a separate reconciliation sign-off. Pausing collection or disabling a boundary does not close existing shifts; managers must review them manually.

## Follow-up: missed departure review

The Hours & pay screen now has an independent all-dates open-shift panel. It uses the authenticated client's existing `staff_time_self_or_admin` SELECT policy, restricted to the chosen site and open records. Staff/drivers see their own records; administrators can review all staff. The oldest 200 are shown with an explicit overflow message. A 400-day-old open shift remains visible even when the payroll report shows today. The panel links to the shift's London start date and does not include open time in approved pay.

Open shifts over 18 hours are flagged for correction. Phone sync indicators distinguish never synced, recently synced, stale and suspect timestamps; stale evidence never implies departure. Report exports are disabled during refresh or refresh failure. Failed refresh after a successful mutation explicitly tells the user that the save succeeded but records need refreshing.

`supabase/tests/staff_open_shifts.sql` exercises the actual table policy under authenticated staff, driver and manager roles, including old records, site filtering and closed-shift exclusion. Unit tests check London dates, sync thresholds and long-shift warnings. No schema migration, live database change or attendance activation is added by this follow-up.
