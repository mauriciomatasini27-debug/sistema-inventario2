import { expect, test } from "@playwright/test";

test("NAV-S1: al enfocar un enlace del panel Astro prefetchea la página", async ({ page }) => {
  await page.goto("/panel");
  await page.locator('a[href="/panel/stock"]:visible').first().hover();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('link[rel="prefetch"]')).some((l) =>
            l.getAttribute("href")?.includes("/panel/stock"),
          ),
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
});

test("NAV-S1: la navegación cross-document dispara una View Transition", async ({ page }) => {
  await page.addInitScript(() => {
    addEventListener("pagereveal", (event) => {
      const vt = (event as Event & { viewTransition?: unknown }).viewTransition;
      sessionStorage.setItem("__vt-nav", vt ? "1" : "0");
    });
  });
  await page.goto("/panel");
  await Promise.all([
    page.waitForURL("**/panel/stock"),
    page.locator('a[href="/panel/stock"]:visible').first().click(),
  ]);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("__vt-nav"))).toBe("1");
});

test.describe("NAV-S1 sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("la navegación del panel sigue funcionando como MPA", async ({ page }) => {
    await page.goto("/panel");
    await Promise.all([
      page.waitForURL("**/panel/stock"),
      page.locator('a[href="/panel/stock"]:visible').first().click(),
    ]);
    await expect(page.locator("h1").first()).toContainText("Stock");
  });
});
