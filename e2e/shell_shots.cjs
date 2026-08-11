// Screenshots of the app shell, for looking at what a UI change actually did.
//
// Not an assertion suite — the other e2e scripts do that. This one exists
// because a stylesheet cannot be reviewed by reading it: the ribbon's overflow
// packing, the panel widths and the side-mounted arrangements are all decided by
// layout, which happy-dom does not implement, so the component tests are blind
// to every one of them.
//
// No sidecar needed. The shell renders with an empty document and a dead
// geometry socket; the status pill just says it cannot connect, which is itself
// worth seeing since it is the widest thing in the title bar.
//
// Usage (from the repo root, with vite on 5173):
//   node e2e/shell_shots.cjs [outDir]
//
// SC_CHROME picks the browser. Any Chromium build works — Brave and Edge are
// Chromium, and this needs no extension or profile.
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve(process.argv[2] || "shell_shots");
const URL = process.env.SC_URL || "http://localhost:5173/";
const EXE = process.env.SC_CHROME
  || "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";

/** Set a preference the way the app itself stores it, then reload so the
 *  module-level readers pick it up at import time (they read localStorage once). */
async function withPrefs(page, prefs) {
  await page.evaluate((p) => {
    for (const [k, v] of Object.entries(p)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  }, prefs);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#main", { timeout: 15000 });
  await page.waitForTimeout(600); // ribbon reflow + first viewport paint
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ["--use-angle=swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#main", { timeout: 20000 });
  // The welcome screen opens over the whole shell on a fresh profile, which is
  // exactly what we are here to look at. Turn it off the way its own checkbox
  // does, before the first shot.
  await page.evaluate(() => localStorage.setItem("sindri.welcomeOnStartup", "false"));

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`  ${name}.png`);
  };

  // Every arrangement layoutPrefs can produce, plus the two panels that changed.
  await withPrefs(page, { "sindricad.layout": null, "sindricad.browserFilter": null });
  await shot("01-default");

  await withPrefs(page, { "sindricad.layout": JSON.stringify({ ribbon: "left", history: "bottom" }) });
  await shot("02-ribbon-left");

  await withPrefs(page, { "sindricad.layout": JSON.stringify({ ribbon: "top", history: "right" }) });
  await shot("03-history-right");

  await withPrefs(page, { "sindricad.layout": JSON.stringify({ ribbon: "left", history: "right" }) });
  await shot("04-both-sides");

  await withPrefs(page, { "sindricad.layout": null });
  await page.evaluate(() => {
    document.querySelector("#browser-filter")?.focus();
  });
  await shot("05-browser-filter");

  // Preferences, opened the way a user does.
  await page.keyboard.press("Control+Comma");
  await page.waitForTimeout(400);
  await shot("06-preferences");
  await page.keyboard.press("Escape");

  await browser.close();
  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const e of [...new Set(errors)].slice(0, 12)) console.log(`  ${e}`);
  }
  console.log(`\nshots in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
