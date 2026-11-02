(() => {
  if (globalThis.__KEYLENS_CONTENT_LOADED__) return;
  globalThis.__KEYLENS_CONTENT_LOADED__ = true;

  function tr(key, fallback, params = {}) {
    return globalThis.KeyLensI18n?.t(key, params) || fallback;
  }

  function extractError(message, code = "EXTRACT_ERROR") {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  async function readRuntimeSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    return settings || {};
  }

  async function assertPageEnabled() {
    const settings = await readRuntimeSettings();
    if (settings.enabled === false) {
      throw extractError(tr("error.DISABLED", "KeyLens 已暂停，请先在设置中开启"), "DISABLED");
    }
    const host = location.hostname.replace(/^www\./, "").toLocaleLowerCase();
    const excluded = (settings.excludedDomains || []).some((domain) => {
      const normalized = String(domain || "")
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0]
        .toLocaleLowerCase();
      return normalized && (host === normalized || host.endsWith(`.${normalized}`));
    });
    if (excluded) {
      throw extractError(tr("error.DOMAIN_EXCLUDED", "当前站点已列入排除名单"), "DOMAIN_EXCLUDED");
    }
  }

  function pageInfo() {
    return {
      title: document.title || location.hostname,
      url: location.href,
      host: location.hostname.replace(/^www\./, ""),
      favicon: document.querySelector('link[rel~="icon"]')?.href || ""
    };
  }

  function selectionResult() {
    const selected = String(window.getSelection()?.toString() || "").trim();
    if (selected.length < 10) {
      throw extractError(tr("error.EMPTY_SELECTION", "请先在页面中选择一段文字"), "EMPTY_SELECTION");
    }
    const summary = globalThis.KeyLensCore.buildSummary(selected, 360);
    const keyPoints = globalThis.KeyLensCore.selectKeyPoints(selected, 5);
    return {
      profile: "selection",
      profileLabel: tr("profile.selection", "选中文本"),
      title: selected.slice(0, 120),
      siteName: location.hostname.replace(/^www\./, ""),
      url: location.href,
      summary,
      keyPoints,
      fields: [
        {
          key: "selection",
          label: tr("field.selectedContent", "选中内容"),
          value: selected.slice(0, 2000),
          confidence: 1,
          kind: "text"
        },
        {
          key: "keyPoints",
          label: tr("field.keyPoints", "关键点"),
          value: keyPoints,
          confidence: 0.82,
          kind: "list"
        }
      ],
      columns: [],
      rows: [],
      rowKind: "none",
      stats: {
        confidence: 0.9,
        quality: "high",
        filled: 2,
        missing: 0,
        fieldCount: 2,
        rowCount: 0,
        wordCount: (selected.match(/[\p{L}\p{N}]+/gu) || []).length,
        readingMinutes: 1
      },
      empty: false,
      extractedAt: new Date().toISOString()
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true, result: { ready: true, page: pageInfo() } });
      return false;
    }

    if (message?.type === "EXTRACT_PAGE") {
      Promise.resolve()
        .then(async () => {
          globalThis.KeyLensI18n?.setLanguage(message.payload?.language || "auto");
          await assertPageEnabled();
          const payload = message.payload || {};
          const result = globalThis.KeyLensCore.extract(document, {
            profile: payload.profile || "brief",
            customFields: payload.customFields || [],
            maxRows: payload.maxRows || 100
          });
          result.extractedAt = new Date().toISOString();
          result.page = pageInfo();
          return result;
        })
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: {
              message: error.message || tr("error.EXTRACT_ERROR", "提取失败"),
              code: error.code || "EXTRACT_ERROR"
            }
          })
        );
      return true;
    }

    if (message?.type === "EXTRACT_SELECTION") {
      Promise.resolve()
        .then(async () => {
          globalThis.KeyLensI18n?.setLanguage(message.payload?.language || "auto");
          await assertPageEnabled();
          return selectionResult();
        })
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: {
              message: error.message || tr("error.EXTRACT_ERROR", "提取失败"),
              code: error.code || "EXTRACT_ERROR"
            }
          })
        );
      return true;
    }

    return false;
  });
})();
