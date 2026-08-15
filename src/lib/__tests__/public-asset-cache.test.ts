import { describe, expect, it } from "vitest";
import {
  createMutablePublicAssetRouteRules,
  MUTABLE_PUBLIC_ASSET_HEADERS,
} from "../public-asset-cache";

describe("mutable public asset caching", () => {
  it("forces the service worker and manifest to revalidate", () => {
    const rules = createMutablePublicAssetRouteRules();

    expect(Object.keys(rules)).toEqual(["/sw.js", "/manifest.webmanifest"]);
    expect(rules["/sw.js"].headers).toEqual(MUTABLE_PUBLIC_ASSET_HEADERS);
    expect(rules["/manifest.webmanifest"].headers).toEqual(MUTABLE_PUBLIC_ASSET_HEADERS);
    expect(MUTABLE_PUBLIC_ASSET_HEADERS["Cache-Control"]).toContain("must-revalidate");
  });
});
