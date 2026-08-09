# Required GitHub repository settings

These settings are part of the production control boundary and cannot be guaranteed by committed files alone.

## Main branch protection

Apply a branch ruleset to `main` with:

- require a pull request before merging;
- require one approving review and dismissal of stale approvals;
- require review from Code Owners;
- require conversation resolution;
- require branches to be up to date before merging;
- require these checks: `Application`, `Supabase migrations and pgTAP`, `CodeQL` and `Browser journeys`;
- block force pushes and branch deletion;
- do not allow bypass for normal contributors;
- use squash merge for release PRs so the final release SHA is unambiguous.

## Security and Actions

- enable secret scanning, push protection and Dependabot alerts;
- keep workflow permissions at read-only by default;
- allow write permissions only in the named evidence and promotion workflows;
- pin third-party Actions to reviewed versions;
- retain production evidence artifacts for the periods declared in the workflows.

## Production environment

Create the `production` GitHub Environment with:

- at least one required reviewer;
- no self-review where the plan supports it;
- deployment branches restricted to protected `main` and release tags;
- no credentials stored in repository files;
- a documented deployment/rollback owner.

After the ruleset is enabled, attach the settings URL or screenshot to the operational acceptance gate. Repository files can document the intended control but cannot prove that the GitHub setting is enabled.
