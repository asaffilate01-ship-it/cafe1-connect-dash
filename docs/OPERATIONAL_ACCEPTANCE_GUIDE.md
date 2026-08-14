# Completing operational acceptance

`release/operational-acceptance.json` is the machine-readable counterpart to `docs/OPERATIONAL_ACCEPTANCE_RECORD.md`. It prevents a technically green build being labelled 100% ready without real payment, hardware, recovery, security and staff evidence.

For every gate:

1. Perform the real test on the release candidate.
2. Set `status` to `pass` only when the expected result is observed.
3. Put a workflow URL, provider transaction reference, signed record, report location or other auditable reference in `evidence`. Do not put passwords, API keys, card details or customer personal data in Git.
4. Record the responsible person in `checked_by` and an ISO timestamp in `checked_at`, for example `2026-08-03T09:30:00Z`.
5. Leave `exceptions` empty for a full public go-live.
6. Complete both named approvals and set `go_live_decision` to `approved` only after every gate has passed.

Run `npm run operational:status` while gathering evidence. The command reports progress without pretending pending gates are complete. `npm run operational:check` is strict and blocks production promotion until all 29 gates, approvals and evidence references are complete.

The final promotion also runs `npm run release:check` against the retained
production-smoke JSON. That strict decision additionally requires the exact
deployed commit and every item in `docs/GO_LIVE_CHECKLIST.md`; passing software
tests alone can never produce a go-live approval.

Record one completed gate without hand-editing JSON:

```bash
npm run operational:record -- \
  --gate application_ci \
  --status pass \
  --evidence "https://github.com/asaffilate01-ship-it/cafe1-connect-dash/actions/runs/123456" \
  --checked-by "Amer Saleem"
```

The recorder validates the gate name, evidence, operator and timestamp, writes
the JSON atomically and refuses evidence that resembles an API key, bearer
token, private key or JWT. Store only a workflow URL, provider reference,
signed-record location or another non-secret audit reference in Git.

The **Promote verified production** workflow additionally requires:

- a successful Production checks run from the same commit;
- a deployed `/api/public/health` response containing that exact commit;
- a passing production smoke and desktop/mobile browser run;
- a semantic release tag and explicit `PROMOTE-CAFE1` confirmation.

On success, GitHub records the production Environment deployment and creates the immutable tag and release. Retain its one-year evidence artifact and record the rollback commit separately.
