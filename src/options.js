const els = {
  headerPlan: document.querySelector("#headerPlan"),
  planTitle: document.querySelector("#planTitle"),
  planDescription: document.querySelector("#planDescription"),
  planStatus: document.querySelector("#planStatus"),
  quotaDescription: document.querySelector("#quotaDescription"),
  trialButton: document.querySelector("#trialButton"),
  deactivateButton: document.querySelector("#deactivateButton"),
  licenseInput: document.querySelector("#licenseInput"),
  activateButton: document.querySelector("#activateButton"),
  checkoutButton: document.querySelector("#checkoutButton"),
  checkoutNote: document.querySelector("#checkoutNote"),
  checkoutUrlInput: document.querySelector("#checkoutUrlInput"),
  savePublishButton: document.querySelector("#savePublishButton"),
  settingsForm: document.querySelector("#settingsForm"),
  enabledToggle: document.querySelector("#enabledToggle"),
  defaultProfileSelect: document.querySelector("#defaultProfileSelect"),
  languageSelect: document.querySelector("#languageSelect"),
  languageButton: document.querySelector("#languageButton"),
  customFieldsSettings: document.querySelector("#customFieldsSettings"),
  excludedDomainsInput: document.querySelector("#excludedDomainsInput"),
  saveStatus: document.querySelector("#saveStatus"),
  exportBackupButton: document.querySelector("#exportBackupButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  resetButton: document.querySelector("#resetButton"),
  closePageButton: document.querySelector("#closePageButton"),
  toast: document.querySelector("#toast")
};

const i18n = globalThis.KeyLensI18n;
const t = (key, params) => i18n.t(key, params);

let state = null;
let toastTimer = null;

function refreshIcons() {
  globalThis.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.9
    }
  });
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

