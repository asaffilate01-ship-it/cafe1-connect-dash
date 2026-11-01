import { describe, expect, it } from "vitest";
import { canClaimCourtStaffRecord, nextCourtStaffStatus } from "@/lib/court-staff-eligibility";

describe("court staff access", () => {
  it("keeps suspended members suspended despite a verified government email", () => {
    expect(nextCourtStaffStatus("suspended", true)).toBe("suspended");
    expect(nextCourtStaffStatus("approved", false)).toBe("approved");
    expect(nextCourtStaffStatus("pending", true)).toBe("approved");
    expect(nextCourtStaffStatus(null, false)).toBe("pending");
  });

  it("requires a verified canonical email and does not steal linked memberships", () => {
    const member = { email: "person@justice.gov.uk", user_id: null };
    const identity = { email: "PERSON@justice.gov.uk", userId: "user-1", emailVerified: true };
    expect(canClaimCourtStaffRecord(member, identity)).toBe(true);
    expect(canClaimCourtStaffRecord(member, { ...identity, emailVerified: false })).toBe(false);
    expect(canClaimCourtStaffRecord(member, { ...identity, email: "other@justice.gov.uk" })).toBe(
      false,
    );
    expect(canClaimCourtStaffRecord({ ...member, user_id: "user-2" }, identity)).toBe(false);
    expect(canClaimCourtStaffRecord({ ...member, user_id: "user-1" }, identity)).toBe(true);
  });
});
