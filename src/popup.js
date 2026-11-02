const els = {
  planBadge: document.querySelector("#planBadge"),
  languageButton: document.querySelector("#languageButton"),
  historyButton: document.querySelector("#historyButton"),
  settingsButton: document.querySelector("#settingsButton"),
  captureView: document.querySelector("#captureView"),
  historyView: document.querySelector("#historyView"),
  pageTitle: document.querySelector("#pageTitle"),
  pageHost: document.querySelector("#pageHost"),
  siteAvatar: document.querySelector("#siteAvatar"),
  refreshPageButton: document.querySelector("#refreshPageButton"),
  usageDot: document.querySelector("#usageDot"),
  quotaText: document.querySelector("#quotaText"),
  upgradeButton: document.querySelector("#upgradeButton"),
  profileHint: document.querySelector("#profileHint"),
  profileGrid: document.querySelector("#profileGrid"),
  customFieldWrap: document.querySelector("#customFieldWrap"),
  customFieldsInput: document.querySelector("#customFieldsInput"),
  extractButton: document.querySelector("#extractButton"),
  extractButtonLabel: document.querySelector("#extractButtonLabel"),
  extractButtonHint: document.querySelector("#extractButtonHint"),
  batchButton: document.querySelector("#batchButton"),
  selectionButton: document.querySelector("#selectionButton"),
  resultPanel: document.querySelector("#resultPanel"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  resultSource: document.querySelector("#resultSource"),
  resultCount: document.querySelector("#resultCount"),
  resultCache: document.querySelector("#resultCache"),
  rowCountBadge: document.querySelector("#rowCountBadge"),
  fieldsView: document.querySelector("#fieldsView"),
  rowsView: document.querySelector("#rowsView"),
  copyButton: document.querySelector("#copyButton"),
  csvButton: document.querySelector("#csvButton"),
  jsonButton: document.querySelector("#jsonButton"),
  saveButton: document.querySelector("#saveButton"),
  historyBackButton: document.querySelector("#historyBackButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast"),
  upgradeDialog: document.querySelector("#upgradeDialog"),
  dialogCloseButton: document.querySelector("#dialogCloseButton"),
  dialogUpgradeButton: document.querySelector("#dialogUpgradeButton")
};

const i18n = globalThis.KeyLensI18n;
const t = (key, params) => i18n.t(key, params);

const profileMeta = {
  brief: { hintKey: "profile.briefDescription" },
  contacts: { hintKey: "profile.contactsDescription" },
  article: { hintKey: "profile.articleDescription" },
  product: { hintKey: "profile.productDescription" },
  list: { hintKey: "profile.listDescription" },
  custom: { hintKey: "profile.customDescription" }
};

const fieldLabelKeys = {
  organization: "field.organization",
  emails: "field.emails",
  phones: "field.phones",
  address: "field.address",
  socials: "field.socials",
  summary: "field.summary",
  keyPoints: "field.keyPoints",
  author: "field.author",
  publishedAt: "field.publishedAt",
  updatedAt: "field.updatedAt",
  siteName: "field.siteName",
  url: "field.url",
  wordCount: "field.wordCount",
  readingMinutes: "field.readingMinutes",
  price: "field.price",
  currency: "field.currency",
  brand: "field.brand",
  availability: "field.availability",
  rating: "field.rating",
  description: "field.productDescription",
  image: "field.image",
  selection: "field.selectedContent"
};

let state = null;
let currentTab = null;
let pageInfo = null;
let selectedProfile = "brief";
let currentResult = null;
let activeResultView = "fields";
let currentRecord = null;
let toastTimer = null;
let busy = false;

function refreshIcons() {
  globalThis.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.9
    }
  });
}

function isPro() {
  return state?.plan === "pro";
}

function updateLanguageButton() {
  if (!els.languageButton) return;
  els.languageButton.textContent = i18n.language === "zh" ? "EN" : "中";
  els.languageButton.title = t("popup.switchLanguage");
}

