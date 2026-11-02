import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const requiredFiles = new Set([
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  "src/welcome.html",
  "src/welcome.css",
  "src/welcome.js",
  "src/popup.css",
  "src/popup.js",
  "src/options.css",
  "src/options.js",
  "src/core.js",
  "src/content.js",
  "vendor/lucide.min.js",
  "_locales/en/messages.json",
  "_locales/zh_CN/messages.json",
  "PRIVACY.md",
  "README.md",
  "docs/RESEARCH.md",
  "docs/STORE-LISTING.md",
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...(entry.css || [])])
]);

const errors = [];

if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
if (!manifest.name || !manifest.version) errors.push("name and version are required");
if (!manifest.description) errors.push("description is required");
if (!manifest.default_locale) errors.push("default_locale is required for localized manifest text");

for (const relativePath of requiredFiles) {
  try {
    const info = await stat(path.join(root, relativePath));
    if (!info.isFile() || info.size === 0) errors.push(`${relativePath} is empty`);
  } catch {
    errors.push(`${relativePath} is missing`);
  }
}

for (const [size, relativePath] of Object.entries(manifest.icons)) {
  try {
    const buffer = await readFile(path.join(root, relativePath));
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width !== Number(size) || height !== Number(size)) {
      errors.push(`${relativePath} should be ${size}x${size}, got ${width}x${height}`);
    }
  } catch {
    errors.push(`${relativePath} cannot be read`);
  }
}

const allowedPermissions = new Set(["activeTab", "storage", "tabs", "scripting"]);
for (const permission of manifest.permissions || []) {
  if (!allowedPermissions.has(permission)) errors.push(`unexpected permission: ${permission}`);
}

if ((manifest.host_permissions || []).includes("<all_urls>")) {
  errors.push("use explicit http/https host patterns instead of <all_urls>");
}

for (const host of manifest.host_permissions || []) {
  if (!["http://*/*", "https://*/*"].includes(host)) {
    errors.push(`unexpected host permission: ${host}`);
  }
}

if (manifest.content_security_policy) {
  errors.push("do not weaken the default Manifest V3 CSP without review");
}

for (const htmlPath of ["src/popup.html", "src/options.html", "src/welcome.html"]) {
  const html = await readFile(path.join(root, htmlPath), "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) {
    errors.push(`${htmlPath} contains inline script`);
  }
  if (/https?:\/\/[^"']+\.(?:js|css)/i.test(html)) {
    errors.push(`${htmlPath} loads remote code or styles`);
  }
}

try {
  await access(path.join(root, "dist"));
} catch {
  // dist is generated only when packaging.
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `Manifest valid. Checked ${requiredFiles.size} files, ${manifest.permissions.length} permissions and ${Object.keys(manifest.icons).length} icon sizes.`
);
