const FREE_DAILY_SCANS = 12;
const FREE_ROW_CAP = 30;
const PRO_ROW_CAP = 300;
const PRO_TRIAL_DAYS = 7;
const HISTORY_LIMIT = 50;
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const DEMO_LICENSE_CODE = "KEYLENS-PRO-DEMO";

const DEFAULT_SETTINGS = {
  enabled: true,
  language: "auto",
  defaultProfile: "brief",
  customFields: [],
  excludedDomains: [],
  checkoutUrl: "",
  licenseKey: ""
};

const DEFAULT_ACCOUNT = {
  plan: "free",
  trialEndsAt: null,
  trialUsed: false,
  history: [],
  quota: {
    date: todayKey(),
    scans: 0,
    chargedKeys: []
  }
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getLocal(keys) {
  return chrome.storage.local.get(keys);
}

async function setLocal(values) {
  return chrome.storage.local.set(values);
}

function effectivePlan(account) {
  if (account.plan === "pro") {
    if (!account.trialEndsAt) return "pro";
    if (new Date(account.trialEndsAt).getTime() > Date.now()) return "pro";
  }
  return "free";
}

function normalizeStringArray(value, limit = 30) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, limit)
    )
  ];
}

async function getSettings() {
  const stored = await getLocal("settings");
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(stored.settings || {}),
    customFields: normalizeStringArray(stored.settings?.customFields, 20),
    excludedDomains: normalizeStringArray(stored.settings?.excludedDomains, 50)
  };
  if (!["brief", "contacts", "article", "product", "list", "custom"].includes(settings.defaultProfile)) {
    settings.defaultProfile = "brief";
  }
  if (!["auto", "zh-CN", "en"].includes(settings.language)) {
    settings.language = "auto";
  }
  return settings;
}

function normalizeQuota(quota) {
  return {
    date: quota?.date || todayKey(),
    scans: Math.max(0, Number(quota?.scans) || 0),
    chargedKeys: Array.isArray(quota?.chargedKeys)
      ? quota.chargedKeys
          .filter((entry) => entry?.key && Number(entry.expiresAt) > Date.now())
          .slice(-100)
      : []
  };
}

async function getAccount() {
  const stored = await getLocal("account");
  const account = {
    ...DEFAULT_ACCOUNT,
    ...(stored.account || {}),
    history: Array.isArray(stored.account?.history) ? stored.account.history.slice(0, HISTORY_LIMIT) : [],
    quota: normalizeQuota(stored.account?.quota)
  };
  if (account.quota.date !== todayKey()) {
    account.quota = { date: todayKey(), scans: 0, chargedKeys: [] };
    await saveAccount(account);
  }
  return account;
}

async function saveAccount(account) {
  await setLocal({ account });
  return account;
}

function publicState(settings, account) {
  const plan = effectivePlan(account);
  return {
    plan,
    isTrial: plan === "pro" && Boolean(account.trialEndsAt),
    trialEndsAt: account.trialEndsAt,
    trialUsed: Boolean(account.trialUsed),
    licenseConfigured: Boolean(settings.licenseKey),
    checkoutConfigured: Boolean(settings.checkoutUrl),
    settings: {
      ...settings,
      licenseKey: settings.licenseKey ? "configured" : ""
    },
    history: account.history,
    quota: {
      scans: plan === "pro" ? 0 : account.quota.scans,
      limit: plan === "pro" ? null : FREE_DAILY_SCANS,
      remaining: plan === "pro" ? null : Math.max(0, FREE_DAILY_SCANS - account.quota.scans),
      date: account.quota.date
    },
    limits: {
      freeDailyScans: FREE_DAILY_SCANS,
      freeRowCap: FREE_ROW_CAP,
      proRowCap: PRO_ROW_CAP,
      history: HISTORY_LIMIT
    }
  };
}

