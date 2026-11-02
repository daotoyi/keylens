(function attachKeyLensCore(globalScope) {
  "use strict";

  const PROFILE_DEFINITIONS = Object.freeze({
    brief: {
      label: "页面摘要",
      description: "标题、摘要、作者、日期与关键点",
      tier: "free",
      icon: "file-text"
    },
    contacts: {
      label: "联系方式",
      description: "邮箱、电话、公司、地址与社交主页",
      tier: "free",
      icon: "contact"
    },
    article: {
      label: "文章结构",
      description: "正文元数据、摘要和可复用要点",
      tier: "pro",
      icon: "newspaper"
    },
    product: {
      label: "商品信息",
      description: "价格、品牌、评分、库存和图片",
      tier: "pro",
      icon: "package"
    },
    list: {
      label: "列表表格",
      description: "自动识别重复卡片或表格行",
      tier: "pro",
      icon: "table"
    },
    custom: {
      label: "自定义字段",
      description: "用自然语言或英文键名定义字段",
      tier: "pro",
      icon: "wand"
    }
  });

  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;
  const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;
  const PRICE_PATTERN =
    /(?:US\$|HK\$|S\$|A\$|C\$|€|£|¥|￥|\$)\s?\d[\d,.]*(?:\s?(?:USD|EUR|GBP|CNY|RMB|JPY|HKD|SGD|AUD))?|\d[\d,.]*\s?(?:USD|EUR|GBP|CNY|RMB|JPY|HKD|SGD|AUD)/gi;
  const DATE_PATTERN =
    /\b(?:20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2})\b/i;
  const SOCIAL_HOSTS = [
    "linkedin.com",
    "x.com",
    "twitter.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "github.com",
    "tiktok.com",
    "weibo.com",
    "douyin.com",
    "xiaohongshu.com"
  ];
  const REQUESTED_FIELD_ALIASES = new Map([
    ["title", "title"],
    ["标题", "title"],
    ["名称", "title"],
    ["name", "title"],
    ["summary", "summary"],
    ["摘要", "summary"],
    ["简介", "summary"],
    ["author", "author"],
    ["作者", "author"],
    ["byline", "author"],
    ["date", "publishedAt"],
    ["published", "publishedAt"],
    ["发布日期", "publishedAt"],
    ["时间", "publishedAt"],
    ["email", "emails"],
    ["emails", "emails"],
    ["邮箱", "emails"],
    ["邮件", "emails"],
    ["phone", "phones"],
    ["phones", "phones"],
    ["电话", "phones"],
    ["手机", "phones"],
    ["price", "price"],
    ["价格", "price"],
    ["售价", "price"],
    ["brand", "brand"],
    ["品牌", "brand"],
    ["rating", "rating"],
    ["评分", "rating"],
    ["company", "organization"],
    ["organization", "organization"],
    ["公司", "organization"],
    ["地址", "address"],
    ["address", "address"],
    ["url", "url"],
    ["网址", "url"],
    ["链接", "url"],
    ["image", "image"],
    ["图片", "image"],
    ["key points", "keyPoints"],
    ["keypoints", "keyPoints"],
    ["要点", "keyPoints"],
    ["关键点", "keyPoints"]
  ]);

  function tr(key, fallback, params = {}) {
    return globalScope.KeyLensI18n?.t(key, params) || fallback;
  }

  function cleanText(value, maxLength = 4000) {
    return String(value ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function unique(values, limit = 100) {
    const seen = new Set();
    const output = [];
    for (const rawValue of values || []) {
      const value = cleanText(rawValue);
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      output.push(value);
      if (output.length >= limit) break;
    }
    return output;
  }

  function firstText(root, selectors) {
    if (!root?.querySelector) return "";
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const value = cleanText(element?.textContent || element?.getAttribute?.("content") || "");
      if (value) return value;
    }
    return "";
  }

  function metaContent(doc, selectors) {
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      const value = cleanText(element?.getAttribute("content") || element?.textContent || "");
      if (value) return value;
    }
    return "";
  }

  function absoluteUrl(value, base) {
    if (!value) return "";
    try {
      return new URL(value, base).href;
    } catch {
      return "";
    }
  }

  function flattenJsonLd(value, output = []) {
    if (!value) return output;
    if (Array.isArray(value)) {
      value.forEach((entry) => flattenJsonLd(entry, output));
      return output;
    }
    if (typeof value !== "object") return output;
    output.push(value);
    if (value["@graph"]) flattenJsonLd(value["@graph"], output);
    return output;
  }

  function readJsonLd(doc) {
    const nodes = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        flattenJsonLd(JSON.parse(script.textContent || ""), nodes);
      } catch {
        // Invalid JSON-LD is common; visible DOM extraction remains the fallback.
      }
    }
    return nodes;
  }

  function typesOf(node) {
    const types = node?.["@type"];
    return (Array.isArray(types) ? types : [types]).filter(Boolean).map(String);
  }

  function firstTypedNode(nodes, types) {
    return (
      nodes.find((node) => typesOf(node).some((type) => types.includes(type))) || null
    );
  }

  function valueFromEntity(value) {
    if (!value) return "";
    if (typeof value === "string" || typeof value === "number") return cleanText(value);
    if (Array.isArray(value)) return cleanText(valueFromEntity(value[0]));
    return cleanText(value.name || value["@id"] || "");
  }

  function getMainRoot(doc) {
    const candidates = [
      ...doc.querySelectorAll(
        "article, main, [role='main'], [itemprop='articleBody'], .article-body, .post-content, .entry-content, #content"
      )
    ];
    if (!candidates.length) return doc.body || doc.documentElement;

    let best = doc.body || doc.documentElement;
    let bestScore = -1;
    for (const candidate of candidates) {
      const textLength = cleanText(candidate.textContent, 120000).length;
      const linkLength = [...candidate.querySelectorAll("a")].reduce(
        (total, link) => total + cleanText(link.textContent, 500).length,
        0
      );
      const paragraphCount = candidate.querySelectorAll("p").length;
      const score = textLength - linkLength * 0.55 + paragraphCount * 120;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function readableText(root) {
    if (!root) return "";
    const paragraphs = [...root.querySelectorAll("p, blockquote")]
      .filter(
        (element) =>
          !element.closest(
            "nav, footer, aside, header, form, table, .byline, [rel='author'], [itemprop='author']"
          )
      )
      .map((element) => cleanText(element.textContent, 1800))
      .filter((text) => text.length >= 20);
    const paragraphText = unique(paragraphs, 300).join(" ");
    if (paragraphText.length >= 80) return cleanText(paragraphText, 120000);

    const clone = root.cloneNode(true);
    clone
      .querySelectorAll(
        "script, style, noscript, svg, canvas, nav, header, footer, aside, form, button, time, table, figcaption"
      )
      .forEach((element) => element.remove());
    return cleanText(clone.textContent, 120000);
  }

  function sentenceList(text, limit = 120) {
    const normalized = cleanText(text, 120000);
    const matches =
      normalized.match(/[^。！？.!?\n]+[。！？.!?]?/g)?.map((item) => cleanText(item, 420)) || [];
    return matches.filter((sentence) => sentence.length >= 20).slice(0, limit);
  }

  function scoreSentence(sentence, index) {
    const length = sentence.length;
    const lengthScore = length >= 55 && length <= 180 ? 22 : length < 35 ? -12 : 7;
    const numberScore = /\d/.test(sentence) ? 5 : 0;
    const payoffScore = /因为|所以|结果|发现|显示|关键|important|result|because|found|key/i.test(
      sentence
    )
      ? 9
      : 0;
    return Math.max(0, 42 - index * 3 + lengthScore + numberScore + payoffScore);
  }

  function selectKeyPoints(text, limit = 5) {
    const sentences = sentenceList(text, 140);
    return sentences
      .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.sentence);
  }

  function buildSummary(text, maxLength = 320) {
    const sentences = sentenceList(text, 12);
    let summary = "";
    for (const sentence of sentences) {
      if (!summary) {
        summary = sentence;
      } else if (summary.length + sentence.length + 1 <= maxLength) {
        summary += ` ${sentence}`;
      } else {
        break;
      }
      if (summary.length >= 150) break;
    }
    return cleanText(summary || text, maxLength);
  }

  function extractEmails(doc, text) {
    const values = [...(text.match(EMAIL_PATTERN) || [])];
    for (const link of doc.querySelectorAll('a[href^="mailto:"]')) {
      values.push(decodeURIComponent(link.getAttribute("href").replace(/^mailto:/i, "").split("?")[0]));
    }
    return unique(
      values.filter((email) => !/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(email)),
      12
    ).map((email) => email.toLocaleLowerCase());
  }

  function extractPhones(doc, text) {
    const values = [];
    for (const match of text.match(PHONE_PATTERN) || []) {
      if (/^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?$/.test(cleanText(match))) continue;
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 16) values.push(match);
    }
    for (const link of doc.querySelectorAll('a[href^="tel:"]')) {
      values.push(link.getAttribute("href").replace(/^tel:/i, ""));
    }
    return unique(values, 12).filter((phone) => {
      const digits = phone.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 16;
    });
  }

  function extractPrice(text) {
    const matches = [...String(text || "").matchAll(PRICE_PATTERN)];
    if (!matches.length) return { value: "", currency: "" };
    const value = cleanText(matches[0][0], 80);
    let currency = "";
    if (/US\$|USD/i.test(value)) currency = "USD";
    else if (/€|EUR/i.test(value)) currency = "EUR";
    else if (/£|GBP/i.test(value)) currency = "GBP";
    else if (/¥|￥|CNY|RMB/i.test(value)) currency = "CNY";
    else if (/JPY/i.test(value)) currency = "JPY";
    else if (/HK\$|HKD/i.test(value)) currency = "HKD";
    else if (/S\$|SGD/i.test(value)) currency = "SGD";
    else if (/A\$|AUD/i.test(value)) currency = "AUD";
    else if (/\$/.test(value)) currency = "USD";
    return { value, currency };
  }

  function extractDate(text) {
    return cleanText(String(text || "").match(DATE_PATTERN)?.[0] || "", 60);
  }

  function getSocialLinks(doc) {
    const links = [];
    for (const anchor of doc.querySelectorAll("a[href]")) {
      const href = absoluteUrl(anchor.getAttribute("href"), doc.baseURI || globalScope.location?.href);
      if (!href) continue;
      try {
        const host = new URL(href).hostname.replace(/^www\./, "").toLocaleLowerCase();
        if (SOCIAL_HOSTS.some((socialHost) => host === socialHost || host.endsWith(`.${socialHost}`))) {
          links.push(href);
        }
      } catch {
        // Ignore malformed href values on otherwise usable pages.
      }
    }
    return unique(links, 12);
  }

  function extractAddress(doc, entity) {
    const address = entity?.address;
    if (typeof address === "string") return cleanText(address, 220);
    if (address && typeof address === "object") {
      return cleanText(
        [
          address.streetAddress,
          address.addressLocality,
          address.addressRegion,
          address.postalCode,
          address.addressCountry
        ]
          .filter(Boolean)
          .join(", "),
        220
      );
    }
    return firstText(doc, [
      "[itemprop='address']",
      "address",
      "[data-testid='address']",
      ".company-address",
      ".address"
    ]);
  }

  function buildPageModel(doc) {
    const baseUrl = doc.baseURI || globalScope.location?.href || "";
    const jsonLdNodes = readJsonLd(doc);
    const articleEntity =
      firstTypedNode(jsonLdNodes, ["Article", "NewsArticle", "BlogPosting", "Report"]) || {};
    const productEntity = firstTypedNode(jsonLdNodes, ["Product", "IndividualProduct"]) || {};
    const organizationEntity =
      firstTypedNode(jsonLdNodes, ["Organization", "Corporation", "LocalBusiness"]) || {};
    const mainRoot = getMainRoot(doc);
    const mainText = readableText(mainRoot);
    const bodyText = cleanText(doc.body?.textContent || "", 160000);
    const title = cleanText(
      metaContent(doc, ["meta[property='og:title']", "meta[name='twitter:title']"]) ||
        firstText(doc, ["main h1", "article h1", "h1"]) ||
        articleEntity.headline ||
        productEntity.name ||
        doc.title,
      240
    );
    const description = cleanText(
      metaContent(doc, [
        "meta[name='description']",
        "meta[property='og:description']",
        "meta[name='twitter:description']"
      ]) ||
        productEntity.description ||
        articleEntity.description,
      600
    );
    const author = cleanText(
      valueFromEntity(articleEntity.author) ||
        metaContent(doc, [
          "meta[name='author']",
          "meta[property='article:author']",
          "meta[name='byl']"
        ]) ||
        firstText(doc, [
          "[rel='author']",
          "[itemprop='author']",
          ".author",
          ".byline",
          "[class*='author']"
        ]),
      160
    );
    const publishedAt = cleanText(
      articleEntity.datePublished ||
        metaContent(doc, [
          "meta[property='article:published_time']",
          "meta[name='date']",
          "meta[name='pubdate']",
          "meta[itemprop='datePublished']"
        ]) ||
        doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
        firstText(doc, ["time", "[itemprop='datePublished']"]),
      80
    );
    const updatedAt = cleanText(
      articleEntity.dateModified ||
        metaContent(doc, ["meta[property='article:modified_time']", "meta[itemprop='dateModified']"]),
      80
    );
    const offers = Array.isArray(productEntity.offers)
      ? productEntity.offers[0]
      : productEntity.offers || {};
    const visiblePrice = firstText(doc, [
      "[itemprop='price']",
      "[data-price]",
      "[class*='sale-price']",
      "[class*='price']"
    ]);
    const priceMatch = extractPrice(
      [offers.price, offers.lowPrice, productEntity.price, visiblePrice, bodyText].filter(Boolean).join(" ")
    );
    const ratingValue =
      productEntity.aggregateRating?.ratingValue ||
      firstText(doc, ["[itemprop='ratingValue']", "[class*='rating']"]);
    const image =
      productEntity.image ||
      metaContent(doc, ["meta[property='og:image']", "meta[name='twitter:image']"]);
    const canonical = absoluteUrl(
      doc.querySelector("link[rel='canonical']")?.getAttribute("href") ||
        metaContent(doc, ["meta[property='og:url']"]) ||
        baseUrl,
      baseUrl
    );
    const siteName = cleanText(
      metaContent(doc, ["meta[property='og:site_name']"]) ||
        organizationEntity.name ||
        "",
      160
    );
    const wordCount = (mainText.match(/[\p{L}\p{N}]+/gu) || []).length;

    return {
      title,
      description,
      author,
      publishedAt,
      updatedAt,
      summary: buildSummary(mainText || description),
      keyPoints: selectKeyPoints(mainText || description, 5),
      emails: extractEmails(doc, bodyText),
      phones: extractPhones(doc, bodyText),
      socials: getSocialLinks(doc),
      organization:
        cleanText(
          organizationEntity.name ||
            firstText(doc, ["[class*='company-name']", ".company-name", ".company"]),
          180
        ) ||
        siteName ||
        safeHostname(canonical),
      address: extractAddress(doc, organizationEntity),
      price: priceMatch.value,
      currency: priceMatch.currency,
      brand: cleanText(valueFromEntity(productEntity.brand), 120),
      availability: cleanText(valueFromEntity(offers.availability), 120),
      rating: cleanText(valueFromEntity(ratingValue), 80),
      image: absoluteUrl(valueFromEntity(image), baseUrl),
      url: canonical,
      siteName: siteName || safeHostname(canonical),
      language: cleanText(doc.documentElement?.lang || "", 30),
      wordCount,
      readingMinutes: Math.max(1, Math.ceil(wordCount / 320)),
      mainText,
      bodyText,
      doc,
      baseUrl
    };
  }

  function safeHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function makeField(key, label, value, confidence = 0.8, kind = "text") {
    const normalizedValue = Array.isArray(value) ? unique(value, 30) : cleanText(value, 800);
    return {
      key,
      label,
      value: normalizedValue,
      confidence: normalizedValue.length ? confidence : 0.15,
      kind
    };
  }

  function listTableRows(doc) {
    const rowGroups = [];
    for (const table of doc.querySelectorAll("table")) {
      const rows = [...table.querySelectorAll("tbody tr")];
      if (rows.length >= 2) {
        const headers = [...table.querySelectorAll("thead th")].map((cell) =>
          cleanText(cell.textContent, 80)
        );
        rowGroups.push({
          kind: "table",
          nodes: rows,
          headers: headers.filter(Boolean),
          score: rows.length * 4 + 50
        });
      }
    }
    return rowGroups;
  }

  function genericRowGroups(doc) {
    const selectorGroups = [
      ["[role='listitem']", 20],
      ["article", 18],
      ["main li, [role='main'] li", 12],
      ["[itemtype*='Product']", 18],
      ["[data-testid*='card'], [class*='result-card'], [class*='product-card']", 16]
    ];
    const groups = [];
    for (const [selector, bonus] of selectorGroups) {
      const nodes = [...doc.querySelectorAll(selector)].filter((node) => {
        const text = cleanText(node.textContent, 4000);
        return text.length >= 12 && text.length <= 2400;
      });
      if (nodes.length < 3) continue;
      const uniqueTextRatio =
        unique(nodes.map((node) => cleanText(node.textContent, 600)), nodes.length).length /
        nodes.length;
      if (uniqueTextRatio < 0.65) continue;
      const avgTextLength =
        nodes.reduce((total, node) => total + cleanText(node.textContent, 3000).length, 0) /
        nodes.length;
      const anchorRatio =
        nodes.filter((node) => node.querySelector("a[href]")).length / nodes.length;
      groups.push({
        kind: "cards",
        nodes,
        headers: [],
        score: nodes.length * 2 + uniqueTextRatio * 28 + anchorRatio * 30 + bonus + avgTextLength / 120
      });
    }
    return groups;
  }

  function rowImage(node, baseUrl) {
    const image = node.querySelector("img");
    const value =
      image?.getAttribute("src") ||
      image?.getAttribute("data-src") ||
      image?.getAttribute("data-original") ||
      image?.currentSrc ||
      "";
    return absoluteUrl(value, baseUrl);
  }

  function extractCardRow(node, baseUrl) {
    const title = firstText(node, [
      "h1",
      "h2",
      "h3",
      "h4",
      "[itemprop='name']",
      "[class*='title']",
      "a[href]"
    ]);
    const text = cleanText(node.textContent, 2400);
    const link = node.querySelector("a[href]");
    const paragraphs = [...node.querySelectorAll("p")]
      .map((element) => cleanText(element.textContent, 700))
      .filter((value) => value.length >= 20 && value !== title)
      .sort((left, right) => right.length - left.length);
    const rowText = [title, text].join(" ");
    return {
      title: title || paragraphs[0]?.slice(0, 180) || text.slice(0, 180),
      link: absoluteUrl(link?.getAttribute("href"), baseUrl),
      image: rowImage(node, baseUrl),
      price: extractPrice(text).value,
      rating: cleanText(
        text.match(/\b[1-5](?:\.\d)?\s*(?:out of 5|\/\s*5|星|stars?)\b/i)?.[0]?.trim() || "",
        60
      ),
      date: extractDate(text),
      email: extractEmails(node.ownerDocument, text)[0] || "",
      phone: extractPhones(node.ownerDocument, text)[0] || "",
      description: paragraphs[0]?.slice(0, 380) || text.slice(0, 380)
    };
  }

  function detectRows(doc, maxRows = 300) {
    const groups = [...listTableRows(doc), ...genericRowGroups(doc)].sort(
      (left, right) => right.score - left.score
    );
    const group = groups[0];
    if (!group) return { rows: [], columns: [], rowKind: "none" };

    if (group.kind === "table") {
      const firstRowCells = [...group.nodes[0].querySelectorAll("th, td")];
      const headers =
        group.headers.length >= Math.min(2, firstRowCells.length)
          ? group.headers
          : firstRowCells.map((_, index) => `列 ${index + 1}`);
      const rows = group.nodes
        .slice(0, maxRows)
        .map((row) => {
          const cells = [...row.querySelectorAll("th, td")].map((cell) =>
            cleanText(cell.textContent, 900)
          );
          return { cells };
        })
        .filter((row) => row.cells.some(Boolean));
      return { rows, columns: headers.slice(0, 12), rowKind: "table" };
    }

    const seen = new Set();
    const rows = [];
    for (const node of group.nodes) {
      const row = extractCardRow(node, doc.baseURI || globalScope.location?.href);
      const key = `${row.title}|${row.link}`.toLocaleLowerCase();
      if (!row.title || seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      if (rows.length >= maxRows) break;
    }
    return {
      rows,
      columns: ["title", "price", "rating", "date", "email", "phone", "link", "description"],
      rowKind: "cards"
    };
  }

  function fieldValueFromModel(model, key) {
    if (key === "url") return model.url;
    return model[key] ?? "";
  }

  function findLabeledValue(doc, label) {
    const normalizedLabel = cleanText(label, 80).toLocaleLowerCase();
    if (!normalizedLabel) return "";
    const candidates = [...doc.querySelectorAll("dt, th, label, strong, b, h3, h4, p, span")];
    for (const candidate of candidates.slice(0, 1200)) {
      const text = cleanText(candidate.textContent, 120).toLocaleLowerCase();
      if (text !== normalizedLabel && !text.startsWith(`${normalizedLabel}:`)) continue;
      const containerValue = cleanText(
        candidate.nextElementSibling?.textContent ||
          candidate.parentElement?.nextElementSibling?.textContent ||
          candidate.parentElement?.textContent?.replace(candidate.textContent, ""),
        300
      );
      if (containerValue && containerValue.toLocaleLowerCase() !== normalizedLabel) {
        return containerValue.replace(/^[:：\s]+/, "");
      }
    }
    const bodyText = cleanText(doc.body?.textContent || "", 160000);
    const escaped = normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = bodyText.match(new RegExp(`${escaped}\\s*[:：]\\s*([^。\\n]{2,160})`, "i"));
    return cleanText(match?.[1] || "", 240);
  }

  function extractCustomFields(model, customFields) {
    const fields = [];
    for (const rawName of unique(customFields, 20)) {
      const aliasKey = REQUESTED_FIELD_ALIASES.get(rawName.toLocaleLowerCase());
      let value = aliasKey ? fieldValueFromModel(model, aliasKey) : "";
      let confidence = aliasKey ? 0.9 : 0.55;
      if (!value || (Array.isArray(value) && !value.length)) {
        value = findLabeledValue(model.doc, rawName);
        confidence = value ? 0.62 : 0.15;
      }
      fields.push(
        makeField(
          `custom:${rawName}`,
          rawName,
          value,
          confidence,
          Array.isArray(value) ? "list" : "text"
        )
      );
    }
    return fields;
  }

  function fieldsForProfile(model, profile, customFields) {
    if (profile === "brief") {
      return [
        makeField("title", tr("field.pageTitle", "页面标题"), model.title, 0.96),
        makeField("summary", tr("field.summary", "内容摘要"), model.summary, 0.82),
        makeField("keyPoints", tr("field.keyPoints", "关键点"), model.keyPoints, 0.78, "list"),
        makeField("author", tr("field.author", "作者 / 发布者"), model.author, 0.76),
        makeField("publishedAt", tr("field.publishedAt", "发布日期"), model.publishedAt, 0.72),
        makeField("siteName", tr("field.siteName", "站点"), model.siteName, 0.9),
        makeField("url", tr("field.url", "来源链接"), model.url, 0.98, "url")
      ];
    }
    if (profile === "contacts") {
      return [
        makeField(
          "organization",
          tr("field.organization", "公司 / 组织"),
          model.organization || model.siteName,
          0.76
        ),
        makeField("emails", tr("field.emails", "邮箱"), model.emails.slice(0, 8), 0.9, "list"),
        makeField("phones", tr("field.phones", "电话"), model.phones.slice(0, 8), 0.86, "list"),
        makeField("address", tr("field.address", "地址"), model.address, 0.72),
        makeField("socials", tr("field.socials", "社交主页"), model.socials.slice(0, 8), 0.93, "links"),
        makeField("url", tr("field.url", "来源链接"), model.url, 0.98, "url")
      ];
    }
    if (profile === "article") {
      return [
        makeField("title", tr("field.title", "标题"), model.title, 0.96),
        makeField("author", tr("field.author", "作者"), model.author, 0.82),
        makeField("publishedAt", tr("field.publishedAt", "发布日期"), model.publishedAt, 0.8),
        makeField("updatedAt", tr("field.updatedAt", "更新日期"), model.updatedAt, 0.7),
        makeField("summary", tr("field.summary", "摘要"), model.summary, 0.85),
        makeField("keyPoints", tr("field.keyPoints", "关键点"), model.keyPoints, 0.8, "list"),
        makeField("wordCount", tr("field.wordCount", "字数"), String(model.wordCount), 0.84),
        makeField(
          "readingMinutes",
          tr("field.readingMinutes", "阅读时长"),
          tr("common.minutes", `${model.readingMinutes} 分钟`, { count: model.readingMinutes }),
          0.84
        ),
        makeField("url", tr("field.url", "来源链接"), model.url, 0.98, "url")
      ];
    }
    if (profile === "product") {
      return [
        makeField("title", tr("field.productName", "商品名称"), model.title, 0.94),
        makeField("price", tr("field.price", "价格"), model.price, 0.82),
        makeField("currency", tr("field.currency", "币种"), model.currency, 0.78),
        makeField("brand", tr("field.brand", "品牌"), model.brand, 0.76),
        makeField("availability", tr("field.availability", "库存状态"), model.availability, 0.72),
        makeField("rating", tr("field.rating", "评分"), model.rating, 0.74),
        makeField(
          "description",
          tr("field.productDescription", "商品描述"),
          model.description || model.summary,
          0.78
        ),
        makeField("image", tr("field.image", "主图"), model.image, 0.9, "image"),
        makeField("url", tr("field.url", "来源链接"), model.url, 0.98, "url")
      ];
    }
    if (profile === "custom") {
      return extractCustomFields(model, customFields);
    }
    if (profile === "list") return [];
    throw new Error(`未知提取类型: ${profile}`);
  }

  function confidenceSummary(fields, rows) {
    const filled = fields.filter((field) => {
      const length = Array.isArray(field.value) ? field.value.length : String(field.value || "").length;
      return length > 0;
    });
    if (rows.length) {
      return { confidence: 0.82, quality: "high", filled: filled.length, missing: 0 };
    }
    if (!filled.length) {
      return { confidence: 0, quality: "low", filled: 0, missing: fields.length };
    }
    const confidence =
      filled.reduce((total, field) => total + Number(field.confidence || 0), 0) / filled.length;
    return {
      confidence: Math.round(confidence * 100) / 100,
      quality: confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low",
      filled: filled.length,
      missing: fields.length - filled.length
    };
  }

  function extract(doc, options = {}) {
    const profile = PROFILE_DEFINITIONS[options.profile] ? options.profile : "brief";
    const maxRows = Math.max(1, Math.min(Number(options.maxRows) || 100, 500));
    const model = buildPageModel(doc);
    const rowsResult =
      profile === "list"
        ? detectRows(doc, maxRows)
        : { rows: [], columns: [], rowKind: "none" };
    const fields = fieldsForProfile(model, profile, options.customFields || []);
    const stats = confidenceSummary(fields, rowsResult.rows);
    const meaningfulFields = fields.filter((field) => {
      const length = Array.isArray(field.value) ? field.value.length : String(field.value || "").length;
      return length > 0;
    });

    return {
      profile,
      profileLabel: tr(`profile.${profile}`, PROFILE_DEFINITIONS[profile].label),
      title: model.title,
      siteName: model.siteName,
      url: model.url,
      favicon: "",
      summary: model.summary,
      keyPoints: model.keyPoints,
      fields,
      columns: rowsResult.columns,
      rows: rowsResult.rows,
      rowKind: rowsResult.rowKind,
      stats: {
        ...stats,
        fieldCount: rowsResult.rows.length ? rowsResult.columns.length : meaningfulFields.length,
        rowCount: rowsResult.rows.length,
        wordCount: model.wordCount,
        readingMinutes: model.readingMinutes
      },
      empty: meaningfulFields.length === 0 && rowsResult.rows.length === 0
    };
  }

  const api = Object.freeze({
    PROFILE_DEFINITIONS,
    cleanText,
    unique,
    extractEmails,
    extractPhones,
    extractPrice,
    extractDate,
    selectKeyPoints,
    buildSummary,
    detectRows,
    buildPageModel,
    extract
  });

  globalScope.KeyLensCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