async function toggleLanguage() {
  if (!state) return;
  const previous = state.settings.language || "auto";
  const next = i18n.languageSettingForToggle();
  const activeView = activeResultView;
  i18n.setLanguage(next);
  i18n.apply(document);
  updateLanguageButton();
  renderPlan();
  renderPageInfo(pageInfo);
  if (currentResult) {
    renderResult(currentResult);
    setResultView(activeView);
  }
  if (!els.historyView.hidden) renderHistory();
  try {
    state = await send("UPDATE_SETTINGS", { language: next });
  } catch (error) {
    i18n.setLanguage(previous);
    i18n.apply(document);
    updateLanguageButton();
    showToast(error.message, "error");
  }
}

function showToast(message, tone = "default") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.dataset.tone = tone;
  els.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function localizedError(code, fallback) {
  const key = code ? `error.${code}` : "";
  const messages = i18n.messages[i18n.language] || {};
  return key && messages[key] ? t(key) : fallback || t("popup.operationFailed");
}

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    const error = new Error(
      localizedError(response?.error?.code, response?.error?.message || t("popup.operationFailed"))
    );
    error.code = response?.error?.code;
    throw error;
  }
  return response.result;
}

async function queryActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isSupportedUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

async function sendToContent(tabId, message, retryInjection = true) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      const error = new Error(
        localizedError(
          response?.error?.code,
          response?.error?.message || t("popup.operationFailed")
        )
      );
      error.code = response?.error?.code;
      throw error;
    }
    return response.result;
  } catch (error) {
    if (!retryInjection || !/Receiving end does not exist|Could not establish connection/i.test(error.message)) {
      throw error;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/core.js", "src/content.js"]
    });
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) {
      const retryError = new Error(
        localizedError(
          response?.error?.code,
          response?.error?.message || t("popup.operationFailed")
        )
      );
      retryError.code = response?.error?.code;
      throw retryError;
    }
    return response.result;
  }
}

function renderPlan() {
  const pro = isPro();
  els.planBadge.textContent = pro ? (state.isTrial ? "TRIAL" : "PRO") : "FREE";
  els.planBadge.dataset.plan = pro ? "pro" : "free";
  els.upgradeButton.hidden = pro;
  els.batchButton.classList.toggle("is-locked", !pro);
  els.batchButton.title = pro ? t("popup.batchAria") : t("popup.batchUnavailable");
  els.jsonButton.classList.toggle("is-locked", !pro);
  els.saveButton.classList.toggle("is-locked", !pro);
  els.selectionButton.classList.toggle("is-locked", !pro);

  if (pro) {
    els.usageDot.dataset.tone = "";
    els.quotaText.textContent = state.isTrial
      ? t("popup.quotaTrial", { date: formatDate(state.trialEndsAt) })
      : t("popup.quotaPro");
  } else {
    const remaining = state.quota.remaining;
    els.usageDot.dataset.tone = remaining <= 0 ? "danger" : remaining <= 3 ? "warning" : "";
    els.quotaText.textContent = t("popup.quotaFree", {
      remaining,
      limit: state.quota.limit
    });
  }
  updateLanguageButton();
  renderProfileState();
}

function renderProfileState() {
  const pro = isPro();
  document.querySelectorAll(".profile-option").forEach((button) => {
    const profile = button.dataset.profile;
    const locked = profileMeta[profile] && ["article", "product", "list", "custom"].includes(profile) && !pro;
    button.classList.toggle("is-locked", locked);
    button.classList.toggle("is-active", profile === selectedProfile);
    const lock = button.querySelector(".profile-lock");
    if (lock) lock.hidden = !locked;
    button.setAttribute("aria-pressed", String(profile === selectedProfile));
  });
  const meta = profileMeta[selectedProfile] || profileMeta.brief;
  els.profileHint.textContent = t(meta.hintKey);
  els.extractButtonLabel.textContent =
    selectedProfile === "list"
      ? t("popup.extractTable")
      : selectedProfile === "contacts"
        ? t("popup.extractContacts")
        : t("popup.extractButton");
  els.extractButtonHint.textContent = isPro() ? t("popup.proLimitHint") : t("popup.freeLimitHint");
  els.customFieldWrap.hidden = selectedProfile !== "custom";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(i18n.language === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric"
  });
}

