import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");

export const REQUIRED_OPERATIONAL_GATES = [
  "application_ci",
  "database_ci",
  "codeql",
  "browser_journeys",
  "production_smoke",
  "release_evidence",
  "website_sumup",
  "reader_sumup",
  "declined_cancelled_payment",
  "cash_voucher_split_tender",
  "partial_remaining_refund",
  "idempotency",
  "settlement_reconciliation",
  "printer_cash_drawer",
  "customer_display",
  "kds_routing_recovery",
  "deliveroo_kds_integration",
  "just_eat_kds_integration",
  "fulfilment_flows",
  "manager_mfa_aal2",
  "production_environment",
  "google_key_rotated",
  "supabase_restore_rls",
  "scheduler_history",
  "email_delivery_bounces",
  "monitoring_alerts",
  "legal_hmcts_retention",
  "incident_rollback_owners",
  "staff_rehearsal_soft_launch",
];

function meaningful(value) {
  return typeof value === "string" && value.trim().length >= 3;
}

function validTimestamp(value) {
  return meaningful(value) && Number.isFinite(Date.parse(value));
}

export function validateOperationalAcceptance(record, { strict = false } = {}) {
  const validationErrors = [];
  const strictErrors = [];
  const gates = Array.isArray(record?.gates) ? record.gates : [];
  const exceptions = Array.isArray(record?.exceptions) ? record.exceptions : [];
  if (record?.schema_version !== 1) validationErrors.push("schema_version must be 1");
  if (!Array.isArray(record?.gates)) validationErrors.push("gates must be an array");
  if (!Array.isArray(record?.exceptions)) validationErrors.push("exceptions must be an array");

  const ids = gates.map((gate) => gate?.id).filter(Boolean);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) {
    validationErrors.push(`duplicate gate ids: ${[...new Set(duplicates)].join(", ")}`);
  }

  for (const id of REQUIRED_OPERATIONAL_GATES) {
    if (!ids.includes(id)) validationErrors.push(`required gate is missing: ${id}`);
  }
  for (const id of ids) {
    if (!REQUIRED_OPERATIONAL_GATES.includes(id)) {
      validationErrors.push(`unknown gate id: ${id}`);
    }
  }

  for (const gate of gates) {
    if (!gate || !["pending", "pass", "fail"].includes(gate.status)) {
      validationErrors.push(`${gate?.id ?? "unknown gate"}: status must be pending, pass or fail`);
      continue;
    }
    if (gate.status === "pass") {
      if (!meaningful(gate.evidence)) {
        validationErrors.push(`${gate.id}: passing gate requires evidence`);
      }
      if (!meaningful(gate.checked_by)) {
        validationErrors.push(`${gate.id}: passing gate requires checked_by`);
      }
      if (!validTimestamp(gate.checked_at)) {
        validationErrors.push(`${gate.id}: passing gate requires an ISO checked_at timestamp`);
      }
    }
    if (strict && gate.status !== "pass") strictErrors.push(`${gate.id}: gate has not passed`);
  }

  const approvals = record?.approvals ?? {};
  if (strict) {
    if (exceptions.length) strictErrors.push("open exceptions are not allowed for full go-live");
    if (approvals.go_live_decision !== "approved") {
      strictErrors.push("go_live_decision must be approved");
    }
    if (!meaningful(approvals.operations_owner)) strictErrors.push("operations_owner is required");
    if (!meaningful(approvals.technical_owner)) strictErrors.push("technical_owner is required");
    if (!validTimestamp(approvals.approved_at)) {
      strictErrors.push("approved_at must be an ISO timestamp");
    }
  }

  const errors = [...validationErrors, ...strictErrors];

  const passed = gates.filter((gate) => gate?.status === "pass").length;
  const failed = gates.filter((gate) => gate?.status === "fail").length;
  const pending = gates.filter((gate) => gate?.status === "pending").length;
  const approvalsComplete =
    approvals.go_live_decision === "approved" &&
    meaningful(approvals.operations_owner) &&
    meaningful(approvals.technical_owner) &&
    validTimestamp(approvals.approved_at);
  const ready =
    errors.length === 0 &&
    passed === REQUIRED_OPERATIONAL_GATES.length &&
    failed === 0 &&
    pending === 0 &&
    exceptions.length === 0 &&
    approvalsComplete;

  return {
    schema_valid: validationErrors.length === 0,
    ready,
    total: REQUIRED_OPERATIONAL_GATES.length,
    passed,
    failed,
    pending,
    errors: [...new Set(errors)],
  };
}

function parseArguments(argv) {
  const args = [...argv];
  let input = "release/operational-acceptance.json";
  let output;
  let strict = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === "--strict") strict = true;
    else if (argument === "--input") input = args.shift();
    else if (argument === "--output") output = args.shift();
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  if (!input) throw new Error("--input requires a path");
  if (argv.includes("--output") && !output) throw new Error("--output requires a path");
  return { input, output, strict };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const record = JSON.parse(readFileSync(resolve(root, options.input), "utf8"));
  const report = validateOperationalAcceptance(record, { strict: options.strict });
  if (options.output) {
    const target = resolve(root, options.output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(
    `Operational acceptance: ${report.passed}/${report.total} passed, ${report.pending} pending, ${report.failed} failed.`,
  );
  if (report.errors.length) {
    console.error(report.errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
