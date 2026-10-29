// Approval belongs to an account at a site, never to whoever next uses this phone.
export function deviceStorageKey(userId: string, siteId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(userId) || !/^[a-f0-9-]{36}$/i.test(siteId))
    throw new Error("Choose a valid account and site before registering this phone");
  return `attendance-device.${userId}.${siteId}`;
}
