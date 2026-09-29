import { expect, test } from "@playwright/test";

// Runs against E2E_BASE_URL (default http://localhost:3000). The league data must be seeded; for a
// local database load supabase/dev-results.sql first.

test("leaderboard renders all 20 teams", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("All-Sports League");
  await expect(page.getByRole("list", { name: "Standings" }).getByRole("listitem")).toHaveCount(20);
});

test("a team page shows its 11 picks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("list", { name: "Standings" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/teams\//);
  await expect(page.getByRole("region", { name: "Picks" }).getByRole("article")).toHaveCount(11);
});

test("a sport page ranks 20 picks", async ({ page }) => {
  await page.goto("/sports/nfl");
  await expect(
    page.getByRole("list", { name: /NFL picks, ranked/ }).getByRole("listitem"),
  ).toHaveCount(20);
});

test("rules page lists the scoring tables", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.getByRole("heading", { level: 1, name: "Rules" })).toBeVisible();
  await expect(page.getByText("Super Bowl champion")).toBeVisible();
});

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("unknown team and sport show a not-found page", async ({ page }) => {
  // With streaming the status is already 200, so assert on the page itself.
  await page.goto("/teams/nobody");
  await expect(page.getByRole("heading", { name: "Team not found" })).toBeVisible();
  await page.goto("/sports/curling");
  await expect(page.getByRole("heading", { name: "Sport not found" })).toBeVisible();
});

test("trades page shows the trading block to signed-out visitors", async ({ page }) => {
  await page.goto("/trades");
  await expect(page.getByRole("heading", { level: 1, name: "Trades" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trading block" })).toBeVisible();
});

test("new trade sends signed-out visitors to log in", async ({ page }) => {
  await page.goto("/trades/new");
  await expect(page).toHaveURL(/\/login\?next=%2Ftrades%2Fnew/);
});

test("free agents page shows the sport picker and marks the Trades tab current", async ({
  page,
}) => {
  await page.goto("/free-agents");
  await expect(page.getByRole("heading", { level: 1, name: "Free agents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pick a sport" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^MLB/ })).toHaveAttribute(
    "href",
    "/free-agents/mlb",
  );
  // The Trades tab covers both landing pages; the switch marks which one this is.
  await expect(
    page.getByRole("navigation", { name: "Trades or free agents" }).getByRole("link", {
      name: "Free agents",
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator('a[href="/trades"][aria-current="page"]').first()).toBeAttached();
});

test("a sport's free agents page renders without Add buttons for a visitor", async ({ page }) => {
  await page.goto("/free-agents/mlb");
  await expect(page.getByRole("heading", { level: 1, name: "MLB free agents" })).toBeVisible();
  // Structure only, so it holds whether or not the pool has been loaded: the search box and the
  // count are there either way (an empty pool reads "Every MLB team is taken.").
  await expect(page.getByLabel("Search MLB free agents")).toBeVisible();
  await expect(page.getByText(/^\d+ free agents?$|^Every MLB team is taken\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Add / })).toHaveCount(0);
});

test("an unknown sport on free agents shows a not-found page", async ({ page }) => {
  await page.goto("/free-agents/xyz");
  await expect(page.getByRole("heading", { name: "Sport not found" })).toBeVisible();
});
