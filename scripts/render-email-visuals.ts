/**
 * Renders the images for the Home Screen announcement email into public/email/.
 *
 *   pnpm email:visuals                          uses https://www.cincysports.xyz
 *   pnpm email:visuals http://localhost:3000    another site (for example a local run)
 *
 * The phone screens are drawn in scripts/email-visuals/home-screen.html. Two pieces come from
 * the live site so the pictures match the real app: the app icon, and a phone-sized screenshot
 * of the home page with everything that shows members' names and photos hidden. Those images
 * are hosted publicly, so no member data may end up in them.
 */
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { z } from "zod";

const site = z
  .url()
  .parse(process.argv[2] ?? "https://www.cincysports.xyz")
  .replace(/\/+$/, "");
const outDir = path.resolve("public/email");
const template = path.resolve("scripts/email-visuals/home-screen.html");

/** Panel id in the HTML, and the file it becomes. */
const PANELS = [
  "hero",
  "ios-1",
  "ios-2",
  "ios-3",
  "ios-4",
  "ios-5",
  "android-1",
  "android-2",
  "android-3",
] as const;

/** Hides the trash-talk card and the standings list: the two places member content lives. */
async function captureAppScreen(page: Page, to: string) {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(site, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const hidden = await page.evaluate(() => {
    const targets = [
      document.querySelector("section:has(#latest-trash-talk)"),
      ...document.querySelectorAll("main ol"),
    ].filter((el): el is Element => el !== null);
    for (const el of targets) (el as HTMLElement).style.display = "none";
    return targets.length;
  });
  // Fail loudly if the page changed shape: a silent miss would publish member names.
  if (hidden !== 2) throw new Error(`Expected to hide 2 member sections, hid ${hidden}.`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: to });
}

async function main() {
  const work = await mkdtemp(path.join(tmpdir(), "email-visuals-"));
  const browser = await chromium.launch();
  try {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 640 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await captureAppScreen(await phone.newPage(), path.join(work, "app-screen.png"));

    const icon = await fetch(`${site}/apple-icon`);
    if (!icon.ok) throw new Error(`App icon returned ${icon.status}`);
    await writeFile(path.join(work, "app-icon.png"), Buffer.from(await icon.arrayBuffer()));
    await copyFile(template, path.join(work, "home-screen.html"));

    const canvas = await browser.newContext({
      viewport: { width: 640, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await canvas.newPage();
    await page.goto(`file://${path.join(work, "home-screen.html")}`);
    await page.evaluate(() => document.fonts.ready);

    await mkdir(outDir, { recursive: true });
    for (const id of PANELS) {
      const file = path.join(outDir, `home-screen-${id}.png`);
      await page.locator(`#${id}`).screenshot({ path: file });
      console.log(`wrote ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
