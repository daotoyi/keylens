import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const root = process.cwd();
const extensionPath = root;
const screenshotDir = path.join(root, "output", "screenshots");
const profileDir = await mkdtemp(path.join(os.tmpdir(), "keylens-profile-"));
const fixture = await readFile(path.join(root, "tests", "fixtures", "rich-page.html"), "utf8");
const chromePath =
  process.env.CHROME_PATH ||
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
  );

await mkdir(screenshotDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: chromePath,
  headless: false,
  viewport: { width: 1180, height: 920 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run"
  ]
});

try {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  }
  const extensionId = new URL(serviceWorker.url()).host;
  assert.ok(extensionId, "extension id should be available");
  await serviceWorker.evaluate(async () => {
    const stored = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({
      settings: { ...(stored.settings || {}), language: "zh-CN" }
    });
  });

  await context.route("https://fixture.keylens.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixture
    });
  });

  const fixturePage = await context.newPage();
  await fixturePage.setViewportSize({ width: 1280, height: 900 });
  await fixturePage.goto("https://fixture.keylens.test/report", {
    waitUntil: "domcontentloaded"
  });
  await fixturePage.waitForTimeout(500);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 402, height: 650 });
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await popup.waitForSelector(".app-shell");
  await popup.waitForFunction(() => document.querySelector("#planBadge")?.textContent === "FREE");
  await fixturePage.bringToFront();
  await popup.evaluate(() => document.querySelector("#refreshPageButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#pageHost")?.textContent?.includes("fixture.keylens.test")
  );
  assert.equal(await popup.locator(".profile-option").count(), 6);
  assert.equal(await popup.locator("#planBadge").textContent(), "FREE");
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-free.png"),
    fullPage: true
  });

  await popup.evaluate(() => document.querySelector("#languageButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#extractButtonLabel")?.textContent === "Extract key information"
  );
  assert.equal(
    await popup.locator('[data-profile="brief"] .profile-name').textContent(),
    "Page brief"
  );
  await popup.waitForTimeout(200);
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-free-en.png"),
    fullPage: true
  });
  await popup.evaluate(() => document.querySelector("#languageButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#extractButtonLabel")?.textContent === "提取关键内容"
  );

  await popup.evaluate(() => document.querySelector("#extractButton").click());
  await popup.waitForSelector("#resultPanel:not([hidden])", { timeout: 10000 });
  await popup.waitForFunction(
    () => document.querySelector("#quotaText")?.textContent?.includes("11/12")
  );
  await popup.waitForTimeout(2800);
  assert.match(await popup.locator("#resultTitle").textContent(), /B2B 内容增长年度报告/);
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-brief-free.png"),
    fullPage: true
  });

  await popup.evaluate(() => document.querySelector('[data-profile="article"]').click());
  await popup.waitForSelector("#upgradeDialog[open]");
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-upgrade.png"),
    fullPage: true
  });
  await popup.evaluate(() => document.querySelector("#dialogCloseButton").click());

  const options = await context.newPage();
  await options.setViewportSize({ width: 1180, height: 960 });
  await options.goto(`chrome-extension://${extensionId}/src/options.html`);
  await options.waitForSelector(".comparison");
  assert.equal(await options.locator(".comparison-row").count(), 10);
  assert.equal(await options.locator("#enabledToggle").isChecked(), true);
  await options.screenshot({
    path: path.join(screenshotDir, "options-free.png"),
    fullPage: true
  });

  await options.evaluate(() => document.querySelector("#languageButton").click());
  await options.waitForFunction(
    () => document.querySelector("#planTitle")?.textContent === "Your local extractor"
  );
  assert.equal(await options.locator("#languageSelect").inputValue(), "en");
  await options.screenshot({
    path: path.join(screenshotDir, "options-free-en.png"),
    fullPage: true
  });

  await options.locator("#licenseInput").fill("KEYLENS-PRO-DEMO");
  await options.locator("#activateButton").click();
  await options.waitForFunction(
    () => document.querySelector("#headerPlan")?.textContent === "PRO"
  );
  await options.screenshot({
    path: path.join(screenshotDir, "options-pro-en.png"),
    fullPage: true
  });
  await options.evaluate(() => document.querySelector("#languageButton").click());
  await options.waitForFunction(
    () => document.querySelector("#planTitle")?.textContent === "KeyLens Pro 已启用"
  );
  await options.screenshot({
    path: path.join(screenshotDir, "options-pro.png"),
    fullPage: true
  });

  const welcome = await context.newPage();
  await welcome.setViewportSize({ width: 1180, height: 920 });
  await welcome.goto(`chrome-extension://${extensionId}/src/welcome.html`);
  await welcome.waitForSelector(".welcome-hero");
  assert.equal(await welcome.locator(".step").count(), 3);
  await welcome.screenshot({
    path: path.join(screenshotDir, "welcome.png"),
    fullPage: true
  });
  await welcome.evaluate(() => document.querySelector("#languageButton").click());
  await welcome.waitForFunction(
    () => document.querySelector(".intro h1 .headline-accent")?.textContent === "just the keys."
  );
  await welcome.screenshot({
    path: path.join(screenshotDir, "welcome-en.png"),
    fullPage: true
  });
  await welcome.evaluate(() => document.querySelector("#languageButton").click());
  await welcome.waitForFunction(
    () => document.querySelector(".intro h1 .headline-accent")?.textContent === "只取关键。"
  );

  await fixturePage.bringToFront();
  await popup.reload();
  await fixturePage.bringToFront();
  await popup.evaluate(() => document.querySelector("#refreshPageButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#pageHost")?.textContent?.includes("fixture.keylens.test")
  );
  await popup.evaluate(() => document.querySelector('[data-profile="article"]').click());
  await popup.evaluate(() => document.querySelector("#extractButton").click());
  await popup.waitForSelector("#resultPanel:not([hidden])", { timeout: 10000 });
  await popup.waitForFunction(
    () => document.querySelector("#resultTitle")?.textContent?.includes("B2B 内容增长年度报告")
  );
  await popup.waitForTimeout(2800);
  assert.equal(await popup.locator("#planBadge").textContent(), "PRO");
  assert.equal(await popup.locator("#jsonButton").evaluate((node) => node.classList.contains("is-locked")), false);
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-article-pro.png"),
    fullPage: true
  });
  await popup.evaluate(() => document.querySelector("#languageButton").click());
  await popup.waitForFunction(() =>
    [...document.querySelectorAll(".field-label")].some(
      (node) => node.textContent === "Author / publisher"
    )
  );
  assert.equal(await popup.locator("#resultEyebrow").textContent(), "Article");
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-article-pro-en.png"),
    fullPage: true
  });
  await popup.evaluate(() => document.querySelector("#languageButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#resultEyebrow")?.textContent === "文章结构"
  );

  const secondFixturePage = await context.newPage();
  await secondFixturePage.goto("https://fixture.keylens.test/report?second=1", {
    waitUntil: "domcontentloaded"
  });
  await secondFixturePage.waitForTimeout(400);
  await secondFixturePage.bringToFront();
  await popup.evaluate(() => document.querySelector("#batchButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#resultTitle")?.textContent?.includes("批量汇总"),
    { timeout: 15000 }
  );
  await popup.waitForTimeout(2800);
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-batch-pro.png"),
    fullPage: true
  });

  const listPage = await context.newPage();
  await listPage.goto("https://fixture.keylens.test/report?list=1", {
    waitUntil: "domcontentloaded"
  });
  await listPage.bringToFront();
  await popup.evaluate(() => document.querySelector("#refreshPageButton").click());
  await popup.evaluate(() => document.querySelector('[data-profile="list"]').click());
  await popup.evaluate(() => document.querySelector("#extractButton").click());
  await popup.waitForFunction(
    () => document.querySelector("#rowCountBadge")?.textContent === "3",
    { timeout: 10000 }
  );
  await popup.waitForTimeout(2800);
  await popup.evaluate(() => document.querySelector('[data-view="rows"]').click());
  await popup.screenshot({
    path: path.join(screenshotDir, "popup-list-pro.png"),
    fullPage: true
  });

  console.log(
    JSON.stringify(
      {
        extensionId,
        screenshots: [
          "output/screenshots/popup-free.png",
          "output/screenshots/popup-free-en.png",
          "output/screenshots/popup-brief-free.png",
          "output/screenshots/popup-upgrade.png",
          "output/screenshots/options-free.png",
          "output/screenshots/options-free-en.png",
          "output/screenshots/options-pro.png",
          "output/screenshots/options-pro-en.png",
          "output/screenshots/welcome.png",
          "output/screenshots/welcome-en.png",
          "output/screenshots/popup-article-pro.png",
          "output/screenshots/popup-article-pro-en.png",
          "output/screenshots/popup-batch-pro.png",
          "output/screenshots/popup-list-pro.png"
        ]
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await rm(profileDir, { recursive: true, force: true });
}
