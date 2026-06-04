#!/usr/bin/env node
/**
 * 停止占用 HTTP 服务端口的进程，并删除用户数据目录（与 app 中 PORT / RSSANY_USER_DIR 约定一致）。
 * 用法：npm run reset  或  PORT=3000 npm run reset
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: join(process.cwd(), ".env") });

const DEFAULT_PORT = 18473;
const port = Number(process.env.PORT) || DEFAULT_PORT;
const userDirRaw = process.env.RSSANY_USER_DIR?.trim();
const userDir =
  userDirRaw && userDirRaw.length > 0 ? userDirRaw : join(homedir(), ".rssany");

function pidsListeningWin32(p) {
  const cmd = `Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], {
      encoding: "utf8",
      windowsHide: true,
    });
    return [
      ...new Set(
        out
          .trim()
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
  } catch {
    return [];
  }
}

function pidsListeningNetstatWin32(p) {
  const pids = new Set();
  try {
    const out = execFileSync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true });
    const needle = `:${p}`;
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING") || !line.includes(needle)) continue;
      const m = line.trim().match(/LISTENING\s+(\d+)\s*$/);
      if (m) pids.add(Number(m[1]));
    }
  } catch {
    // ignore
  }
  return [...pids];
}

function pidsListeningUnix(p) {
  const argsList = [
    ["-nP", `-iTCP:${p}`, "-sTCP:LISTEN", "-t"],
    ["-ti", `:${p}`],
  ];
  for (const args of argsList) {
    try {
      const out = execFileSync("lsof", args, { encoding: "utf8" });
      const pids = out
        .trim()
        .split(/\n/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (pids.length) return [...new Set(pids)];
    } catch {
      // try next
    }
  }
  return [];
}

function killPidsWin32(pids) {
  for (const pid of pids) {
    if (pid === process.pid) continue;
    try {
      execFileSync("taskkill", ["/F", "/PID", String(pid)], { stdio: "inherit", windowsHide: true });
      console.log(`已结束进程 PID ${pid}`);
    } catch {
      console.warn(`无法结束进程 PID ${pid}（可能已退出）`);
    }
  }
}

function killPidsUnix(pids) {
  for (const pid of pids) {
    if (pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
      console.log(`已发送 SIGTERM 至 PID ${pid}`);
    } catch {
      try {
        process.kill(pid, "SIGKILL");
        console.log(`已发送 SIGKILL 至 PID ${pid}`);
      } catch {
        console.warn(`无法结束进程 PID ${pid}`);
      }
    }
  }
}

function main() {
  console.log(`端口: ${port}（来自 PORT 或默认 ${DEFAULT_PORT}）`);
  console.log(`用户数据目录: ${userDir}`);

  let pids =
    process.platform === "win32" ? pidsListeningWin32(port) : pidsListeningUnix(port);
  if (process.platform === "win32" && pids.length === 0) {
    pids = pidsListeningNetstatWin32(port);
  }

  if (pids.length === 0) {
    console.log("未发现占用该端口的监听进程。");
  } else {
    console.log(`将结束占用端口的进程: ${pids.join(", ")}`);
    if (process.platform === "win32") killPidsWin32(pids);
    else killPidsUnix(pids);
  }

  if (!existsSync(userDir)) {
    console.log("用户数据目录不存在，跳过删除。");
    return;
  }
  rmSync(userDir, { recursive: true, force: true });
  console.log("已删除用户数据目录。");
}

main();