function renderPageInfo(info) {
  pageInfo = info;
  if (!info) {
    els.pageTitle.textContent = t("popup.unsupportedPage");
    els.pageHost.textContent = t("popup.unsupportedHint");
    els.siteAvatar.textContent = "—";
    return;
  }
  els.pageTitle.textContent = info.title || info.host || t("popup.unsupportedPage");
  els.pageHost.textContent = info.host || info.url || "";
  const initial = (info.host || "K").replace(/^www\./, "").charAt(0).toLocaleUpperCase();
  if (info.favicon && /^https?:\/\//i.test(info.favicon)) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = info.favicon;
    image.addEventListener("error", () => {
      els.siteAvatar.textContent = initial;
    });
    els.siteAvatar.replaceChildren(image);
  } else {
    els.siteAvatar.textContent = initial;
  }
}

async function connectCurrentPage() {
  currentTab = await queryActiveTab();
  if (!currentTab?.id || !isSupportedUrl(currentTab.url)) {
    renderPageInfo(null);
    return;
  }
  try {
    const response = await sendToContent(currentTab.id, { type: "PING" });
    renderPageInfo(response.page);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ["src/core.js", "src/content.js"]
      });
      const response = await sendToContent(currentTab.id, { type: "PING" }, false);
      renderPageInfo(response.page);
    } catch {
      renderPageInfo(null);
    }
  }
}

function selectProfile(profile) {
  if (!profileMeta[profile]) return;
  const proOnly = ["article", "product", "list", "custom"].includes(profile);
  if (proOnly && !isPro()) {
    openUpgrade();
    return;
  }
  selectedProfile = profile;
  renderProfileState();
  if (currentResult && currentResult.profile !== profile) {
    currentResult = null;
    currentRecord = null;
    els.resultPanel.hidden = true;
  }
}

function openUpgrade() {
  if (isPro()) return;
  if (typeof els.upgradeDialog.showModal === "function") {
    els.upgradeDialog.showModal();
  } else {
    els.upgradeDialog.setAttribute("open", "");
  }
}

function closeUpgrade() {
  if (typeof els.upgradeDialog.close === "function") {
    els.upgradeDialog.close();
  } else {
    els.upgradeDialog.removeAttribute("open");
  }
}