function usageFingerprint(usageKey) {
  let hash = 2166136261;
  const normalized = String(usageKey || "");
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function recordExtraction({ usageKey, plan, rowCount, empty } = {}) {
  if (!usageKey) throw new Error("缺少本次提取标识");
  if (empty) {
    const account = await getAccount();
    return {
      charged: false,
      reason: "empty",
      state: publicState(await getSettings(), account)
    };
  }

  const account = await getAccount();
  const currentPlan = plan === "pro" && effectivePlan(account) === "pro" ? "pro" : effectivePlan(account);
  if (currentPlan === "pro") {
    return {
      charged: false,
      reason: "pro",
      state: publicState(await getSettings(), account)
    };
  }

  const fingerprint = usageFingerprint(usageKey);
  const existing = account.quota.chargedKeys.find(
    (entry) => entry.key === fingerprint && entry.expiresAt > Date.now()
  );
  if (existing) {
    return {
      charged: false,
      reason: "duplicate",
      state: publicState(await getSettings(), account)
    };
  }

  if (account.quota.scans >= FREE_DAILY_SCANS) {
    const error = new Error(`今日免费额度已用完（${FREE_DAILY_SCANS}/${FREE_DAILY_SCANS}）`);
    error.code = "QUOTA_EXCEEDED";
    throw error;
  }

  account.quota.scans += 1;
  account.quota.chargedKeys = [
    ...account.quota.chargedKeys,
    {
      key: fingerprint,
      expiresAt: Date.now() + DUPLICATE_WINDOW_MS,
      rowCount: Math.max(0, Number(rowCount) || 0)
    }
  ].slice(-100);
  await saveAccount(account);
  return {
    charged: true,
    reason: "scan",
    state: publicState(await getSettings(), account)
  };
}

async function checkQuota({ usageKey } = {}) {
  const account = await getAccount();
  const plan = effectivePlan(account);
  if (plan === "pro") {
    return { allowed: true, duplicate: false, state: publicState(await getSettings(), account) };
  }
  const fingerprint = usageFingerprint(usageKey);
  const duplicate = account.quota.chargedKeys.some(
    (entry) => entry.key === fingerprint && entry.expiresAt > Date.now()
  );
  return {
    allowed: duplicate || account.quota.scans < FREE_DAILY_SCANS,
    duplicate,
    state: publicState(await getSettings(), account)
  };
}

async function saveHistory({ result } = {}) {
  if (!result?.url || !result?.profile) throw new Error("提取结果不完整");
  const account = await getAccount();
  if (effectivePlan(account) !== "pro") {
    const error = new Error("历史记录是 Pro 功能");
    error.code = "PRO_REQUIRED";
    throw error;
  }
  const entry = {
    id: `${Date.now()}-${usageFingerprint(result.url + result.profile)}`,
    title: String(result.title || "").slice(0, 240),
    siteName: String(result.siteName || "").slice(0, 160),
    url: String(result.url || ""),
    profile: String(result.profile || "brief"),
    profileLabel: String(result.profileLabel || ""),
    summary: String(result.summary || "").slice(0, 1000),
    keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints.slice(0, 10) : [],
    fields: Array.isArray(result.fields) ? result.fields.slice(0, 30) : [],
    columns: Array.isArray(result.columns) ? result.columns.slice(0, 20) : [],
    rows: Array.isArray(result.rows) ? result.rows.slice(0, PRO_ROW_CAP) : [],
    stats: result.stats || {},
    batchResults: Array.isArray(result.batchResults) ? result.batchResults.slice(0, 20) : [],
    createdAt: new Date().toISOString()
  };
  account.history = [entry, ...account.history.filter((item) => item.url !== entry.url)].slice(
    0,
    HISTORY_LIMIT
  );
  await saveAccount(account);
  return { history: account.history, state: publicState(await getSettings(), account) };
}

async function deleteHistory({ id } = {}) {
  const account = await getAccount();
  account.history = id ? account.history.filter((item) => item.id !== id) : [];
  await saveAccount(account);
  return { state: publicState(await getSettings(), account) };
}

async function startTrial() {
  const account = await getAccount();
  if (effectivePlan(account) === "pro") {
    return { state: publicState(await getSettings(), account) };
  }
  if (account.trialUsed) {
    const error = new Error("7 天 Pro 试用已经使用过");
    error.code = "TRIAL_USED";
    throw error;
  }
  const end = new Date();
  end.setDate(end.getDate() + PRO_TRIAL_DAYS);
  account.plan = "pro";
  account.trialUsed = true;
  account.trialEndsAt = end.toISOString();
  await saveAccount(account);
  return { state: publicState(await getSettings(), account) };
}

async function activateLicense({ licenseKey } = {}) {
  const normalized = String(licenseKey || "").trim();
  if (!normalized) throw new Error("请输入激活码");
  if (normalized !== DEMO_LICENSE_CODE) {
    const error = new Error("激活码无效。正式环境需接入许可证校验服务。");
    error.code = "INVALID_LICENSE";
    throw error;
  }
  const settings = await getSettings();
  const account = await getAccount();
  account.plan = "pro";
  account.trialEndsAt = null;
  settings.licenseKey = normalized;
  await setLocal({ settings });
  await saveAccount(account);
  return { state: publicState(settings, account) };
}

async function deactivatePro() {
  const settings = await getSettings();
  const account = await getAccount();
  account.plan = "free";
  account.trialEndsAt = null;
  settings.licenseKey = "";
  await setLocal({ settings });
  await saveAccount(account);
  return { state: publicState(settings, account) };
}

async function updateSettings(payload = {}) {
  const current = await getSettings();
  const next = {
    ...current,
    ...(Object.prototype.hasOwnProperty.call(payload, "enabled")
      ? { enabled: Boolean(payload.enabled) }
      : {}),
    ...(payload.language ? { language: String(payload.language) } : {}),
    ...(payload.defaultProfile ? { defaultProfile: String(payload.defaultProfile) } : {}),
    ...(Array.isArray(payload.customFields)
      ? { customFields: normalizeStringArray(payload.customFields, 20) }
      : {}),
    ...(Array.isArray(payload.excludedDomains)
      ? { excludedDomains: normalizeStringArray(payload.excludedDomains, 50) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, "checkoutUrl")
      ? { checkoutUrl: String(payload.checkoutUrl || "").trim().slice(0, 1000) }
      : {})
  };
  if (next.checkoutUrl && !/^https?:\/\//i.test(next.checkoutUrl)) {
    throw new Error("支付链接必须以 http:// 或 https:// 开头");
  }
  if (!["brief", "contacts", "article", "product", "list", "custom"].includes(next.defaultProfile)) {
    next.defaultProfile = "brief";
  }
  if (!["auto", "zh-CN", "en"].includes(next.language)) {
    next.language = "auto";
  }
  await setLocal({ settings: next });
  const account = await getAccount();
  return publicState(next, account);
}

async function clearAllData() {
  await chrome.storage.local.clear();
  const settings = await getSettings();
  const account = await getAccount();
  return publicState(settings, account);
}

async function exportBackup() {
  const stored = await getLocal(["settings", "account"]);
  return {
    product: "KeyLens",
    version: "1.1.0",
    exportedAt: new Date().toISOString(),
    settings: {
      ...(stored.settings || {}),
      licenseKey: stored.settings?.licenseKey ? "configured" : ""
    },
    account: {
      ...(stored.account || {}),
      plan: "redacted"
    }
  };
}

async function openOptions() {
  await chrome.runtime.openOptionsPage();
}

async function handleMessage(message) {
  const payload = message?.payload || {};
  switch (message?.type) {
    case "GET_STATE":
      return publicState(await getSettings(), await getAccount());
    case "CHECK_QUOTA":
      return checkQuota(payload);
    case "RECORD_EXTRACTION":
      return recordExtraction(payload);
    case "START_TRIAL":
      return startTrial();
    case "ACTIVATE_LICENSE":
      return activateLicense(payload);
    case "DEACTIVATE_PRO":
      return deactivatePro();
    case "UPDATE_SETTINGS":
      return updateSettings(payload);
    case "SAVE_HISTORY":
      return saveHistory(payload);
    case "DELETE_HISTORY":
      return deleteHistory(payload);
    case "CLEAR_ALL_DATA":
      return clearAllData();
    case "EXPORT_BACKUP":
      return exportBackup();
    case "OPEN_OPTIONS":
      await openOptions();
      return { opened: true };
    default:
      throw new Error(`未知操作: ${message?.type || "empty"}`);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: {
          message: error.message || "操作失败",
          code: error.code || "INTERNAL_ERROR"
        }
      })
    );
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/welcome.html") });
  }
});
