import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
// Tokens stay in OS secure storage, never in the event queue or logs.
export const backend = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://hviprglhhlwgsitdfvxp.supabase.co",
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: {
        getItem: SecureStore.getItemAsync,
        setItem: (key, value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          }),
        removeItem: SecureStore.deleteItemAsync,
      },
    },
  },
);
export async function rpc(action: string, data: Record<string, unknown>) {
  const { data: result, error } = await backend.rpc("cafe1_attendance", {
    _action: action,
    _data: data,
  });
  if (error) throw error;
  return result;
}