function customFields() {
  return els.customFieldsInput.value
    .split(/[,，\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function usageKey(tab, profile, fields) {
  return [tab?.url || "", profile, fields.join("|"), isPro() ? "pro" : "free"].join("::");
}

function setBusy(nextBusy, message = "") {
  busy = nextBusy;
  els.extractButton.disabled = nextBusy;
  els.batchButton.disabled = nextBusy;
  els.selectionButton.disabled = nextBusy;
  els.refreshPageButton.disabled = nextBusy;
  if (nextBusy) {
    els.extractButtonLabel.textContent = message || t("popup.requestingFields");
    els.extractButtonHint.textContent = t("popup.processingLocal");
  } else {
    renderProfileState();
  }
}

async function extractCurrentPage() {
  if (busy) return;
  if (selectedProfile === "custom" && !customFields().length) {
    showToast(t("popup.noCustomFields"), "error");
    els.customFieldsInput.focus();
    return;
  }
  if (!currentTab?.id || !isSupportedUrl(currentTab.url)) {
    showToast(t("popup.unsupportedError"), "error");
    return;
  }

  const fields = selectedProfile === "custom" ? customFields() : [];
  const key = usageKey(currentTab, selectedProfile, fields);
  setBusy(true);
  try {
    const quota = await send("CHECK_QUOTA", { usageKey: key });
    state = quota.state;
    renderPlan();
    if (!quota.allowed) {
      openUpgrade();
      throw new Error(t("popup.quotaExceeded"));
    }

    const maxRows = isPro() ? state.limits.proRowCap : state.limits.freeRowCap;
    const result = await sendToContent(currentTab.id, {
      type: "EXTRACT_PAGE",
      payload: {
        profile: selectedProfile,
        customFields: fields,
        maxRows,
        language: i18n.language
      }
    });
    if (result.empty) {
      currentResult = result;
      currentRecord = { reason: "empty" };
      renderResult(result);
      showToast(t("popup.noContent"));
      return;
    }

    const record = await send("RECORD_EXTRACTION", {
      usageKey: key,
      plan: state.plan,
      rowCount: result.stats?.rowCount || 0,
      empty: Boolean(result.empty)
    });
    state = record.state;
    currentResult = result;
    currentRecord = record;
    renderPlan();
    renderResult(result);
    if (record.reason === "duplicate") showToast(t("popup.duplicate"));
    else showToast(t("popup.briefSaved", { count: result.stats?.fieldCount || 0 }));
  } catch (error) {
    showToast(error.message || t("popup.extractFailed"), "error");
  } finally {
    setBusy(false);
  }
}

async function extractBatch() {
  if (busy) return;
  if (!isPro()) {
    openUpgrade();
    return;
  }
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(
    (tab) => tab.id && isSupportedUrl(tab.url)
  );
  if (tabs.length < 2) {
    showToast(t("popup.needTwoTabs"), "error");
    return;
  }

  setBusy(true, t("popup.batchBusy", { count: Math.min(tabs.length, 8) }));
  try {
    const batchResults = [];
    const failures = [];
    for (const tab of tabs.slice(0, 8)) {
      try {
        const result = await sendToContent(tab.id, {
          type: "EXTRACT_PAGE",
          payload: {
            profile: selectedProfile === "custom" ? "brief" : selectedProfile,
            customFields: selectedProfile === "custom" ? customFields() : [],
            maxRows: state.limits.proRowCap,
            language: i18n.language
          }
        });
        if (!result.empty) batchResults.push(result);
      } catch (error) {
        failures.push({ title: tab.title || tab.url, error: error.message });
      }
    }
    if (!batchResults.length) throw new Error(t("popup.batchNoContent"));
    const result = {
      profile: "batch",
      profileLabel: t("profile.batch"),
      title: t("popup.batchTitle", { count: batchResults.length }),
      siteName: t("popup.currentWindow"),
      url: currentTab.url,
      summary: failures.length
        ? t("popup.batchSummary", {
            success: batchResults.length,
            failed: failures.length
          })
        : t("popup.batchSummaryNoFailures", { count: batchResults.length }),
      fields: [],
      columns: [],
      rows: [],
      batchResults,
      failures,
      stats: {
        confidence: 0.86,
        quality: "high",
        fieldCount: batchResults.reduce((total, item) => total + (item.stats?.fieldCount || 0), 0),
        rowCount: batchResults.reduce((total, item) => total + (item.stats?.rowCount || 0), 0)
      },
      empty: false,
      extractedAt: new Date().toISOString()
    };
    currentResult = result;
    currentRecord = { reason: "pro" };
    renderResult(result);
    showToast(t("popup.batchSaved", { count: batchResults.length }));
  } catch (error) {
    showToast(error.message || t("popup.extractFailed"), "error");
  } finally {
    setBusy(false);
  }
}

async function extractSelection() {
  if (busy) return;
  if (!isPro()) {
    openUpgrade();
    return;
  }
  if (!currentTab?.id || !isSupportedUrl(currentTab.url)) {
    showToast(t("popup.unsupportedError"), "error");
    return;
  }
  setBusy(true, t("popup.selectionBusy"));
  try {
    const result = await sendToContent(currentTab.id, {
      type: "EXTRACT_SELECTION",
      payload: { language: i18n.language }
    });
    currentResult = result;
    currentRecord = { reason: "pro" };
    selectedProfile = "brief";
    renderPlan();
    renderResult(result);
    showToast(t("popup.selectionSaved"));
  } catch (error) {
    showToast(error.message || t("popup.selectionFailed"), "error");
  } finally {
    setBusy(false);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function valueIsEmpty(value) {
  return Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
}

function localizedFieldLabel(field, result) {
  if (field.key?.startsWith("custom:")) return field.label;
  if (field.key === "title") {
    return t(result?.profile === "product" ? "field.productName" : "field.title");
  }
  if (field.key === "description") return t("field.productDescription");
  return fieldLabelKeys[field.key] ? t(fieldLabelKeys[field.key]) : field.label;
}

function localizedProfileLabel(result) {
  if (result?.profile && ["brief", "contacts", "article", "product", "list", "custom", "selection", "batch"].includes(result.profile)) {
    return t(`profile.${result.profile}`);
  }
  return result?.profileLabel || t("popup.result");
}

function renderFieldValue(field) {
  if (valueIsEmpty(field.value)) {
    return `<span class="field-empty">${escapeHtml(t("common.notRecognized"))}</span>`;
  }
  if (Array.isArray(field.value)) {
    return `<ul class="field-list">${field.value
      .map((entry) => {
        const url = safeHttpUrl(entry);
        const content = url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(entry)}</a>`
          : escapeHtml(entry);
        return `<li>${content}</li>`;
      })
      .join("")}</ul>`;
  }
  const url = safeHttpUrl(field.value);
  if (field.kind === "url" && url) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(field.value)}</a>`;
  }
  if (field.kind === "image" && url) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(field.value)}</a>`;
  }
  return escapeHtml(field.value);
}

function renderBatchFields(results, failures) {
  const items = results
    .map(
      (result) => `
        <article class="history-item">
          <div class="history-item-top">
            <span class="history-profile">${escapeHtml(localizedProfileLabel(result))}</span>
            <span class="history-time">${escapeHtml(
              t("popup.fieldsRowsCount", {
                fields: result.stats?.fieldCount || 0,
                rows: result.stats?.rowCount || 0
              })
            )}</span>
          </div>
          <div class="history-title">${escapeHtml(
            result.title || t("popup.unsupportedPage")
          )}</div>
          <div class="history-domain">${escapeHtml(result.siteName || "")}</div>
        </article>`
    )
    .join("");
  const failureItems = (failures || [])
    .map(
      (failure) =>
        `<div class="field-row"><span class="field-label">${escapeHtml(
          t("popup.failedLabel")
        )}</span><span class="field-value">${escapeHtml(
          failure.title
        )} · ${escapeHtml(failure.error)}</span></div>`
    )
    .join("");
  return `<div class="history-list">${items}</div>${failureItems}`;
}

function renderResult(result) {
  currentResult = result;
  els.resultPanel.hidden = false;
  activeResultView = result.rows?.length ? "fields" : "fields";
  document.querySelectorAll(".result-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === activeResultView);
  });
  els.fieldsView.hidden = false;
  els.rowsView.hidden = true;

  const batchResult = result.profile === "batch" && Array.isArray(result.batchResults);
  els.resultEyebrow.textContent = localizedProfileLabel(result);
  els.resultTitle.textContent = batchResult
    ? t("popup.batchTitle", { count: result.batchResults.length })
    : result.title || t("popup.unsupportedPage");
  els.resultSource.textContent = batchResult
    ? t("popup.currentWindow")
    : result.siteName || result.url || "";
  const fieldCount = result.stats?.fieldCount || result.batchResults?.length || 0;
  const rowCount = result.stats?.rowCount || result.rows?.length || 0;
  els.resultCount.textContent = rowCount
    ? t("popup.metaFieldsRows", { fields: fieldCount, rows: rowCount })
    : t("popup.metaFields", { count: fieldCount });
  const confidence = Math.round(Number(result.stats?.confidence || 0) * 100);
  els.confidenceBadge.dataset.quality = result.stats?.quality || "low";
  els.confidenceBadge.querySelector(".confidence-value").textContent = confidence ? `${confidence}%` : "—";
  els.resultCache.hidden = currentRecord?.reason !== "duplicate";
  els.rowCountBadge.textContent = String(rowCount);
  const rowsTab = document.querySelector('.result-tab[data-view="rows"]');
  if (rowsTab) rowsTab.hidden = rowCount === 0;

  if (result.batchResults) {
    els.fieldsView.innerHTML = renderBatchFields(result.batchResults, result.failures);
  } else {
    const fields = result.fields || [];
    els.fieldsView.innerHTML = fields.length
      ? fields
          .map(
            (field) => `
              <div class="field-row">
                <div class="field-label">${escapeHtml(localizedFieldLabel(field, result))}</div>
                <div class="field-value">${renderFieldValue(field)}</div>
              </div>`
          )
          .join("")
      : renderEmptyState(t("popup.noFieldsTitle"), t("popup.noFieldsDetail"));
  }

  if (result.rows?.length) {
    els.rowsView.innerHTML = renderRowsTable(result);
  } else {
    els.rowsView.innerHTML = renderEmptyState(t("popup.noRowsTitle"), t("popup.noRowsDetail"));
  }
  refreshIcons();
  requestAnimationFrame(() => {
    els.resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function renderEmptyState(title, detail) {
  return `<div class="empty-state"><i data-lucide="scan-text"></i><strong>${escapeHtml(
    title
  )}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function renderRowsTable(result) {
  if (result.rowKind === "table") {
    const columns = (result.columns || []).slice(0, 5);
    const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
    const body = result.rows
      .map(
        (row) =>
          `<tr>${columns
            .map((_, index) => `<td>${escapeHtml(row.cells?.[index] || "")}</td>`)
            .join("")}</tr>`
      )
      .join("");
    return `<table class="rows-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  const columns = ["title", "price", "email", "link"];
  const headers = [
    t("field.title"),
    t("field.price"),
    t("field.emails"),
    t("field.url")
  ];
  const body = result.rows
    .map((row) => {
      const link = safeHttpUrl(row.link);
      return `<tr>
        <td>${escapeHtml(row.title || row.description || "")}</td>
        <td>${escapeHtml(row.price || "")}</td>
        <td>${escapeHtml(row.email || "")}</td>
        <td>${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(t("common.open"))}</a>` : ""}</td>
      </tr>`;
    })
    .join("");
  return `<table class="rows-table"><thead><tr>${headers
    .map((header) => `<th>${header}</th>`)
    .join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

function setResultView(view) {
  activeResultView = view;
  document.querySelectorAll(".result-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  });
  els.fieldsView.hidden = view !== "fields";
  els.rowsView.hidden = view !== "rows";
}

function resultAsText(result = currentResult) {
  if (!result) return "";
  const lines = [
    result.title || "",
    result.siteName || "",
    result.url || "",
    result.summary || ""
  ].filter(Boolean);
  if (result.batchResults) {
    for (const item of result.batchResults) {
      lines.push("", `## ${item.title || ""}`, item.url || "");
      for (const field of item.fields || []) {
        if (!valueIsEmpty(field.value)) {
          lines.push(
            `${localizedFieldLabel(field, item)}: ${
              Array.isArray(field.value) ? field.value.join(" | ") : field.value
            }`
          );
        }
      }
      for (const row of item.rows || []) {
        lines.push(row.title || (row.cells || []).join(" | "));
      }
    }
  } else {
    for (const field of result.fields || []) {
      if (!valueIsEmpty(field.value)) {
        lines.push(
          `${localizedFieldLabel(field, result)}: ${
            Array.isArray(field.value) ? field.value.join(" | ") : field.value
          }`
        );
      }
    }
    for (const row of result.rows || []) {
      lines.push(row.title || (row.cells || []).join(" | "));
    }
  }
  return lines.join("\n");
}

