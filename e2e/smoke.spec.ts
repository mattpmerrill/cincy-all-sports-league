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
