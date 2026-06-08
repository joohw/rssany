#!/usr/bin/env node
/**
 * 全局安装后输出用户数据目录位置（{npm prefix}/var/rssany）。
 */

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isGlobalNpmInstall, resolveDefaultUserDir, resolveNpmPrefixFromPackageRoot } from "./user-dir.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, "..");

function getGlobalNpmPrefix() {
  try {
    return execSync("npm prefix -g", { encoding: "utf8", env: process.env }).trim();
  } catch {
    return null;
  }
}

function isSystemOwnedPrefix(prefix) {
  if (!prefix) return false;
  const normalized = prefix.replace(/\\/g, "/");
  return normalized === "/usr/local" || normalized.startsWith("/usr/local/");
}

async function main() {
  if (!isGlobalNpmInstall(packageRoot)) return;

  const userDir = resolveDefaultUserDir(packageRoot);
  const npmPrefix = resolveNpmPrefixFromPackageRoot(packageRoot) ?? getGlobalNpmPrefix();
  console.log(`[rssany] 用户数据目录: ${userDir}`);
  if (npmPrefix) {
    console.log(`[rssany] npm 全局 prefix: ${npmPrefix}`);
  }
  if (isSystemOwnedPrefix(getGlobalNpmPrefix())) {
    console.log(
      "[rssany] 若此前 npm install -g 报 EACCES，请先执行: npm config set prefix \"$HOME/.local\"，并将 \"$HOME/.local/bin\" 加入 PATH",
    );
  }
}

await main();