async function copyResult() {
  if (!currentResult) return;
  try {
    await navigator.clipboard.writeText(resultAsText());
    showToast(t("popup.copySuccess"));
  } catch {
    showToast(t("popup.copyFailed"), "error");
  }
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(result = currentResult) {
  if (!result) return "";
  const lines = [];
  if (result.batchResults) {
    lines.push(
      [t("csv.page"), t("csv.source"), t("csv.field"), t("csv.value")].map(csvCell).join(",")
    );
    for (const item of result.batchResults) {
      if (item.rows?.length && item.rowKind !== "table") {
        for (const row of item.rows) {
          lines.push(
            [item.title, item.url, t("csv.row"), JSON.stringify(row)].map(csvCell).join(",")
          );
        }
      } else {
        for (const field of item.fields || []) {
          lines.push(
            [item.title, item.url, localizedFieldLabel(field, item), field.value]
              .map(csvCell)
              .join(",")
          );
        }
      }
    }
    return lines.join("\r\n");
  }
  if (result.rows?.length && result.rowKind === "table") {
    lines.push((result.columns || []).map(csvCell).join(","));
    for (const row of result.rows) {
      lines.push((row.cells || []).map(csvCell).join(","));
    }
    return lines.join("\r\n");
  }
  if (result.rows?.length) {
    const columns = ["title", "price", "rating", "date", "email", "phone", "link", "description"];
    lines.push(columns.map(csvCell).join(","));
    for (const row of result.rows) {
      lines.push(columns.map((column) => csvCell(row[column])).join(","));
    }
    return lines.join("\r\n");
  }
  lines.push([t("csv.field"), t("csv.value")].map(csvCell).join(","));
  for (const field of result.fields || []) {
    lines.push([localizedFieldLabel(field, result), field.value].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

function downloadText(contents, mimeType, filename) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function slugify(value) {
  return String(value || "keylens")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .toLocaleLowerCase() || "keylens";
}

function exportCsv() {
  if (!currentResult) return;
  downloadText(
    `\ufeff${buildCsv()}`,
    "text/csv;charset=utf-8",
    `${slugify(currentResult.title)}-${new Date().toISOString().slice(0, 10)}.csv`
  );
  showToast(t("popup.csvExported"));
}

function exportJson() {
  if (!isPro()) {
    openUpgrade();
    return;
  }
  if (!currentResult) return;
  downloadText(
    JSON.stringify(
      {
        product: "KeyLens",
        exportedAt: new Date().toISOString(),
        result: currentResult
      },
      null,
      2
    ),
    "application/json;charset=utf-8",
    `${slugify(currentResult.title)}-${new Date().toISOString().slice(0, 10)}.json`
  );
  showToast(t("popup.jsonExported"));
}

async function saveCurrentResult() {
  if (!isPro()) {
    openUpgrade();
    return;
  }
  if (!currentResult) return;
  try {
    const saved = await send("SAVE_HISTORY", { result: currentResult });
    state = saved.state;
    renderPlan();
    showToast(t("popup.savedToHistory"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function openHistory() {
  if (!isPro()) {
    openUpgrade();
    return;
  }
  state = await send("GET_STATE");
  renderPlan();
  renderHistory();
  els.captureView.hidden = true;
  els.historyView.hidden = false;
}

function closeHistory() {
  els.historyView.hidden = true;
  els.captureView.hidden = false;
}

function renderHistory() {
  const items = state?.history || [];
  if (!items.length) {
    els.historyList.innerHTML = `<div class="history-empty">
      <i data-lucide="library-big"></i>
      <h2>${escapeHtml(t("popup.historyEmptyTitle"))}</h2>
      <p>${escapeHtml(t("popup.historyEmptyDetail"))}</p>
    </div>`;
    refreshIcons();
    return;
  }
  els.historyList.innerHTML = items
    .map(
      (item) => `<article class="history-item" data-history-id="${escapeHtml(item.id)}">
        <div class="history-item-top">
          <span class="history-profile">${escapeHtml(localizedProfileLabel(item))}</span>
          <span class="history-time">${new Date(item.createdAt).toLocaleString(
            i18n.language === "zh" ? "zh-CN" : "en-US",
            {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
            }
          )}</span>
        </div>
        <div class="history-title">${escapeHtml(
          item.profile === "batch" && item.batchResults?.length
            ? t("popup.batchTitle", { count: item.batchResults.length })
            : item.title || t("popup.unsupportedPage")
        )}</div>
        <div class="history-domain">${escapeHtml(item.siteName || safeHostname(item.url))}</div>
        <div class="history-actions">
          <button type="button" data-action="open">${escapeHtml(t("common.view"))}</button>
          <button type="button" data-action="copy">${escapeHtml(t("common.copy"))}</button>
          <button type="button" data-action="delete">${escapeHtml(t("common.delete"))}</button>
        </div>
      </article>`
    )
    .join("");
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function handleHistoryClick(event) {
  const button = event.target.closest("button[data-action]");
  const itemElement = event.target.closest("[data-history-id]");
  if (!button || !itemElement) return;
  const item = state.history.find((entry) => entry.id === itemElement.dataset.historyId);
  if (!item) return;
  if (button.dataset.action === "open") {
    closeHistory();
    currentResult = item;
    currentRecord = { reason: "history" };
    renderResult(item);
  } else if (button.dataset.action === "copy") {
    currentResult = item;
    await copyResult();
  } else if (button.dataset.action === "delete") {
    try {
      const response = await send("DELETE_HISTORY", { id: item.id });
      state = response.state;
      renderHistory();
      showToast(t("popup.recordDeleted"));
    } catch (error) {
      showToast(error.message, "error");
    }
  }
}

async function clearHistory() {
  if (!state?.history?.length) return;
  if (!confirm(t("popup.clearConfirm"))) return;
  try {
    const response = await send("DELETE_HISTORY");
    state = response.state;
    renderHistory();
    showToast(t("popup.historyCleared"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindEvents() {
  els.profileGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile]");
    if (button) selectProfile(button.dataset.profile);
  });
  els.extractButton.addEventListener("click", extractCurrentPage);
  els.languageButton.addEventListener("click", toggleLanguage);
  els.batchButton.addEventListener("click", extractBatch);
  els.selectionButton.addEventListener("click", extractSelection);
  els.refreshPageButton.addEventListener("click", connectCurrentPage);
  els.settingsButton.addEventListener("click", () => send("OPEN_OPTIONS"));
  els.historyButton.addEventListener("click", openHistory);
  els.historyBackButton.addEventListener("click", closeHistory);
  els.clearHistoryButton.addEventListener("click", clearHistory);
  els.historyList.addEventListener("click", handleHistoryClick);
  els.upgradeButton.addEventListener("click", openUpgrade);
  els.dialogCloseButton.addEventListener("click", closeUpgrade);
  els.dialogUpgradeButton.addEventListener("click", async () => {
    closeUpgrade();
    await send("OPEN_OPTIONS");
  });
  els.upgradeDialog.addEventListener("click", (event) => {
    if (event.target === els.upgradeDialog) closeUpgrade();
  });
  document.querySelectorAll(".result-tab").forEach((tab) => {
    tab.addEventListener("click", () => setResultView(tab.dataset.view));
  });
  els.copyButton.addEventListener("click", copyResult);
  els.csvButton.addEventListener("click", exportCsv);
  els.jsonButton.addEventListener("click", exportJson);
  els.saveButton.addEventListener("click", saveCurrentResult);
  els.customFieldsInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      extractCurrentPage();
    }
  });
}

async function initialize() {
  bindEvents();
  refreshIcons();
  try {
    state = await send("GET_STATE");
    i18n.setLanguage(state.settings.language || "auto");
    i18n.apply(document);
    updateLanguageButton();
    if (state.settings.defaultProfile) selectedProfile = state.settings.defaultProfile;
    if (!isPro() && ["article", "product", "list", "custom"].includes(selectedProfile)) {
      selectedProfile = "brief";
    }
    if (selectedProfile === "custom" && state.settings.customFields?.length) {
      els.customFieldsInput.value = state.settings.customFields.join(", ");
    }
    renderPlan();
    renderProfileState();
    await connectCurrentPage();
  } catch (error) {
    showToast(error.message || t("popup.initFailed"), "error");
  }
}

initialize();
