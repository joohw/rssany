#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDefaultUserDir } from "../scripts/user-dir.mjs";

function parseCliArgs(argv) {
  const remaining = [];
  let userDirOverride = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--user-dir" || arg === "--dir") {
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith("-")) throw new Error(`${arg} 需要提供目录路径。`);
      userDirOverride = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--user-dir=") || arg.startsWith("--dir=")) {
      const value = arg.slice(arg.indexOf("=") + 1).trim();
      if (!value) throw new Error(`${arg.slice(0, arg.indexOf("="))} 需要提供目录路径。`);
      userDirOverride = value;
      continue;
    }
    remaining.push(arg);
  }

  if (userDirOverride) {
    process.env.RSSANY_USER_DIR = resolve(process.cwd(), userDirOverride);
  }
  return remaining;
}

let cliArgs;
try {
  cliArgs = parseCliArgs(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const command = cliArgs[0];
const commandArgs = cliArgs.slice(1);
const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(binDir, "..");

if (command === "help" || cliArgs.includes("--help") || cliArgs.includes("-h")) {
  printUsage();
  process.exit(0);
}
if (cliArgs.includes("--version") || cliArgs.includes("-v")) {
  const { version } = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf-8"));
  console.log(version);
  process.exit(0);
}

function readPort() {
  const raw = process.env.PORT?.trim();
  if (!raw) return 18473;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("PORT 必须是 1 到 65535 的整数。");
  }
  return value;
}

let port;
try {
  port = readPort();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const userDir = resolve(process.cwd(), resolveDefaultUserDir(packageRoot));
// Keep the launcher and backend on the same resolved settings, including .env.
process.env.RSSANY_USER_DIR = userDir;
process.env.PORT = String(port);
const pidPath = join(userDir, "rssany.pid");
const startLockPath = join(userDir, "rssany.start.lock");
const logPath = join(userDir, "rssany.log");
const configPath = join(userDir, "config.json");
const serverOrigin = `http://127.0.0.1:${port}`;
const START_CONFIRM_MS = 3_000;
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
  console.log("用法: rssany [--user-dir <path>] <status|start|stop|reset|crawl|update>");
  console.log("  --user-dir <path>, --dir <path>  指定用户数据目录（优先于 RSSANY_USER_DIR）");
  console.log("  --help, -h     显示帮助");
  console.log("  --version, -v  显示版本");
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
  if (running && await canConnectToServer(pid)) {
    console.log(`RssAny: 运行中 (pid ${pid})`);
    console.log(`访问地址: http://127.0.0.1:${port}/`);
  } else if (running) {
    console.log(`RssAny: 启动中或未就绪 (pid ${pid})`);
    console.log(`日志: ${logPath}`);
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

async function canConnectToServer(expectedPid = null) {
  return new Promise((resolve) => {
    let req;
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req?.destroy();
      resolve(ready);
    };
    // Bound the complete request, including connection and response body reads.
    const timer = setTimeout(() => finish(false), 500);
    try {
      req = http.get(`${serverOrigin}/api/server-info`, (res) => {
        if (res.statusCode !== 200) {
          finish(false);
          return;
        }
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 16_384) finish(false);
        });
        res.on("error", () => finish(false));
        res.on("aborted", () => finish(false));
        res.on("end", () => {
          try {
            const info = JSON.parse(body);
            // A running pre-upgrade server may not expose pid yet. When present,
            // it must identify the managed process, not another RssAny instance.
            finish(info?.port === port && (expectedPid == null || info.pid === undefined || info.pid === expectedPid));
          } catch {
            finish(false);
          }
        });
      });
      req.on("error", () => finish(false));
    } catch {
      finish(false);
    }
  });
}

