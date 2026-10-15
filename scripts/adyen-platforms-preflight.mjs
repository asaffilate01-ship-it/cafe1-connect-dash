import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ADYEN_STALBANS_EVIDENCE = Object.freeze({
  common: [
    "legalEntityAndAccountHolderVerified",
    "adyenContractAndFeeScheduleSigned",
    "merchantAndStoreMappedToCafe1StAlbans",
    "balanceAndLiableAccountsReconciled",
    "verifiedBankPayoutAccount",
    "merchantCapabilitiesApproved",
    "separateFromLutonAndMealdeckTenants",
    "signedWebhooksAndReplayTested",
    "cashVoucherJudgeTabParityAccepted",
    "sumupHistoricalLedgersAndRefundsRetained",
    "providerRoutingAndDoubleChargeProtection",
    "liveReleaseAndRollbackRehearsed",
    "financeAndOperationsApproval",
  ],
  online: [
    "onlinePaymentSessionCreatedWithServerPrice",
    "card3DSAppleAndGooglePaySandboxAccepted",
    "authorisationCaptureAndCancellationAccepted",
    "paymentFailedDoesNotReleaseKitchen",
    "oneSuccessfulPaymentReleasesOneKdsTicket",
    "onlinePartialAndFullRefundReconciled",
    "splitAllocationAndPayoutsReconciled",
  ],
  counter: [
    "adyenCompatibleTerminalsProvisioned",
    "terminalMappedToStAlbansTillAndStaff",
    "contactlessChipAndPinAndDeclineAccepted",
    "cashCardSplitAndJurorTopUpAccepted",
    "terminalDisconnectionRetryAndRecoveryAccepted",
    "receiptAndPrinterDeviceAcceptance",
    "terminalPartialAndFullRefundReconciled",
  ],
});

function validEvidence(value) {
  if (!value || value.passed !== true ||
      typeof value.evidence !== "string" ||
      value.evidence.trim().length < 8 ||
      value.evidence.length > 240) return false;
  // Evidence must be a non-secret ticket/run identifier or a clean HTTPS URL.
  // Never accept tokens/query-string credentials in the acceptance record.
  const str = value.evidence.trim();
  if (/^(?:https?:)?\/\//i.test(str)) {
    try {
      const url = new URL(str);
      return url.protocol === "https:" && !url.username && !url.password &&
        !url.search && !url.hash;
    } catch { return false; }
  }
  return !/(?:key=|token=|secret=|password=|Bearer )/i.test(str);
}

/**
 * This is an evidence-coverage audit only. No one can authorise a real payment
 * provider cutover by submitting a JSON checklist.
 */
export function assessAdyenForPlatformsCutover(record, channels = ["online", "counter"]) {
  const types = ["online", "counter"];
  const requested = Array.isArray(channels) ? channels : [];
  const invalidChannels = requested.filter((channel) => !types.includes(channel));
  const required = [...ADYEN_STALBANS_EVIDENCE.common,
    ...types.filter((channel) => requested.includes(channel)).flatMap(
      (channel) => ADYEN_STALBANS_EVIDENCE[channel],
    )];
  const identityMatches = record?.schemaVersion === 1 &&
    record?.provider === "adyen_for_platforms" &&
    record?.businessKey === "cafe1stalbans" &&
    record?.landlord === "dishbee" &&
    record?.product === "dishbee-one";
  const evidence = record?.checks && typeof record.checks === "object" ? record.checks : {};
  const incomplete = required.filter((key) => !validEvidence(evidence[key]));
  const blockers = [
    ...(!identityMatches ? ["wrongOrMissingTenantProviderIdentity"] : []),
    ...(invalidChannels.length || !requested.length ? ["invalidOrMissingPaymentChannels"] : []),
    ...incomplete,
  ];
  return {
    schemaVersion: 1,
    target: "Cafe 1 St Albans / Dishbee One",
    currentProvider: "sumup",
    proposedProvider: "adyen_for_platforms",
    assessedChannels: requested.filter((c) => types.includes(c)),
    evidenceCoverageComplete: blockers.length === 0,
    checked: required.length - incomplete.length,
    total: required.length,
    missing: blockers,
    // Deliberately ALWAYS false: offline evidence cannot prove actual tenant
    // binding, card-network agreement, bank acceptance or production authorisation.
    liveSwitchAuthorised: false,
    productionProviderConfigured: false,
    note: "Checklist coverage is not merchant approval, deployment evidence or cutover authorisation.",
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run preflight:adyen -- /absolute/path/to/private-adyen-evidence.json");
    process.exitCode = 2;
    return;
  }
  let record;
  try {
    const content = readFileSync(resolve(path), "utf8");
    if (content.length > 64_000) throw new Error("file too large");
    record = JSON.parse(content);
  } catch {
    console.error("Adyen evidence file is unavailable or malformed. No provider changes were made.");
    process.exitCode = 2;
    return;
  }
  const result = assessAdyenForPlatformsCutover(record);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.evidenceCoverageComplete) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
