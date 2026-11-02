import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright-core";

const root = process.cwd();
const corePath = path.join(root, "src", "core.js");
const i18nPath = path.join(root, "src", "i18n.js");
const fixturePath = path.join(root, "tests", "fixtures", "rich-page.html");

function chromePath() {
  return (
    process.env.CHROME_PATH ||
    path.join(
      os.homedir(),
      "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    )
  );
}

async function openFixturePage() {
  const browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true
  });
  const page = await browser.newPage();
  await page.setContent(await readFile(fixturePath, "utf8"));
  await page.addScriptTag({ path: corePath });
  return { browser, page };
}

test("text helpers produce stable summaries, key points, prices and dates", async () => {
  const { browser, page } = await openFixturePage();
  try {
    const values = await page.evaluate(() => {
      const text =
        "第一段说明研究发现，高质量案例带来更高的线索转化。第二段给出具体数字，转化率提升了 38%。第三段总结购买委员会真正关心的是实施证据。";
      return {
        summary: KeyLensCore.buildSummary(text, 120),
        points: KeyLensCore.selectKeyPoints(text, 3),
        price: KeyLensCore.extractPrice("US$ 1,299.00"),
        date: KeyLensCore.extractDate("发布于 2026-10-18")
      };
    });
    assert.match(values.summary, /高质量案例/);
    assert.ok(values.points.length >= 2);
    assert.equal(values.price.currency, "USD");
    assert.equal(values.price.value, "US$ 1,299.00");
    assert.equal(values.date, "2026-10-18");

    await page.addScriptTag({ path: i18nPath });
    const english = await page.evaluate(() => {
      KeyLensI18n.setLanguage("en");
      return KeyLensCore.extract(document, { profile: "brief" });
    });
    assert.equal(english.profileLabel, "Page brief");
    assert.equal(english.fields.find((field) => field.key === "title").label, "Page title");
  } finally {
    await browser.close();
  }
});

test("brief and contacts extraction use visible metadata and entity fields", async () => {
  const { browser, page } = await openFixturePage();
  try {
    const result = await page.evaluate(() => ({
      brief: KeyLensCore.extract(document, { profile: "brief" }),
      contacts: KeyLensCore.extract(document, { profile: "contacts" })
    }));
    assert.equal(result.brief.title, "B2B 内容增长年度报告");
    assert.match(result.brief.summary, /240 个 B2B 品牌/);
    assert.ok(result.brief.keyPoints.length >= 2);
    assert.ok(result.brief.stats.filled >= 6);

    const emailField = result.contacts.fields.find((field) => field.key === "emails");
    const phoneField = result.contacts.fields.find((field) => field.key === "phones");
    const socialField = result.contacts.fields.find((field) => field.key === "socials");
    assert.deepEqual(emailField.value, [
      "research@northstar.example",
      "press@northstar.example"
    ]);
    assert.equal(phoneField.value[0], "+86 21 5550 1288");
    assert.ok(socialField.value.some((url) => url.includes("linkedin.com")));
  } finally {
    await browser.close();
  }
});

test("article, product, list and custom profiles produce structured output", async () => {
  const { browser, page } = await openFixturePage();
  try {
    const result = await page.evaluate(() => ({
      article: KeyLensCore.extract(document, { profile: "article" }),
      product: KeyLensCore.extract(document, { profile: "product" }),
      list: KeyLensCore.extract(document, { profile: "list", maxRows: 30 }),
      custom: KeyLensCore.extract(document, {
        profile: "custom",
        customFields: ["作者", "价格", "邮箱", "公司"]
      })
    }));
    assert.equal(
      result.article.fields.find((field) => field.key === "author").value,
      "Mia Chen"
    );
    assert.equal(
      result.product.fields.find((field) => field.key === "price").value,
      "¥129.00"
    );
    assert.deepEqual(result.list.columns, ["报告", "价格", "更新时间"]);
    assert.equal(result.list.rows.length, 3);
    assert.equal(result.list.rows[1].cells[0], "Enterprise Lead Research");
    assert.equal(
      result.custom.fields.find((field) => field.label === "作者").value,
      "Mia Chen"
    );
    assert.equal(
      result.custom.fields.find((field) => field.label === "公司").value,
      "Northstar Studio"
    );

    await page.setContent(`
      <main>
        <h1>供应商目录</h1>
        <article><h2>Acme Labs</h2><a href="https://acme.example">详情</a><p>企业数据平台，起售价 $99/月。联系 sales@acme.example。</p></article>
        <article><h2>Northwind Cloud</h2><a href="https://northwind.example">详情</a><p>云端数据服务，起售价 $149/月。联系 hello@northwind.example。</p></article>
        <article><h2>Contoso BI</h2><a href="https://contoso.example">详情</a><p>商业智能工具，起售价 $199/月。联系 team@contoso.example。</p></article>
      </main>
    `);
    const cards = await page.evaluate(() =>
      KeyLensCore.extract(document, { profile: "list", maxRows: 30 })
    );
    assert.equal(cards.rowKind, "cards");
    assert.equal(cards.rows.length, 3);
    assert.equal(cards.rows[0].title, "Acme Labs");
    assert.equal(cards.rows[0].price, "$99");
    assert.equal(cards.rows[1].email, "hello@northwind.example");
  } finally {
    await browser.close();
  }
});
