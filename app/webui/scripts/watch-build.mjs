#!/usr/bin/env node
/**
 * WebUI 开发构建：文件变更后串行执行 `vite build`。
 * 避免 `vite build --watch` 与 adapter-static 竞态（manifest-full.js 缺失）。
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

let building = false;
let pending = false;
let debounceTimer = null;
let initialBuild = true;

function runBuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  if (initialBuild) {
    console.log("[webui:watch] initial build...");
  } else {
    console.log("[webui:watch] rebuilding...");
  }

  const child = spawn("npm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code) => {
    building = false;
    const failed = code !== 0;
    if (failed) {
      console.error(`[webui:watch] build failed (code ${code ?? "unknown"})`);
      if (initialBuild) process.exit(code ?? 1);
    } else {
      console.log("[webui:watch] build complete");
    }
    initialBuild = false;

    if (pending) {
      pending = false;
      runBuild();
    }
  });
}

function scheduleBuild() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild();
  }, 400);
}

function watchPath(path, recursive = false) {
  watch(path, { recursive }, (_event, filename) => {
    if (filename && /(^|[\\/])node_modules([\\/]|$)/.test(filename)) return;
    scheduleBuild();
  }).on("error", (err) => {
    console.warn(`[webui:watch] watcher error (${path}):`, err.message);
  });
}

runBuild();

watchPath(join(root, "src"), true);
for (const rel of ["svelte.config.js", "vite.config.ts", "static"]) {
  watchPath(join(root, rel), rel === "static");
}
