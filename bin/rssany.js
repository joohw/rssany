#!/usr/bin/env node
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { homedir, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];
const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(binDir, "..");
const userDir = process.env.RSSANY_USER_DIR?.trim() || join(homedir(), ".rssany");
const pidPath = join(userDir, "rssany.pid");
const logPath = join(userDir, "rssany.log");
const port = Number(process.env.PORT) || 18473;
const serverOrigin = `http://127.0.0.1:${port}`;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPid() {
  try {
    const raw = await readFile(pidPath, "utf-8");
    const pid = Number(raw.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLanUrl() {
  const lanIp = Object.values(networkInterfaces())
    .flat()
    .find((iface) => iface?.family === "IPv4" && !iface.internal)?.address;
  return lanIp ? `http://${lanIp}:${port}/` : null;
}

function printAddress(prefix = "RssAny 已启动") {
  console.log(`${prefix}: http://127.0.0.1:${port}/`);
  const lanUrl = getLanUrl();
  if (lanUrl) console.log(`局域网访问: ${lanUrl}`);
}

function printUsage() {
  console.log("用法: rssany <start|stop|reset|crawl>");
  console.log("  rssany start  后台启动服务并输出访问地址");
  console.log("  rssany stop   关闭后台服务并输出执行状态");
  console.log("  rssany reset  重置本地数据");
  console.log("  rssany crawl <ref>  按内部抓取链路拉取指定信源");
}

async function canConnectToServer() {
  return new Promise((resolve) => {
    const req = http.get(`${serverOrigin}/api/server-info`, (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForServer(timeoutMs = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await canConnectToServer()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function start() {
  await mkdir(userDir, { recursive: true });

  const currentPid = await readPid();
  if (currentPid && isProcessRunning(currentPid)) {
    printAddress(`RssAny 已在运行 (pid ${currentPid})`);
    return;
  }

  const entry = join(packageRoot, "dist", "index.js");
  if (!(await pathExists(entry))) {
    console.error("未找到 dist/index.js，请先构建项目或重新安装 rssany。");
    process.exitCode = 1;
    return;
  }

  const logFd = openSync(logPath, "a");
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    detached: true,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);

  await writeFile(pidPath, `${child.pid}\n`, "utf-8");
  console.log(`日志: ${logPath}`);
  if (await waitForServer()) {
    child.unref();
    printAddress(`RssAny 已启动 (pid ${child.pid})`);
    return;
  }

  child.unref();
  console.error(`RssAny 启动未完成，请查看日志: ${logPath}`);
  process.exitCode = 1;
}

async function stop() {
  const pid = await readPid();
  if (!pid) {
    console.log("RssAny 未运行：没有找到 pid 文件。");
    return;
  }

  if (!isProcessRunning(pid)) {
    await rm(pidPath, { force: true });
    console.log(`RssAny 未运行：已清理失效 pid ${pid}。`);
    return;
  }

  process.kill(pid, "SIGTERM");
  await rm(pidPath, { force: true });
  console.log(`RssAny 已发送停止信号 (pid ${pid})。`);
}

function readCrawlRef(args) {
  const refFlagIndex = args.findIndex((arg) => arg === "--ref");
  if (refFlagIndex >= 0) return args[refFlagIndex + 1]?.trim() || "";
  const refEquals = args.find((arg) => arg.startsWith("--ref="));
  if (refEquals) return refEquals.slice("--ref=".length).trim();
  return args.find((arg) => !arg.startsWith("-"))?.trim() || "";
}

async function postJson(path, body) {
  const res = await fetch(`${serverOrigin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function getJson(path) {
  const res = await fetch(`${serverOrigin}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function pollTask(taskId, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await getJson(`/api/tasks/${encodeURIComponent(taskId)}`);
    if (task.status === "done") return task;
    if (task.status === "error") {
      throw new Error(task.error || "抓取失败");
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error("抓取超时");
}

async function crawl() {
  const ref = readCrawlRef(process.argv.slice(3));
  if (!ref) {
    console.error("ref 不能为空。用法: rssany crawl <ref>");
    process.exitCode = 1;
    return;
  }
  if (!(await canConnectToServer())) {
    console.error(`RssAny 服务未运行，请先执行 rssany start。目标: ${serverOrigin}`);
    process.exitCode = 1;
    return;
  }
  try {
    const { taskId } = await postJson("/api/tasks", { type: "source-pull", ref });
    if (!taskId) throw new Error("后端未返回 taskId");
    console.log(`crawl 已提交: ${ref}`);
    console.log(`task: ${taskId}`);
    await pollTask(taskId);
    console.log("crawl 完成");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

if (command === "reset") {
  await import(new URL("../scripts/reset.mjs", import.meta.url));
} else if (command === "start") {
  await start();
} else if (command === "stop") {
  await stop();
} else if (command === "crawl") {
  await crawl();
} else {
  printUsage();
  if (command) process.exitCode = 1;
}
