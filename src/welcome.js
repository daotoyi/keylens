const i18n = globalThis.KeyLensI18n;
const t = (key, params) => i18n.t(key, params);

function refreshIcons() {
  globalThis.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.9
    }
  });
}

function updateLanguageButton() {
  const button = document.querySelector("#languageButton");
  button.textContent = i18n.language === "zh" ? "EN" : "中";
  button.title = t("welcome.switchLanguage");
}

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    const error = new Error(response?.error?.message || t("popup.operationFailed"));
    error.code = response?.error?.code;
    throw error;
  }
  return response.result;
}

async function changeLanguage(next) {
  const previous = i18n.language;
  i18n.setLanguage(next);
  i18n.apply(document);
  updateLanguageButton();
  refreshIcons();
  try {
    await send("UPDATE_SETTINGS", { language: next });
  } catch {
    i18n.setLanguage(previous);
    i18n.apply(document);
    updateLanguageButton();
  }
}

document.querySelector("#openOptionsButton").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.querySelector("#closePageButton").addEventListener("click", () => {
  window.close();
});

document.querySelector("#languageButton").addEventListener("click", () => {
  changeLanguage(i18n.languageSettingForToggle());
});

send("GET_STATE")
  .then((state) => {
    i18n.setLanguage(state.settings.language || "auto");
    i18n.apply(document);
    updateLanguageButton();
    refreshIcons();
  })
  .catch(() => {
    i18n.setLanguage("auto");
    i18n.apply(document);
    updateLanguageButton();
    refreshIcons();
  });
