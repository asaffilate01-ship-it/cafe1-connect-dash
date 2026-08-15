import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseGitHubRunUrl,
  verifyGitHubReleaseEvidence,
  verifyRequiredJobs,
  verifyWorkflowRun,
} from "./record-github-release-evidence.mjs";

const repository = "asaffilate01-ship-it/cafe1-connect-dash";
const commit = "6f306e65a90a749ed838e599e95919cc3c36c141";

function freshRecord() {
  const record = JSON.parse(
    readFileSync(new URL("../release/operational-acceptance.json", import.meta.url), "utf8"),
  );
  // Fixtures must not inherit real sign-offs recorded in the live file.
  record.gates = record.gates.map((gate) => ({
    ...gate,
    status: "pending",
    evidence: "",
    checked_by: "",
    checked_at: "",
  }));
  return record;
}

function run(name, overrides = {}) {
  return { name, head_sha: commit, status: "completed", conclusion: "success", ...overrides };
}

function client(overrides = {}) {
  const runs = {
    101: run("Production checks"),
    102: run("Browser journeys"),
    103: run("CodeQL"),
    104: run("Production smoke"),
    105: run("Release candidate evidence"),
    ...overrides.runs,
  };
  return {
    async getRun(id) {
      return runs[id];
    },
    async getJobs() {
      return (
        overrides.jobs ?? [
          { name: "Application", status: "completed", conclusion: "success" },
          {
            name: "Supabase migrations and pgTAP",
            status: "completed",
            conclusion: "success",
          },
        ]
      );
    },
  };
}

const url = (id) => `https://github.com/${repository}/actions/runs/${id}`;

test("accepts only canonical run URLs for this repository", () => {
  assert.deepEqual(parseGitHubRunUrl(url(101), repository), { runId: "101", url: url(101) });
  assert.throws(
    () => parseGitHubRunUrl("https://github.com/other/repo/actions/runs/101", repository),
    /must belong/,
  );
  assert.throws(() => parseGitHubRunUrl(`${url(101)}?token=secret`, repository), /must belong/);
  assert.throws(() => parseGitHubRunUrl(`${url(101)}/jobs/4`, repository), /numeric run id/);
});

test("rejects stale, failed or misnamed workflow runs and jobs", () => {
  assert.throws(
    () =>
      verifyWorkflowRun(run("CodeQL", { head_sha: "0".repeat(40) }), {
        workflowName: "CodeQL",
        commit,
      }),
    /does not target/,
  );
  assert.throws(
    () =>
      verifyWorkflowRun(run("Production smoke", { conclusion: "failure" }), {
        workflowName: "Production smoke",
        commit,
      }),
    /completed successfully/,
  );
  assert.throws(
    () => verifyRequiredJobs([], ["Application"], "Production checks"),
    /required job did not pass/,
  );
});

test("records only exact-SHA automated gates with verified jobs", async () => {
  const result = await verifyGitHubReleaseEvidence(
    {
      repository,
      commit,
      actor: "release-manager",
      checkedAt: "2026-08-09T12:00:00.000Z",
      record: freshRecord(),
      runUrls: {
        productionChecksUrl: url(101),
        browserUrl: url(102),
        codeqlUrl: url(103),
      },
    },
    client(),
  );
  assert.equal(result.report.passed, 4);
  for (const id of ["application_ci", "database_ci", "browser_journeys", "codeql"]) {
    const gate = result.record.gates.find((candidate) => candidate.id === id);
    assert.equal(gate.status, "pass");
    assert.equal(gate.checked_by, "github:release-manager");
  }
  assert.equal(result.record.gates.find((gate) => gate.id === "website_sumup").status, "pending");
});

test("optionally records production smoke and release-candidate evidence", async () => {
  const result = await verifyGitHubReleaseEvidence(
    {
      repository,
      commit,
      actor: "release-manager",
      record: freshRecord(),
      runUrls: {
        productionChecksUrl: url(101),
        browserUrl: url(102),
        codeqlUrl: url(103),
        productionSmokeUrl: url(104),
        releaseCandidateUrl: url(105),
      },
    },
    client(),
  );
  assert.equal(result.report.passed, 6);
  assert.equal(result.record.gates.find((gate) => gate.id === "production_smoke").status, "pass");
  assert.equal(result.record.gates.find((gate) => gate.id === "release_evidence").status, "pass");
});

test("fails closed when a required production job is missing", async () => {
  await assert.rejects(
    verifyGitHubReleaseEvidence(
      {
        repository,
        commit,
        actor: "release-manager",
        record: freshRecord(),
        runUrls: {
          productionChecksUrl: url(101),
          browserUrl: url(102),
          codeqlUrl: url(103),
        },
      },
      client({ jobs: [{ name: "Application", status: "completed", conclusion: "success" }] }),
    ),
    /Supabase migrations and pgTAP/,
  );
});
