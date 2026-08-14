import { expect, test, type Page } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function installStaffSession(page: Page) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const accessToken = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({
    sub: USER_ID,
    email: "staff@e2e.invalid",
    role: "authenticated",
    aud: "authenticated",
    exp: expiresAt,
  })}.e2e`;
  await page.addInitScript(
    ({ accessToken: token, expiresAt: expiry, userId }) => {
      localStorage.setItem(
        "sb-e2e-auth-token",
        JSON.stringify({
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: expiry,
          refresh_token: "e2e-refresh-token",
          user: {
            id: userId,
            aud: "authenticated",
            role: "authenticated",
            email: "staff@e2e.invalid",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      );
    },
    { accessToken, expiresAt, userId: USER_ID },
  );
  await page.route("https://e2e.invalid/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/user_roles")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify([{ role: "staff" }]),
      });
      return;
    }
    if (url.includes("/rest/v1/menu_categories") || url.includes("/rest/v1/menu_modifiers")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "*/0" },
        body: "[]",
      });
      return;
    }
    await route.abort();
  });
}

async function openTill(page: Page) {
  await installStaffSession(page);
  const response = await page.goto("/till", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('[data-pos-region="header"]')).toBeVisible();
  const shiftDialog = page.getByRole("dialog", { name: /open till shift/i });
  await expect(shiftDialog).toBeVisible();
  await shiftDialog.getByRole("button", { name: "Close" }).click();
  await expect(shiftDialog).toBeHidden();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

function expectedProductColumns(width: number) {
  if (width < 390) return 3;
  if (width < 560) return 4;
  if (width < 800) return 5;
  if (width < 960) return 6;
  if (width < 1536) return 4;
  return 5;
}

async function expectProductColumns(page: Page, width: number) {
  const columns = await page
    .locator('[data-pos-region="product-grid"]')
    .evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
  expect(columns).toBe(expectedProductColumns(width));
}

for (const viewport of [
  { width: 320, height: 700 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
]) {
  test(`phone till aligns catalogue and order at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTill(page);
    await expectNoHorizontalOverflow(page);
    await expectProductColumns(page, viewport.width);

    const header = page.locator('[data-pos-region="header"]');
    const fulfilment = page.locator('[data-pos-region="mobile-fulfilment"]');
    const bar = page.locator('[data-pos-region="mobile-order-bar"]');
    await expect(fulfilment).toBeVisible();
    await expect(fulfilment.getByRole("button", { name: "Dine in" })).toBeVisible();
    await expect(fulfilment.getByRole("button", { name: "Takeaway" })).toBeVisible();
    const fulfilmentBox = await fulfilment.boundingBox();
    expect(fulfilmentBox?.x).toBeGreaterThanOrEqual(0);
    expect((fulfilmentBox?.x ?? 0) + (fulfilmentBox?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    await fulfilment.getByRole("button", { name: "Dine in" }).click();
    await expect(fulfilment.getByRole("button", { name: "Dine in" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("View order");
    await expect(bar).toContainText("Dine in");
    const [headerBox, barBox] = await Promise.all([header.boundingBox(), bar.boundingBox()]);
    expect(headerBox?.x).toBeGreaterThanOrEqual(0);
    expect((headerBox?.x ?? 0) + (headerBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    expect(barBox?.x).toBeGreaterThanOrEqual(0);
    expect((barBox?.x ?? 0) + (barBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);

    await bar.click();
    const order = page.locator('[data-pos-region="order"]');
    await expect(order).toBeVisible();
    const backToMenu = order.locator('[data-pos-action="back-to-menu"]');
    await expect(backToMenu).toBeVisible();
    await expect(backToMenu).toHaveAccessibleName("Back to menu");
    const orderFulfilment = order.locator('[data-pos-region="order-fulfilment"]');
    await expect(orderFulfilment.getByRole("button", { name: "Dine in" })).toBeVisible();
    await expect(orderFulfilment.getByRole("button", { name: "Takeaway" })).toBeVisible();
    const orderFulfilmentBox = await orderFulfilment.boundingBox();
    expect(orderFulfilmentBox?.x).toBeGreaterThanOrEqual(0);
    expect((orderFulfilmentBox?.x ?? 0) + (orderFulfilmentBox?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    const orderBox = await order.boundingBox();
    if (viewport.width < 640) {
      expect(orderBox?.x).toBe(0);
      expect(orderBox?.width).toBe(viewport.width);
    } else {
      expect(orderBox?.width).toBeLessThanOrEqual(480);
      expect((orderBox?.x ?? 0) + (orderBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    }
    const layers = await page.evaluate(() => ({
      order: Number.parseInt(
        getComputedStyle(document.querySelector<HTMLElement>('[data-pos-region="order"]')!).zIndex,
        10,
      ),
      header: Number.parseInt(
        getComputedStyle(document.querySelector<HTMLElement>('[data-pos-region="header"]')!).zIndex,
        10,
      ),
    }));
    expect(layers.order).toBeGreaterThan(layers.header);
    await backToMenu.click();
    await expect(order).toBeHidden();
    await expect(page.locator('[data-pos-region="catalogue"]')).toBeVisible();
    await expect(bar).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

for (const viewport of [
  { width: 700, height: 1024 },
  { width: 768, height: 1024 },
  { width: 834, height: 1112 },
]) {
  test(`portrait tablet uses the aligned checkout sheet at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openTill(page);
    await expectProductColumns(page, viewport.width);
    const catalogue = page.locator('[data-pos-region="catalogue"]');
    const order = page.locator('[data-pos-region="order"]');
    const bar = page.locator('[data-pos-region="mobile-order-bar"]');
    await expect(catalogue).toBeVisible();
    await expect(order).toBeHidden();
    await expect(bar).toBeVisible();
    expect((await catalogue.boundingBox())?.width).toBeGreaterThan(viewport.width - 2);

    await bar.click();
    await expect(order).toBeVisible();
    const orderBox = await order.boundingBox();
    expect(orderBox?.width).toBeLessThanOrEqual(480);
    expect(orderBox?.width).toBeGreaterThanOrEqual(478);
    expect((orderBox?.x ?? 0) + (orderBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    await expectNoHorizontalOverflow(page);
  });
}

test("landscape tablet keeps the efficient catalogue and checkout split", async ({ page }) => {
  const viewport = { width: 1024, height: 768 };
  await page.setViewportSize(viewport);
  await openTill(page);
  await expectProductColumns(page, viewport.width);
  const catalogue = page.locator('[data-pos-region="catalogue"]');
  const order = page.locator('[data-pos-region="order"]');
  await expect(catalogue).toBeVisible();
  await expect(order).toBeVisible();
  await expect(page.locator('[data-pos-region="mobile-order-bar"]')).toBeHidden();
  const [catalogueBox, orderBox] = await Promise.all([
    catalogue.boundingBox(),
    order.boundingBox(),
  ]);
  expect(catalogueBox?.width).toBeGreaterThan(680);
  expect(orderBox?.width).toBeGreaterThanOrEqual(338);
  expect((catalogueBox?.width ?? 0) + (orderBox?.width ?? 0)).toBeLessThanOrEqual(
    viewport.width + 1,
  );
  await expectNoHorizontalOverflow(page);
});

test("till action menu stays above the product grid on a phone", async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await page.setViewportSize(viewport);
  await openTill(page);

  await page
    .getByRole("button", { name: "Till menu" })
    .evaluate((button: HTMLButtonElement) => button.click());
  const menu = page.locator('[data-pos-region="till-menu"]');
  await expect(menu).toBeVisible();

  const layers = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-pos-region="header"]');
    const workspace = document.querySelector<HTMLElement>('[data-pos-region="workspace"]');
    const layer = (element: HTMLElement) => {
      const value = getComputedStyle(element).zIndex;
      return value === "auto" ? 0 : Number.parseInt(value, 10);
    };
    return {
      header: layer(header!),
      workspace: layer(workspace!),
    };
  });
  expect(layers.header).toBeGreaterThan(layers.workspace);

  const menuBox = await menu.boundingBox();
  expect(menuBox?.x).toBeGreaterThanOrEqual(0);
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
  await expectNoHorizontalOverflow(page);
});
