import { expect, test, type Page } from "@playwright/test";

async function openHealthy(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `${path} did not return a document response`).not.toBeNull();
  expect(response!.status(), `${path} returned a server error`).toBeLessThan(500);
}

test.beforeEach(async ({ page }) => {
  await page.route("https://e2e.invalid/**", (route) => route.abort());
});

test("homepage exposes the public ordering entry point and confirmed address", async ({ page }) => {
  await openHealthy(page, "/");

  await expect(page).toHaveTitle(/Caf[eé]/i);
  await expect(page).toHaveTitle(/St Albans/i);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("One Great Menu");
  await expect(page.getByText("AL1 3JU", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /order now/i })).toHaveAttribute("href", "/menu");
});

test("menu and empty basket remain usable without a signed-in session", async ({ page }) => {
  await openHealthy(page, "/menu");
  await expect(page.getByRole("heading", { name: "Menu", level: 1 })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /search/i })).toBeVisible();

  await openHealthy(page, "/cart");
  await expect(page.getByRole("heading", { name: /your basket/i, level: 1 })).toBeVisible();
  await expect(page.getByText(/basket is empty/i)).toBeVisible();
});

test.describe("public legal information", () => {
  for (const [name, path, heading] of [
    ["privacy", "/privacy", /privacy/i],
    ["terms", "/terms", /terms/i],
    ["complaints", "/complaints", /complaints/i],
  ] as const) {
    test(`${name} page is publicly reachable`, async ({ page }) => {
      await openHealthy(page, path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    });
  }
});

test("manager security route cannot expose its dashboard anonymously", async ({ page }) => {
  await openHealthy(page, "/admin/security");

  await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: /cafe1 admin sign in/i, level: 1 })).toBeVisible();
  await expect(page.getByLabel(/admin email/i)).toBeVisible();
  await expect(page.getByText(/immutable audit trail/i)).toHaveCount(0);
});

test("critical public pages do not overflow the viewport", async ({ page }) => {
  for (const path of ["/", "/menu", "/cart"] as const) {
    await openHealthy(page, path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${path} has horizontal overflow`).toBeLessThanOrEqual(
      dimensions.viewport + 1,
    );
  }
});

test("social consent opens the canonical TikTok creator feed", async ({ page }) => {
  await openHealthy(page, "/socials");

  const placeholder = page.getByRole("button", { name: /allow and show tiktok/i }).first();
  await expect(placeholder).toBeVisible();
  await placeholder.click();

  const banner = page.getByRole("dialog", { name: /cookie preferences/i });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: /accept all/i }).click();
  await expect(banner).toBeHidden();

  const feed = page.locator("blockquote.tiktok-embed").first();
  await expect(feed).toHaveAttribute("data-unique-id", "cafe1_stalbans");
  await expect(feed).toHaveAttribute("data-embed-type", "creator");
});
