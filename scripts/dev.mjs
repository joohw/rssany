#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const npmCmd = "npm";
const webuiMarker = join(root, "app", "webui", "build", "200.html");
const initialMarkerMtime = existsSync(webuiMarker) ? statSync(webuiMarker).mtimeMs : 0;

const children = new Set();
let shuttingDown = false;

function spawnNpm(args, opts = {}) {
  const child = spawn(npmCmd, args, {
    cwd: root,
    env: process.env,
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    // Windows: Node 20.12+ / 22+ reject spawning .cmd without shell (CVE-2024-27980).
    shell: process.platform === "win32",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stopProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to plain kill.
    }
  }
  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of Array.from(children)) stopProcessTree(child);
  process.exitCode = code;
}

function pipeOutput(child, label) {
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
}

function waitForInitialWebuiBuild(child) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      resolve();
    };
    const fail = (err) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      reject(err);
    };
    const hasFreshMarker = () => {
      if (!existsSync(webuiMarker)) return false;
      return statSync(webuiMarker).mtimeMs > initialMarkerMtime;
    };
    const poll = setInterval(() => {
      if (hasFreshMarker()) finish();
    }, 500);
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes('Wrote site to "build"') || text.includes("Wrote site to 'build'")) {
        finish();
      }
    });
    child.once("exit", (code) => {
      if (!done) fail(new Error(`webui watch exited before initial build completed (code ${code ?? "unknown"})`));
    });
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting WebUI static build watcher...");
const webui = spawnNpm(["run", "webui:watch"]);
pipeOutput(webui, "webui");

try {
  await waitForInitialWebuiBuild(webui);
  console.log("WebUI initial build is ready. Starting backend server...");
  const backend = spawnNpm(["run", "dev:backend"]);
  pipeOutput(backend, "backend");

  backend.once("exit", (code) => {
    if (!shuttingDown) {
      console.log(`Backend exited (code ${code ?? "unknown"}). Stopping WebUI watcher...`);
      shutdown(code ?? 0);
    }
  });
  webui.once("exit", (code) => {
    if (!shuttingDown) {
      console.log(`WebUI watcher exited (code ${code ?? "unknown"}). Stopping backend...`);
      shutdown(code ?? 0);
    }
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  shutdown(1);
}
