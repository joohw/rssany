// 与 app/config/userDir.ts 保持同步（bin/、scripts/ 运行时直接加载）
import { homedir } from "node:os";
import { join } from "node:path";

const LEGACY_HOME_DIR = ".rssany";

export function resolveNpmPrefixFromPackageRoot(packageRoot) {
  const normalized = packageRoot.replace(/\\/g, "/");
  const libSuffix = "/lib/node_modules/rssany";
  if (normalized.endsWith(libSuffix)) {
    return packageRoot.slice(0, packageRoot.length - libSuffix.length);
  }
  const flatSuffix = "/node_modules/rssany";
  if (normalized.endsWith(flatSuffix)) {
    return packageRoot.slice(0, packageRoot.length - flatSuffix.length);
  }
  return null;
}

export function isGlobalNpmInstall(packageRoot) {
  const normalized = packageRoot.replace(/\\/g, "/");
  if (normalized.endsWith("/lib/node_modules/rssany")) return true;
  const globalPatterns = [
    /\/npm\/node_modules\/rssany$/,
    /\/\.local\/lib\/node_modules\/rssany$/,
    /\/\.local\/node_modules\/rssany$/,
    /\/\.npm-global\/lib\/node_modules\/rssany$/,
    /\/\.nvm\/versions\/node\/[^/]+\/lib\/node_modules\/rssany$/,
    /\/\.fnm\/node-versions\/[^/]+\/installation\/lib\/node_modules\/rssany$/,
  ];
  return globalPatterns.some((pattern) => pattern.test(normalized));
}

export function resolveDefaultUserDir(packageRoot) {
  const env = process.env.RSSANY_USER_DIR?.trim();
  if (env) return env;

  const npmPrefix = resolveNpmPrefixFromPackageRoot(packageRoot);
  if (npmPrefix && isGlobalNpmInstall(packageRoot)) {
    return join(npmPrefix, "var", "rssany");
  }

  if (!packageRoot.replace(/\\/g, "/").includes("/node_modules/")) {
    return join(packageRoot, ".rssany");
  }

  return join(homedir(), LEGACY_HOME_DIR);
}

export function getLegacyHomeUserDir() {
  return join(homedir(), LEGACY_HOME_DIR);
}
