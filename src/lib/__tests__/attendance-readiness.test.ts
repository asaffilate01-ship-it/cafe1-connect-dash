import { describe, expect, it } from "vitest";
import {
  isPrecise,
  allowsBackground,
  readinessChecks,
  type DeviceHealth,
} from "../../../companion/readiness";
const good: DeviceHealth = {
  running: true,
  services: true,
  foreground: true,
  background: true,
  precise: true,
  configurationMatches: true,
};
describe("companion phone readiness", () => {
  it("does not interpret granted approximate location as precise permission", () => {
    expect(isPrecise({ granted: true, android: { accuracy: "coarse" } })).toBe(false);
    expect(isPrecise({ granted: true, ios: { accuracy: "reduced" } })).toBe(false);
    expect(isPrecise({ granted: false, android: { accuracy: "fine" } })).toBe(false);
    expect(isPrecise({ granted: true })).toBe(false);
    expect(isPrecise({ granted: true, android: { accuracy: "fine" } })).toBe(true);
    expect(isPrecise({ granted: true, ios: { accuracy: "full" } })).toBe(true);
    expect(allowsBackground({ granted: true, ios: { scope: "whenInUse" } })).toBe(false);
    expect(allowsBackground({ granted: true, ios: { scope: "always" } })).toBe(true);
    expect(allowsBackground({ granted: false })).toBe(false);
    expect(allowsBackground({ granted: true })).toBe(true);
  });
  it("leaves unknown online approvals visibly unchecked", () => {
    const checks = readinessChecks(good, null, null);
    expect(checks.filter((c) => c.ok === null).map((c) => c.label)).toEqual([
      "Manager phone approval",
      "Verified workplace boundary",
    ]);
    expect(readinessChecks(null, null, null).every((c) => c.ok === null)).toBe(true);
  });
  it("distinguishes a registered service from the correct account/site configuration", () => {
    const checks = readinessChecks({ ...good, configurationMatches: false }, true, true);
    expect(checks.at(-1)?.ok).toBe(false);
    expect(checks.filter((c) => c.ok === false)).toHaveLength(1);
  });
  it("shows permission loss and revoked approval even while a service is registered", () => {
    const checks = readinessChecks({ ...good, background: false, services: false }, false, true);
    expect(checks.filter((c) => c.ok === false).map((c) => c.label)).toEqual([
      "Phone location services",
      "Background location permission",
      "Manager phone approval",
    ]);
    expect(readinessChecks(good, true, true).every((c) => c.ok === true)).toBe(true);
  });
});
