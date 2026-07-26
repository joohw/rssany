#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const frontendDir = join(root, "app", "webui-react");
const frontendPort = 18373;
const backendPort = 18374;
const children = new Set();
let shuttingDown = false;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(400);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const unavailable = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", unavailable);
    socket.once("timeout", unavailable);
  });
}

async function waitForPort(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function prefixOutput(stream, target, label) {
  let pending = "";
  stream?.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line) target.write(`[${label}] ${line}\n`);
    }
  });
  stream?.once("end", () => {
    if (pending) target.write(`[${label}] ${pending}\n`);
  });
}

function spawnChild(label, command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  children.add(child);
  prefixOutput(child.stdout, process.stdout, label);
  prefixOutput(child.stderr, process.stderr, label);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
      console.error(`[dev] ${label} exited (${reason}); stopping remaining processes.`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function stopProcessTree(child) {
  if (!child.pid || child.killed) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      child.kill("SIGTERM");
      return;
    }
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stopProcessTree(child);
  const forceTimer = setTimeout(() => {
    for (const child of children) {
      if (!child.pid) continue;
      try {
        if (process.platform === "win32") {
          execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
        } else {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        // Process has already stopped.
      }
    }
  }, 3000);
  forceTimer.unref();
  process.exitCode = code;
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(0));
}

const occupied = [];
if (await isPortOpen(frontendPort)) occupied.push(`frontend ${frontendPort}`);
if (await isPortOpen(backendPort)) occupied.push(`backend ${backendPort}`);
if (occupied.length) {
  console.error(`[dev] Cannot start: port already in use (${occupied.join(", ")}).`);
  console.error("[dev] Stop the existing development process and try again.");
  process.exitCode = 1;
} else {
  console.log(`[dev] React:  http://127.0.0.1:${frontendPort}/`);
  console.log(`[dev] Backend: http://127.0.0.1:${backendPort}/ (tsx watch)`);
  console.log("[dev] Press Ctrl+C to stop both processes.\n");

  spawnChild(
    "backend",
    "npx",
    ["tsx", "watch", "--clear-screen=false", "app/index.ts"],
    root,
    {
      PORT: String(backendPort),
      WEBUI_BUILD_DIR: "app/webui-react/dist",
      NODE_ENV: "development",
    },
  );
  if (await waitForPort(backendPort)) {
    console.log(`[dev] Backend is ready; starting React.\n`);
    spawnChild(
      "react",
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"],
      frontendDir,
      {},
    );
  } else {
    console.error(`[dev] Backend did not become ready on port ${backendPort} within 20 seconds.`);
    shutdown(1);
  }
}
