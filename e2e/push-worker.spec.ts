import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The push worker in a real browser. It needs no VAPID keys, no sign-in and no push service: the
// browser's own DevTools protocol hands the worker a push message, exactly as a push service
// would after decryption. Chromium only (CDP), which is the only project in playwright.config.ts.

// Playwright's default headless build (chromium_headless_shell) ignores the notification grant
// (Notification.permission stays "denied"), so showNotification is refused there. Full Chromium
// in its new headless mode honors it and keeps the notifications, so this file asks for that
// build. It is still headless: no display is needed. It must sit at the top level of the file.
test.use({ channel: "chromium" });

const FALLBACK_TITLE = "Cincy's All-Sports League";

const message = {
  v: 1,
  title: "Papie wants to trade with you",
  body: "Papie offered the Chiefs for your Bears.",
  url: "/trades/lst-1",
  tag: "e2e-valid",
  renotify: false,
};

/** Registers the worker the way the app will and returns a function that pushes data into it. */
async function registerWorker(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  const registrationIds: string[] = [];
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
    for (const r of registrations) registrationIds.push(r.registrationId);
  });
  await cdp.send("ServiceWorker.enable");

  await page.goto("/rules");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => registrationIds.length).toBeGreaterThan(0);

  const origin = new URL(page.url()).origin;
  return async (data: string) => {
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin,
      registrationId: registrationIds[registrationIds.length - 1],
      data,
    });
  };
}

/** Titles of the notifications the browser is showing for a tag. */
const shownWithTag = (page: Page, tag: string) =>
  page.evaluate(async (t) => {
    const registration = await navigator.serviceWorker.ready;
    const shown = await registration.getNotifications({ tag: t });
    return shown.map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      url: (n.data as { url?: string } | null)?.url,
      lang: n.lang,
    }));
  }, tag);

test.describe("service worker file", () => {
  test("is served fresh, as JavaScript, with a locked-down CSP", async ({ page }) => {
    const response = await page.request.get("/sw.js");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-type"]).toBe("application/javascript; charset=utf-8");
    expect(headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(headers["content-security-policy"]).toBe("default-src 'self'; script-src 'self'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    // The proxy skips it, so a visit never sets a session cookie on the worker script.
    expect(headers["set-cookie"]).toBeUndefined();
  });

  test("the badge is a PNG and the proxy sets no cookie on it", async ({ page }) => {
    const response = await page.request.get("/push-badge");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("push handler", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["notifications"]);
  });

  test("shows a valid message exactly as sent", async ({ context, page }) => {
    const deliver = await registerWorker(context, page);
    await deliver(JSON.stringify(message));
    await expect
      .poll(() => shownWithTag(page, message.tag))
      .toEqual([
        {
          title: message.title,
          body: message.body,
          tag: message.tag,
          url: message.url,
          lang: "en",
        },
      ]);
  });

  test("shows the fallback for a payload it does not accept", async ({ context, page }) => {
    const deliver = await registerWorker(context, page);
    // Wrong version and an off-site url: the worker must still show something, never stay silent.
    await deliver(JSON.stringify({ ...message, v: 2, url: "//evil.example", tag: "e2e-bad" }));
    await expect
      .poll(() => shownWithTag(page, "alert"))
      .toEqual([
        {
          title: FALLBACK_TITLE,
          body: "Something new in the league.",
          tag: "alert",
          url: "/",
          lang: "en",
        },
      ]);
    expect(await shownWithTag(page, "e2e-bad")).toEqual([]);
  });

  test("shows the fallback when the push is not JSON", async ({ context, page }) => {
    const deliver = await registerWorker(context, page);
    await deliver("this is not json");
    await expect.poll(async () => (await shownWithTag(page, "alert")).length).toBe(1);
    expect((await shownWithTag(page, "alert"))[0]?.title).toBe(FALLBACK_TITLE);
  });
});
