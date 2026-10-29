export type DeviceHealth = {
  running: boolean;
  services: boolean;
  foreground: boolean;
  background: boolean;
  precise: boolean;
  configurationMatches: boolean;
};
export function readinessChecks(
  health: DeviceHealth | null,
  approved: boolean | null,
  boundary: boolean | null,
) {
  return [
    {
      label: "Phone location services",
      ok: health?.services ?? null,
      help: "Turn on location in phone settings.",
    },
    {
      label: "Precise location permission",
      ok: health ? health.foreground && health.precise : null,
      help: "Allow precise location for Café 1.",
    },
    {
      label: "Background location permission",
      ok: health?.background ?? null,
      help: "Allow Always / background location in phone settings.",
    },
    {
      label: "Manager phone approval",
      ok: approved,
      help: "Refresh records after your manager approves this phone.",
    },
    {
      label: "Verified workplace boundary",
      ok: boundary,
      help: "Your manager must verify and enable the building outline.",
    },
    {
      label: "Tracking for this account and site",
      ok: health ? health.running && health.configurationMatches : null,
      help: "Enable attendance after the checks above are complete.",
    },
  ];
}
export function isPrecise(permission: {
  granted: boolean;
  android?: { accuracy: string };
  ios?: { accuracy: string };
}) {
  return (
    permission.granted &&
    (permission.android?.accuracy === "fine" || permission.ios?.accuracy === "full")
  );
}
