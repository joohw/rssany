import { homedir } from "node:os";
import { join } from "node:path";

const LEGACY_HOME_DIR = ".rssany";

/** 从全局安装路径 .../{prefix}/lib/node_modules/rssany 或 .../{prefix}/node_modules/rssany 反推 npm prefix */
export function resolveNpmPrefixFromPackageRoot(packageRoot: string): string | null {
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

/** 是否为 npm 全局安装（非项目内 node_modules 依赖） */
export function isGlobalNpmInstall(packageRoot: string): boolean {
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

/**
 * 默认用户数据目录：
 * - 全局安装：{npm prefix}/var/rssany
 * - 源码开发：{repo}/.rssany
 * - 其它：~/.rssany
 */
export function resolveDefaultUserDir(packageRoot: string): string {
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

export function getLegacyHomeUserDir(): string {
  return join(homedir(), LEGACY_HOME_DIR);
}
