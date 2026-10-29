import { useEffect, useState } from "react";
import {
  Alert,
  AppState,
  Button,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { backend, rpc } from "./backend";
import {
  currentConfig,
  trackingStatus,
  queueCount,
  startTracking,
  stopTracking,
  sync,
} from "./tracking";
import type { Session } from "@supabase/supabase-js";
const DEFAULT_SITE = "cafe1000-0000-4000-8000-000000000001";
type Snapshot = {
  config: { enabled: boolean; version: string } | null;
  devices: { id: string; approved: boolean }[];
  entries: {
    id: string;
    staff_id: string;
    clocked_in_at: string;
    clocked_out_at: string | null;
    paid_minutes: number | null;
    approved_pay_cents: number | null;
  }[];
};
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [siteId, setSiteId] = useState(DEFAULT_SITE);
  const [data, setData] = useState<Snapshot | null>(null);
  const [queued, setQueued] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Sign in with your own Café 1 staff account.");
  useEffect(() => {
    void backend.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setData(null);
        void stopTracking();
        setTracking(false);
      }
    });
    void SecureStore.getItemAsync("attendance-device-id").then(async (id) => {
      if (!id) {
        id = randomUUID();
        await SecureStore.setItemAsync("attendance-device-id", id);
      }
      setDeviceId(id);
    });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active")
        void sync().catch(() => setStatus("Offline — events remain on this phone."));
    });
    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);
  async function refresh() {
    await sync();
    setQueued(await queueCount());
    const health = await trackingStatus();
    setTracking(health.running);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const snapshot = await rpc("dashboard", { site_id: siteId, from, to });
    setData(snapshot);
    setStatus(
      health.warning ?? "Records refreshed. A stale last-sync time in the dashboard needs review.",
    );
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : String((e as { message?: string }).message ?? e);
      setStatus(message);
      Alert.alert("Café 1", message);
    } finally {
      setBusy(false);
    }
  }
  const own = data?.entries.filter((e) => e.staff_id === session?.user.id) ?? [];
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Café 1 Staff</Text>
      <Text>Hours, pay and automatic attendance</Text>
      <Text accessibilityLiveRegion="polite" style={styles.notice}>
        {status}
      </Text>
      {!session ? (
        <View style={styles.card}>
          <Text>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Text>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            disabled={busy}
            title="Sign in securely"
            onPress={() =>
              run(async () => {
                const { error } = await backend.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                setPassword("");
                if (error) throw error;
                setStatus("Signed in. Refresh records to check your device approval.");
              })
            }
          />
        </View>
      ) : (
        <>
          <Text>Signed in: {session.user.email}</Text>
          <Text>Site ID (your manager supplies this)</Text>
          <TextInput
            editable={!tracking}
            style={styles.input}
            value={siteId}
            onChangeText={setSiteId}
          />
          <Button
            disabled={busy}
            title="Refresh & sync captured events"
            onPress={() => run(refresh)}
          />
          <View style={styles.card}>
            <Text style={styles.heading}>1. Register this phone</Text>
            <Text>
              Location is used while attendance tracking is on, including in the background.
              Temporary offline location samples are encrypted on this phone and removed after
              upload; the server keeps classifications and attendance evidence, not a travel map.
              You can pause tracking. Missing events need a manager correction.
            </Text>
            <View style={styles.row}>
              <Switch value={consent} onValueChange={setConsent} />
              <Text style={{ flex: 1 }}>
                I have read this and want to enable attendance tracking on my phone.
              </Text>
            </View>
            <Button
              disabled={busy || !consent || !deviceId}
              title="Request manager approval"
              onPress={() =>
                run(async () => {
                  await rpc("register", {
                    site_id: siteId,
                    device_id: deviceId,
                    consent: true,
                    label: session.user.email + " phone",
                  });
                  await refresh();
                })
              }
            />
            <Text>Device: {deviceId}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>2. Automatic clocking</Text>
            <Text>
              Whole building outline + 5m. Confirm arrival for 60 seconds, departure for 3 minutes.
              Weak GPS keeps your current shift unchanged. Force-closing the app, restarting the
              phone, or removing permissions may stop tracking; reopen and check it.
            </Text>
            <Text>Status: {tracking ? "Background tracking requested" : "Stopped"}</Text>
            <Text>Stored events awaiting sync/review: {queued}</Text>
            <Button
              disabled={
                busy ||
                !consent ||
                !data?.config?.enabled ||
                !data.devices.some((d) => d.id === deviceId && d.approved)
              }
              title="Enable background attendance"
              onPress={() =>
                run(async () => {
                  const latest: Snapshot = await rpc("dashboard", {
                    site_id: siteId,
                    from: new Date().toISOString().slice(0, 10),
                    to: new Date().toISOString().slice(0, 10),
                  });
                  if (
                    !latest.config?.enabled ||
                    !latest.devices.some((d) => d.id === deviceId && d.approved)
                  )
                    throw new Error(
                      "Manager must approve this phone and verify the boundary first.",
                    );
                  await startTracking({
                    userId: session.user.id,
                    site_id: siteId,
                    device_id: deviceId,
                    boundary_version: latest.config.version,
                  });
                  setTracking(true);
                  setStatus(
                    "Tracking requested. Complete the on-site arrival and departure test with your manager.",
                  );
                })
              }
            />
            <Button
              disabled={busy}
              title="Pause location tracking"
              onPress={() =>
                run(async () => {
                  await stopTracking();
                  setTracking(false);
                  setStatus(
                    "Tracking paused. This does not clock you out. Ask your manager to correct any missing time.",
                  );
                })
              }
            />
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>3. My last 31 days</Text>
            <Text>
              Recorded hours: {(own.reduce((s, e) => s + (e.paid_minutes ?? 0), 0) / 60).toFixed(2)}
            </Text>
            <Text>
              Approved gross pay: £
              {(own.reduce((s, e) => s + (e.approved_pay_cents ?? 0), 0) / 100).toFixed(2)}
            </Text>
            {own.slice(0, 20).map((e) => (
              <Text key={e.id}>
                {new Date(e.clocked_in_at).toLocaleString()} →{" "}
                {e.clocked_out_at ? new Date(e.clocked_out_at).toLocaleString() : "Open"}
              </Text>
            ))}
            <Button
              title="Open full hours & pay dashboard"
              onPress={() => Linking.openURL("https://cafe1stalbans.co.uk/staff-hours")}
            />
          </View>
          <Button
            disabled={busy}
            title="Stop tracking and sign out"
            onPress={() =>
              run(async () => {
                await stopTracking();
                await sync();
                await backend.auth.signOut();
                setTracking(false);
              })
            }
          />
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 64, gap: 16, backgroundColor: "#f8f5ee" },
  title: { fontSize: 32, fontWeight: "700", color: "#213d32" },
  heading: { fontSize: 20, fontWeight: "700" },
  notice: { padding: 12, backgroundColor: "#e8eee9" },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#d2d9d0",
    borderRadius: 16,
    gap: 12,
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#aab5ac",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
