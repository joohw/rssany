#!/usr/bin/env node
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDefaultUserDir } from "../scripts/user-dir.mjs";

const command = process.argv[2];
const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(binDir, "..");
const userDir = resolveDefaultUserDir(packageRoot);
const pidPath = join(userDir, "rssany.pid");
const logPath = join(userDir, "rssany.log");
const configPath = join(userDir, "config.json");
const port = Number(process.env.PORT) || 18473;
const serverOrigin = `http://127.0.0.1:${port}`;
const START_TIMEOUT_MS = 12_000;
const STOP_TIMEOUT_MS = 15_000;
const FORCE_STOP_TIMEOUT_MS = 5_000;

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

async function waitForProcessExit(pid, timeoutMs) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessRunning(pid);
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
  console.log("用法: rssany <status|start|stop|reset|crawl|update>");
  console.log("  rssany         自动启动服务并输出访问地址与投递 Gateway 状态");
  console.log("  rssany status  只读输出服务与投递 Gateway 状态");
  console.log("  rssany start  后台启动服务并输出访问地址");
  console.log("  rssany stop   关闭后台服务并输出执行状态");
  console.log("  rssany reset  重置本地数据");
  console.log("  rssany crawl <ref>  按内部抓取链路拉取指定信源");
  console.log("  rssany update  更新到最新 npm 包；若服务正在运行则自动停止并重启");
  console.log("  rssany update --no-restart  更新后保持停止状态");
}

async function readGateway() {
  try {
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    const deliver = config?.deliver;
    const gateway = typeof deliver?.gateway === "string" ? deliver.gateway.trim() : "";
    if (gateway) return gateway.replace(/\/+$/, "");

    for (const [key, suffix] of [
      ["url", "items"],
      ["sourcesUrl", "sources"],
    ]) {
      const legacyUrl = typeof deliver?.[key] === "string" ? deliver[key].trim() : "";
      if (legacyUrl) {
        return legacyUrl
          .replace(new RegExp(`/${suffix}/?$`, "i"), "")
          .replace(/\/+$/, "");
      }
    }
  } catch {
    // 配置文件不存在或格式无效时视为未配置。
  }
  return "";
}

async function status() {
  const pid = await readPid();
  const running = pid != null && isProcessRunning(pid);
  if (running) {
    console.log(`RssAny: 运行中 (pid ${pid})`);
    console.log(`访问地址: http://127.0.0.1:${port}/`);
  } else {
    console.log("RssAny: 未运行");
    if (pid != null) console.log(`PID 文件已失效: ${pid}`);
  }

  await printGatewayStatus();
}

async function printGatewayStatus() {
  const gateway = await readGateway();
  console.log(gateway ? `Gateway: 已配置 (${gateway})` : "Gateway: 未配置");
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

async function waitForServer(timeoutMs = START_TIMEOUT_MS) {
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
  console.log(`正在停止 RssAny (pid ${pid})...`);
  if (!(await waitForProcessExit(pid, STOP_TIMEOUT_MS))) {
    console.warn(`RssAny 未在 ${STOP_TIMEOUT_MS / 1000} 秒内退出，正在强制停止...`);
    process.kill(pid, "SIGKILL");
    if (!(await waitForProcessExit(pid, FORCE_STOP_TIMEOUT_MS))) {
      throw new Error(`无法停止 RssAny (pid ${pid})，更新已中止。`);
    }
  }
  await rm(pidPath, { force: true });
  console.log(`RssAny 已停止 (pid ${pid})。`);
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

async function runCommand(commandName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(commandName + " " + args.join(" ") + " 失败，退出码 " + (code ?? "unknown")));
    });
  });
}

async function update() {
  await mkdir(userDir, { recursive: true });
  const pid = await readPid();
  const restartDisabled = process.argv.slice(3).includes("--no-restart");
  const shouldRestart = !restartDisabled && pid != null && isProcessRunning(pid);
  const shouldStop = pid != null && isProcessRunning(pid);

  if (shouldStop) {
    console.log("RssAny 正在运行 (pid " + pid + ")，先停止服务...");
    try {
      await stop();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
  } else if (pid != null) {
    await rm(pidPath, { force: true });
  }

  const npmCommand = process.env.RSSANY_UPDATE_NPM_CMD?.trim() || (process.platform === "win32" ? "npm.cmd" : "npm");
  console.log("正在更新 RssAny: npm install -g rssany@latest");
  try {
    await runCommand(npmCommand, ["install", "-g", "rssany@latest"]);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  console.log("RssAny 更新完成。");
  if (shouldRestart) {
    console.log("重新启动 RssAny...");
    await start();
  } else if (shouldStop) {
    console.log("自动重启已关闭，请手动执行 rssany start。");
  }
}

if (!command) {
  await start();
  await printGatewayStatus();
} else if (command === "status") {
  await status();
} else if (command === "reset") {
  await import(new URL("../scripts/reset.mjs", import.meta.url));
} else if (command === "start") {
  await start();
} else if (command === "stop") {
  await stop();
} else if (command === "crawl") {
  await crawl();
} else if (command === "update") {
  await update();
} else {
  printUsage();
  process.exitCode = 1;
}
