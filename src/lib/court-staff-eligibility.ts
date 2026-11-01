export type CourtStaffStatus = "pending" | "approved" | "suspended";

/**
 * A suspended scheme member must never regain a discount through the
 * self-registration/allowlisted-domain path.
 */
export function nextCourtStaffStatus(
  existing: CourtStaffStatus | null | undefined,
  verifiedAllowlistedDomain: boolean,
): CourtStaffStatus {
  if (existing === "suspended") return "suspended";
  if (existing === "approved") return "approved";
  return verifiedAllowlistedDomain ? "approved" : "pending";
}

/**
 * Linking a pre-provisioned staff record requires a provider-verified email.
 * Neither user_metadata nor a client-submitted email can establish ownership.
 */
export function canClaimCourtStaffRecord(
  member: { email: string; user_id: string | null },
  identity: { email: string; userId: string; emailVerified: boolean },
): boolean {
  return (
    identity.emailVerified &&
    member.email.trim().toLowerCase() === identity.email.trim().toLowerCase() &&
    (member.user_id === null || member.user_id === identity.userId)
  );
}
