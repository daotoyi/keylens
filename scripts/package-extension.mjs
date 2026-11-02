import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import process from "node:process";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const distDir = path.join(root, "dist");
const stagingDir = await mkdtemp(path.join(os.tmpdir(), "keylens-package-"));
const zipName = `keylens-${manifest.version}.zip`;
const zipPath = path.join(distDir, zipName);

try {
  await mkdir(distDir, { recursive: true });
  for (const entry of await readdir(distDir)) {
    if (/^keylens-\d+\.\d+\.\d+\.zip$/.test(entry)) {
      await rm(path.join(distDir, entry), { force: true });
    }
  }
  await cp(path.join(root, "manifest.json"), path.join(stagingDir, "manifest.json"));
  for (const folder of ["assets", "src", "vendor", "output", "_locales"]) {
    await cp(path.join(root, folder), path.join(stagingDir, folder), { recursive: true });
  }
  await cp(path.join(root, "README.md"), path.join(stagingDir, "README.md"));
  await cp(path.join(root, "PRIVACY.md"), path.join(stagingDir, "PRIVACY.md"));
  await mkdir(path.join(stagingDir, "docs"), { recursive: true });
  await cp(
    path.join(root, "docs", "RESEARCH.md"),
    path.join(stagingDir, "docs", "RESEARCH.md")
  );
  await cp(
    path.join(root, "docs", "STORE-LISTING.md"),
    path.join(stagingDir, "docs", "STORE-LISTING.md")
  );
  await writeFile(
    path.join(stagingDir, "BUILD.txt"),
    `KeyLens ${manifest.version}\nBuilt ${new Date().toISOString()}\n`
  );
  await execFileAsync("zip", ["-q", "-r", zipPath, "."], { cwd: stagingDir });
  console.log(path.relative(root, zipPath));
} finally {
  await rm(stagingDir, { recursive: true, force: true });
}
