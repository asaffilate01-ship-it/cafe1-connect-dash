import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import { randomUUID, getRandomBytesAsync } from "expo-crypto";
import { isPrecise, allowsBackground } from "./readiness";
import { backend, rpc } from "./backend";
import { drainQueue, RETRY_WARNING } from "./sync-queue";
const TASK = "cafe1-attendance-location-v1";
export async function trackingStatus(userId: string, siteId: string, boundaryVersion?: string) {
  const [running, foreground, background, services, config, warning, syncWarning] =
    await Promise.all([
      Location.hasStartedLocationUpdatesAsync(TASK),
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(),
      currentConfig(),
      SecureStore.getItemAsync("attendance-tracking-warning"),
      SecureStore.getItemAsync("attendance-sync-warning"),
    ]);
  return {
    running,
    services,
    foreground: foreground.granted,
    background: allowsBackground(background),
    precise: isPrecise(foreground),
    configurationMatches:
      config?.userId === userId &&
      config?.site_id === siteId &&
      (!boundaryVersion || config.boundary_version === boundaryVersion),
    boundaryVersion: config?.boundary_version,
    warning: syncWarning ?? warning,
  };
}
const CONFIG = "cafe1-attendance-config";
export type TrackingConfig = {
  userId: string;
  site_id: string;
  device_id: string;
  boundary_version: string;
};
let dbPromise: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  return (dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync("attendance.db");
    let key = await SecureStore.getItemAsync("attendance-db-key");
    if (!key) {
      key = Array.from(await getRandomBytesAsync(32), (x) => x.toString(16).padStart(2, "0")).join(
        "",
      );
      await SecureStore.setItemAsync("attendance-db-key", key, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    }
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid local encryption key");
    await d.execAsync(
      `PRAGMA key = '${key}'; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS samples (id TEXT PRIMARY KEY,owner TEXT NOT NULL,payload TEXT NOT NULL, captured REAL NOT NULL, status TEXT NOT NULL DEFAULT 'queued', reason TEXT);`,
    );
    return d;
  })());
}
export async function currentConfig(): Promise<TrackingConfig | null> {
  const raw = await SecureStore.getItemAsync(CONFIG);
  return raw ? JSON.parse(raw) : null;
}
export type QueueSummary = { pending: number; review: number; reason: string | null };
export async function queueSummary(): Promise<QueueSummary> {
  const d = await db();
  const {
    data: { session },
  } = await backend.auth.getSession();
  if (!session) return { pending: 0, review: 0, reason: null };
  const counts = await d.getFirstAsync<{ pending: number; review: number }>(
    "SELECT coalesce(sum(status='queued'),0) AS pending,coalesce(sum(status='review'),0) AS review FROM samples WHERE owner=?",
    session.user.id,
  );
  const latest = await d.getFirstAsync<{ reason: string }>(
    "SELECT reason FROM samples WHERE owner=? AND status='review' ORDER BY captured DESC LIMIT 1",
    session.user.id,
  );
  return {
    pending: counts?.pending ?? 0,
    review: counts?.review ?? 0,
    reason: latest?.reason ?? null,
  };
}
let syncing: Promise<void> | undefined;
export function sync() {
  return (syncing ??= (async () => {
    const d = await db();
    // Purge coordinates even without connectivity or a usable auth session.
    await d.runAsync(
      "UPDATE samples SET payload='{}',status='review',reason='Older than 7 days; request a correction' WHERE captured<?",
      Date.now() - 7 * 86400000,
    );
    const {
      data: { session },
    } = await backend.auth.getSession();
    if (!session) return;
    // getUser verifies the token; no upload under a different user's session.
    const {
      data: { user },
      error,
    } = await backend.auth.getUser();
    if (error || !user) {
      await SecureStore.setItemAsync(
        "attendance-sync-warning",
        "Sign in and reconnect to upload saved attendance events.",
      );
      return;
    }
    const warning = await drainQueue({
      next: () =>
        d.getAllAsync(
          "SELECT id,payload,captured FROM samples WHERE owner=? AND status='queued' ORDER BY captured,id LIMIT 200",
          user.id,
        ),
      upload: (payload) => rpc("sample", payload),
      remove: (id) => d.runAsync("DELETE FROM samples WHERE id=? AND owner=?", id, user.id),
      review: (id, reason) =>
        d.runAsync(
          "UPDATE samples SET payload='{}',status='review',reason=? WHERE id=? AND owner=?",
          reason,
          id,
          user.id,
        ),
      pause: stopTracking,
      now: Date.now,
    });
    if (warning) await SecureStore.setItemAsync("attendance-sync-warning", warning);
    else await SecureStore.deleteItemAsync("attendance-sync-warning");
    // Minimise retention; keep a non-location indication for staff to request a correction.
    await d.runAsync(
      "UPDATE samples SET payload='{}',status='review',reason='Older than 7 days; request a correction' WHERE captured<?",
      Date.now() - 7 * 86400000,
    );
  })()
    .catch(async (error) => {
      await SecureStore.setItemAsync("attendance-sync-warning", RETRY_WARNING);
      throw error;
    })
    .finally(() => {
      syncing = undefined;
    }));
}
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) {
    await SecureStore.setItemAsync("attendance-tracking-warning", error.message);
    return;
  }
  const config = await currentConfig();
  if (!config || !data) return;
  // The persisted opt-in configuration identifies the queue owner while offline.
  // Uploads independently verify the current authenticated user. Sign-out deletes this config.
  const d = await db();
  for (const loc of data.locations) {
    if (loc.coords.accuracy === null) continue;
    const id = randomUUID();
    const payload = {
      id,
      device_id: config.device_id,
      site_id: config.site_id,
      boundary_version: config.boundary_version,
      captured_at: new Date(loc.timestamp).toISOString(),
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      mocked: loc.mocked ?? false,
    };
    await d.runAsync(
      "INSERT OR IGNORE INTO samples(id,owner,payload,captured) VALUES(?,?,?,?)",
      id,
      config.userId,
      JSON.stringify(payload),
      loc.timestamp,
    );
  }
  await sync().catch(async () => {
    await SecureStore.setItemAsync(
      "attendance-tracking-warning",
      "Events saved on phone; sync will retry when connected.",
    );
  });
});
export async function stopTracking() {
  await SecureStore.deleteItemAsync(CONFIG);
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
}
export async function startTracking(config: TrackingConfig) {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!isPrecise(foreground))
    throw new Error(
      "Allow precise location for Café 1 in phone settings before enabling attendance.",
    );
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("Turn on phone location services before enabling attendance.");
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!allowsBackground(background))
    throw new Error("Allow background / Always location in phone settings.");
  await SecureStore.deleteItemAsync("attendance-tracking-warning");
  await SecureStore.setItemAsync(CONFIG, JSON.stringify(config), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  try {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 30000,
      distanceInterval: 0,
      deferredUpdatesInterval: 30000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: "Café 1 attendance is on",
        notificationBody: "Detecting workplace arrival and departure. Open the app to pause.",
        killServiceOnDestroy: false,
      },
    });
  } catch (e) {
    await SecureStore.deleteItemAsync(CONFIG);
    throw e;
  }
}
