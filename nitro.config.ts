import { defineConfig } from "nitro/config";

import { createPrivateRouteRules } from "./src/lib/private-cache";
import { createMutablePublicAssetRouteRules } from "./src/lib/public-asset-cache";

// Apply no-store at Nitro/Cloudflare route level as well as in src/server.ts.
// This protects sensitive SSR responses if a deployment adapter normalises
// application response headers at the edge.
export default defineConfig({
  routeRules: {
    ...createPrivateRouteRules(),
    ...createMutablePublicAssetRouteRules(),
  },
});