function renderPlan() {
  const pro = state.plan === "pro";
  const label = pro ? (state.isTrial ? "TRIAL" : "PRO") : "FREE";
  els.headerPlan.textContent = label;
  els.headerPlan.dataset.plan = pro ? "pro" : "free";
  els.planStatus.textContent = label;
  els.planStatus.dataset.plan = pro ? "pro" : "free";
  els.deactivateButton.hidden = !pro;
  els.trialButton.hidden = pro;
  els.trialButton.disabled = !pro && state.trialUsed;
  els.trialButton.innerHTML = state.trialUsed
    ? `<i data-lucide="history"></i>${escapeHtml(t("options.trialUsed"))}`
    : `<i data-lucide="timer-reset"></i>${escapeHtml(t("options.trial"))}`;

  if (pro) {
    els.planTitle.textContent = state.isTrial
      ? t("options.planTitleTrial")
      : t("options.planTitlePro");
    els.planDescription.textContent = state.isTrial
      ? t("options.planDescTrial", { date: formatDate(state.trialEndsAt) })
      : t("options.planDescPro");
    els.quotaDescription.textContent = t("options.quotaPro");
  } else {
    els.planTitle.textContent = t("options.planTitleFree");
    els.planDescription.textContent = t("options.planDescFree");
    els.quotaDescription.textContent = t("options.quotaFree", {
      remaining: state.quota.remaining,
      limit: state.quota.limit
    });
  }

  if (state.checkoutConfigured) {
    els.checkoutNote.textContent = t("options.checkoutConfigured");
  } else {
    els.checkoutNote.textContent = t("options.checkoutMissing");
  }
  updateLanguageButton();
  refreshIcons();
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(i18n.language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateLanguageButton() {
  if (!els.languageButton) return;
  els.languageButton.textContent = i18n.language === "zh" ? "EN" : "中";
  els.languageButton.title = t("popup.switchLanguage");
}

function fillForm() {
  els.enabledToggle.checked = state.settings.enabled !== false;
  els.defaultProfileSelect.value = state.settings.defaultProfile || "brief";
  els.languageSelect.value = state.settings.language || "auto";
  els.customFieldsSettings.value = (state.settings.customFields || []).join(", ");
  els.excludedDomainsInput.value = (state.settings.excludedDomains || []).join("\n");
  els.checkoutUrlInput.value = state.settings.checkoutUrl || "";
}

async function changeLanguage(nextSetting) {
  if (!state) return;
  const previous = state.settings.language || "auto";
  i18n.setLanguage(nextSetting);
  i18n.apply(document);
  state.settings.language = nextSetting;
  updateLanguageButton();
  renderPlan();
  fillForm();
  try {
    state = await send("UPDATE_SETTINGS", { language: nextSetting });
    renderPlan();
    fillForm();
  } catch (error) {
    state.settings.language = previous;
    i18n.setLanguage(previous);
    i18n.apply(document);
    updateLanguageButton();
    renderPlan();
    fillForm();
    showToast(error.message, "error");
  }
}

function toggleLanguage() {
  changeLanguage(i18n.languageSettingForToggle());
}

function splitFields(value) {
  return String(value || "")
    .split(/[,，\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function splitDomains(value) {
  return String(value || "")
    .split(/[\n,，]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 50);
}

async function saveSettings(event) {
  if (event) event.preventDefault();
  try {
    state = await send("UPDATE_SETTINGS", {
      enabled: els.enabledToggle.checked,
      language: els.languageSelect.value,
      defaultProfile: els.defaultProfileSelect.value,
      customFields: splitFields(els.customFieldsSettings.value),
      excludedDomains: splitDomains(els.excludedDomainsInput.value)
    });
    renderPlan();
    fillForm();
    els.saveStatus.textContent = `${t("options.saved")} · ${new Date().toLocaleTimeString(
      i18n.language === "zh" ? "zh-CN" : "en-US",
      {
      hour: "2-digit",
      minute: "2-digit"
      }
    )}`;
    showToast(t("options.saved"));
  } catch (error) {
    showToast(error.message || t("options.saveFailed"), "error");
  }
}

async function saveCheckoutUrl() {
  const value = els.checkoutUrlInput.value.trim();
  if (value && !/^https?:\/\//i.test(value)) {
    showToast(t("options.invalidUrl"), "error");
    return;
  }
  try {
    state = await send("UPDATE_SETTINGS", { checkoutUrl: value });
    renderPlan();
    fillForm();
    showToast(value ? t("options.linkSaved") : t("options.linkCleared"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function openCheckout() {
  if (!state.settings.checkoutUrl) {
    showToast(t("options.fillCheckout"), "error");
    els.checkoutUrlInput.focus();
    return;
  }
  await chrome.tabs.create({ url: state.settings.checkoutUrl });
}

async function startTrial() {
  try {
    const response = await send("START_TRIAL");
    state = response.state;
    renderPlan();
    fillForm();
    showToast(t("options.trialEnabled"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function activateLicense() {
  const licenseKey = els.licenseInput.value.trim();
  if (!licenseKey) {
    showToast(t("options.licenseRequired"), "error");
    els.licenseInput.focus();
    return;
  }
  els.activateButton.disabled = true;
  try {
    const response = await send("ACTIVATE_LICENSE", { licenseKey });
    state = response.state;
    els.licenseInput.value = "";
    renderPlan();
    showToast(t("options.licenseActivated"));
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    els.activateButton.disabled = false;
  }
}

async function deactivatePro() {
  if (!confirm(t("options.deactivateConfirm"))) return;
  try {
    const response = await send("DEACTIVATE_PRO");
    state = response.state;
    renderPlan();
    showToast(t("options.freeSwitch"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

function downloadText(contents, type, filename) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function exportBackup() {
  try {
    const backup = await send("EXPORT_BACKUP");
    downloadText(
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8",
      `keylens-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
    showToast(t("options.exported"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function clearHistory() {
  if (!state?.history?.length) {
    showToast(t("options.noHistory"));
    return;
  }
  if (!confirm(t("options.clearConfirm"))) return;
  try {
    const response = await send("DELETE_HISTORY");
    state = response.state;
    renderPlan();
    showToast(t("options.historyCleared"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function resetAll() {
  if (!confirm(t("options.resetConfirm"))) return;
  try {
    state = await send("CLEAR_ALL_DATA");
    renderPlan();
    fillForm();
    showToast(t("options.resetDone"));
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindEvents() {
  els.settingsForm.addEventListener("submit", saveSettings);
  els.languageButton.addEventListener("click", toggleLanguage);
  els.languageSelect.addEventListener("change", () => changeLanguage(els.languageSelect.value));
  els.savePublishButton.addEventListener("click", saveCheckoutUrl);
  els.checkoutButton.addEventListener("click", openCheckout);
  els.trialButton.addEventListener("click", startTrial);
  els.activateButton.addEventListener("click", activateLicense);
  els.licenseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      activateLicense();
    }
  });
  els.deactivateButton.addEventListener("click", deactivatePro);
  els.exportBackupButton.addEventListener("click", exportBackup);
  els.clearHistoryButton.addEventListener("click", clearHistory);
  els.resetButton.addEventListener("click", resetAll);
  els.closePageButton.addEventListener("click", () => window.close());
}

async function initialize() {
  bindEvents();
  refreshIcons();
  try {
    state = await send("GET_STATE");
    i18n.setLanguage(state.settings.language || "auto");
    i18n.apply(document);
    updateLanguageButton();
    renderPlan();
    fillForm();
  } catch (error) {
    showToast(error.message || t("options.loadFailed"), "error");
  }
}

initialize();