async function waitForServer(child, getSpawnError) {
  const startTime = Date.now();
  while (Date.now() - startTime < START_CONFIRM_MS) {
    if (getSpawnError() || child.exitCode != null || child.signalCode != null || !isProcessRunning(child.pid)) return "exited";
    const ready = await canConnectToServer(child.pid);
    if (getSpawnError() || child.exitCode != null || child.signalCode != null || !isProcessRunning(child.pid)) return "exited";
    if (ready) return "ready";
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (getSpawnError() || child.exitCode != null || child.signalCode != null || !isProcessRunning(child.pid)) return "exited";
  return "starting";
}

function printStarting(pid) {
  console.log(`RssAny 正在后台启动或尚未就绪 (pid ${pid})。`);
  console.log(`日志: ${logPath}`);
  console.log(`查看状态: rssany --user-dir "${userDir}" status`);
}

async function acquireStartLock() {
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  const ownerPath = `${startLockPath}.${randomUUID()}.tmp`;
  // Publish a complete owner record atomically; contenders never see an empty lock.
  await writeFile(ownerPath, owner, { encoding: "utf-8", flag: "wx" });
  const started = Date.now();
  try {
    while (Date.now() - started < 5_000) {
      try {
        await link(ownerPath, startLockPath);
        return async () => {
          if (await readFile(startLockPath, "utf-8").catch(() => null) === owner) {
            await rm(startLockPath, { force: true });
          }
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw new Error(`无法获取启动锁: ${error.message}`);
      }
      const previous = await readFile(startLockPath, "utf-8").catch(() => null);
      try {
        const previousOwner = JSON.parse(previous);
        if (Number.isInteger(previousOwner?.pid) && previousOwner.pid > 0 && !isProcessRunning(previousOwner.pid)) {
          if (await readFile(startLockPath, "utf-8").catch(() => null) === previous) {
            await rm(startLockPath, { force: true });
          }
        }
      } catch {
        // An unreadable owner is not evidence that the lock can be removed.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`另一个启动命令正在使用启动锁，请稍后重试。锁文件: ${startLockPath}`);
  } finally {
    await rm(ownerPath, { force: true });
  }
}

async function startManagedServer() {
  await mkdir(userDir, { recursive: true });
  const releaseStartLock = await acquireStartLock();
  let currentPid = null;
  let child;
  let spawnError = null;
  let didSpawn = false;
  try {
    const recordedPid = await readPid();
    if (recordedPid && isProcessRunning(recordedPid)) {
      currentPid = recordedPid;
    } else {
      const entry = join(packageRoot, "dist", "index.js");
      if (!(await pathExists(entry))) {
        throw new Error("未找到 dist/index.js，请先构建项目或重新安装 rssany。");
      }
      const logFd = openSync(logPath, "a");
      let spawned;
      try {
        child = spawn(process.execPath, [entry], {
          cwd: process.cwd(),
          detached: true,
          windowsHide: true,
          env: process.env,
          stdio: ["ignore", logFd, logFd],
        });
        spawned = new Promise((resolve) => {
          child.once("spawn", () => resolve(true));
          child.on("error", (error) => {
            spawnError = error;
            resolve(false);
          });
        });
      } finally {
        closeSync(logFd);
      }
      didSpawn = await spawned;
      // HTTP/file operations and polling timers keep the confirmation work alive.
      // The background server must not keep the CLI open if later cleanup fails.
      child.unref();
      if (didSpawn) {
        try {
          await writeFile(pidPath, `${child.pid}\n`, "utf-8");
        } catch (error) {
          try {
            child.kill("SIGKILL");
            if (!(await waitForProcessExit(child.pid, FORCE_STOP_TIMEOUT_MS))) {
              throw new Error(`无法登记 PID，且无法停止本次后台进程 (pid ${child.pid})。`);
            }
          } finally {
            child.unref();
          }
          throw new Error(`无法登记后台进程 PID，已停止本次启动: ${error.message}`);
        }
      }
    }
  } finally {
    // Readiness probing is outside the lock; concurrent commands can read the PID.
    await releaseStartLock();
  }

  if (currentPid) {
    if (await canConnectToServer(currentPid)) {
      printAddress(`RssAny 已在运行 (pid ${currentPid})`);
    } else {
      printStarting(currentPid);
    }
    return;
  }
  const result = didSpawn ? await waitForServer(child, () => spawnError) : "exited";
  child.unref();
  if (result === "ready") {
    printAddress(`RssAny 已启动 (pid ${child.pid})`);
    console.log(`日志: ${logPath}`);
    return;
  }

  if (result === "starting") {
    printStarting(child.pid);
    return;
  }

  if (child.pid != null) {
    const releasePidLock = await acquireStartLock();
    try {
      if (await readPid() === child.pid) await rm(pidPath, { force: true });
    } finally {
      await releasePidLock();
    }
  }
  const reason = spawnError?.message
    ?? (child.signalCode ? `信号 ${child.signalCode}` : `退出码 ${child.exitCode ?? "未知"}`);
  console.error(`RssAny 启动失败 (${reason})，请查看日志: ${logPath}`);
  process.exitCode = 1;
}

async function start() {
  try {
    await startManagedServer();
  } catch (error) {
    console.error(`RssAny 启动失败: ${error.message}`);
    process.exitCode = 1;
  }
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
  const ref = readCrawlRef(commandArgs);
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
  const restartDisabled = commandArgs.includes("--no-restart");
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
