import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtures = [];

async function fixture(serverCode) {
  const root = await mkdtemp(join(tmpdir(), "rssany-start-test-"));
  const userDir = join(root, "user-data");
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const entry = { root, userDir, port };
  fixtures.push(entry);
  await Promise.all(["bin", "dist", "scripts", "user-data", "node_modules"].map((dir) => mkdir(join(root, dir))));
  await Promise.all([
    copyFile(join(repoRoot, "bin", "rssany.js"), join(root, "bin", "rssany.js")),
    copyFile(join(repoRoot, "scripts", "user-dir.mjs"), join(root, "scripts", "user-dir.mjs")),
    writeFile(join(root, "package.json"), JSON.stringify({ type: "module", version: "1.2.3" })),
    writeFile(join(root, "dist", "index.js"), serverCode),
    symlink(join(repoRoot, "node_modules", "dotenv"), join(root, "node_modules", "dotenv"), process.platform === "win32" ? "junction" : "dir"),
  ]);
  return entry;
}

function runCli(entry, args = ["start"], options = {}) {
  const started = Date.now();
  const env = { ...process.env, PORT: String(entry.port), RSSANY_USER_DIR: entry.userDir, ...options.env };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(entry.root, "bin", "rssany.js"), ...args], {
      cwd: options.cwd ?? repoRoot,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr, elapsed: Date.now() - started }));
  });
}

function serverCode({ delay = 0, status = 200, body = "JSON.stringify({ port, pid: process.pid })" } = {}) {
  return `
    import http from 'node:http';
    const port = Number(process.env.PORT);
    setTimeout(() => {
      http.createServer((_req, res) => {
        res.writeHead(${status}, { 'Content-Type': 'application/json' });
        res.end(${body});
      }).listen(port, '127.0.0.1');
    }, ${delay});
  `;
}

afterEach(async () => {
  for (const entry of fixtures.splice(0)) {
    try {
      const pid = Number((await readFile(join(entry.userDir, "rssany.pid"), "utf-8")).trim());
      process.kill(pid);
      for (let index = 0; index < 50; index += 1) {
        try { process.kill(pid, 0); } catch { break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } catch {
      // Failed starts have no managed process or PID file left.
    }
    await rm(entry.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe("rssany start readiness", () => {
  it("confirms a fast server and reports it healthy on status", async () => {
    const entry = await fixture(serverCode());
    const result = await runCli(entry);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny 已启动");
    expect(result.stderr).toBe("");
    const status = await runCli(entry, ["status"]);
    expect(status.stdout).toContain("RssAny: 运行中");
    const again = await runCli(entry);
    expect(again.stdout).toContain("RssAny 已在运行");
  });

  it("returns successfully while a slow server continues starting, then becomes healthy", async () => {
    const entry = await fixture(serverCode({ delay: 4_000 }));
    const result = await runCli(entry);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny 正在后台启动或尚未就绪");
    expect(result.stdout).toContain(`rssany --user-dir "${entry.userDir}" status`);
    expect(result.stderr).toBe("");
    expect(result.elapsed).toBeLessThan(4_000);
    const pending = await runCli(entry, ["status"]);
    expect(pending.stdout).toContain("RssAny: 启动中或未就绪");
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const ready = await runCli(entry, ["status"]);
    expect(ready.stdout).toContain("RssAny: 运行中");
  }, 8_000);

  it("reports an immediate crash promptly with its exit code and clears the PID file", async () => {
    const entry = await fixture("console.error('fixture startup failure'); process.exit(7);");
    const result = await runCli(entry);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("RssAny 启动失败 (退出码 7)");
    expect(result.elapsed).toBeLessThan(2_000);
    await expect(readFile(join(entry.userDir, "rssany.pid"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["HTTP errors", { status: 500 }],
    ["invalid JSON", { body: "'not-json'" }],
    ["a different port", { body: "JSON.stringify({ port: port + 1 })" }],
    ["another process", { body: "JSON.stringify({ port, pid: process.pid + 1 })" }],
  ])("does not mark %s as healthy", async (_label, response) => {
    const entry = await fixture(serverCode(response));
    const result = await runCli(entry);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny 正在后台启动或尚未就绪");
    expect(result.stdout).not.toContain("RssAny 已启动");
    const status = await runCli(entry, ["status"]);
    expect(status.stdout).toContain("RssAny: 启动中或未就绪");
  }, 6_000);

  it("recognizes a running server from before the pid field was added", async () => {
    const entry = await fixture(serverCode({ body: "JSON.stringify({ port, lanUrl: null })" }));
    const result = await runCli(entry);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny 已启动");
  });

  it("bounds probes when an HTTP peer never finishes its response", async () => {
    const entry = await fixture(`
      import http from 'node:http';
      http.createServer((_req, res) => {
        res.writeHead(200);
        res.write('{');
      }).listen(Number(process.env.PORT), '127.0.0.1');
    `);
    const result = await runCli(entry);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny 正在后台启动或尚未就绪");
    expect(result.elapsed).toBeLessThan(4_500);
  }, 6_000);

  it("loads cwd .env before resolving the port and absolute user directory", async () => {
    const entry = await fixture(`
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      writeFileSync(join(process.env.RSSANY_USER_DIR, 'child-env.json'), JSON.stringify({
        port: process.env.PORT, userDir: process.env.RSSANY_USER_DIR
      }));
      ${serverCode()}
    `);
    entry.userDir = join(entry.root, "env data");
    await writeFile(join(entry.root, ".env"), `PORT=${entry.port}\nRSSANY_USER_DIR="./env data"\n`);
    const options = { cwd: entry.root, env: { PORT: undefined, RSSANY_USER_DIR: undefined } };
    const result = await runCli(entry, ["start"], options);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`http://127.0.0.1:${entry.port}/`);
    const childEnv = JSON.parse(await readFile(join(entry.userDir, "child-env.json"), "utf-8"));
    expect(childEnv).toEqual({ port: String(entry.port), userDir: entry.userDir });
    const status = await runCli(entry, ["status"], options);
    expect(status.stdout).toContain("RssAny: 运行中");
  });

  it("preserves explicit environment values over cwd .env", async () => {
    const entry = await fixture(serverCode());
    await writeFile(join(entry.root, ".env"), "PORT=invalid\nRSSANY_USER_DIR=./ignored-data\n");
    const result = await runCli(entry, ["start"], { cwd: entry.root });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`http://127.0.0.1:${entry.port}/`);
    await expect(readFile(join(entry.userDir, "rssany.pid"), "utf-8")).resolves.toMatch(/^\d+\n$/);
    await expect(readFile(join(entry.root, "ignored-data", "rssany.pid"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("prioritizes a CLI user directory over both environment and .env", async () => {
    const entry = await fixture(serverCode());
    const envDir = entry.userDir;
    entry.userDir = join(entry.root, "cli data");
    await writeFile(join(entry.root, ".env"), "RSSANY_USER_DIR=./ignored-data\n");
    const result = await runCli(entry, ["--user-dir", "./cli data", "start"], {
      cwd: entry.root, env: { RSSANY_USER_DIR: envDir },
    });
    expect(result.code).toBe(0);
    await expect(readFile(join(entry.userDir, "rssany.pid"), "utf-8")).resolves.toMatch(/^\d+\n$/);
    await expect(readFile(join(envDir, "rssany.pid"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["--help", "-h", "help", "--version", "-v"])("handles %s without starting a backend", async (arg) => {
    const entry = await fixture("throw new Error('help and version must not launch this');");
    const result = await runCli(entry, [arg], { env: { PORT: "invalid" } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(arg === "--version" || arg === "-v" ? "1.2.3" : "用法: rssany");
    expect(result.stderr).toBe("");
    await expect(readFile(join(entry.userDir, "rssany.pid"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["0", "-1", "65536", "1.5", "abc", "1e3"])("rejects invalid PORT=%s before spawning", async (port) => {
    const entry = await fixture("throw new Error('invalid ports must not launch this');");
    const result = await runCli(entry, ["start"], { env: { PORT: port } });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PORT 必须是 1 到 65535 的整数");
    await expect(readFile(join(entry.userDir, "rssany.pid"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a missing --user-dir value before another option", async () => {
    const entry = await fixture("throw new Error('invalid arguments must not launch this');");
    const result = await runCli(entry, ["--user-dir", "--help"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--user-dir 需要提供目录路径");
  });

  it("allows a directory name that is also a command name", async () => {
    const entry = await fixture("throw new Error('status must not launch this');");
    const result = await runCli(entry, ["--user-dir", "start", "status"], { cwd: entry.root });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny: 未运行");
  });

  it("serializes concurrent starts only until the single backend PID is registered", async () => {
    const entry = await fixture(`
      import { appendFileSync } from 'node:fs';
      import { join } from 'node:path';
      appendFileSync(join(process.env.RSSANY_USER_DIR, 'launches.txt'), process.pid + '\\n');
      ${serverCode({ delay: 750 })}
    `);
    const results = await Promise.all([runCli(entry), runCli(entry)]);
    expect(results.map((result) => result.code)).toEqual([0, 0]);
    expect(Math.min(...results.map((result) => result.elapsed))).toBeLessThan(750);
    const pid = (await readFile(join(entry.userDir, "rssany.pid"), "utf-8")).trim();
    const launches = (await readFile(join(entry.userDir, "launches.txt"), "utf-8")).trim().split("\n");
    expect(launches).toEqual([pid]);
    const status = await runCli(entry, ["status"]);
    expect(status.stdout).toContain(`RssAny: 运行中 (pid ${pid})`);
    await expect(readFile(join(entry.userDir, "rssany.start.lock"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers a startup lock whose recorded owner has exited", async () => {
    const entry = await fixture(serverCode());
    const owner = spawn(process.execPath, ["-e", ""], { stdio: "ignore", windowsHide: true });
    await new Promise((resolve) => owner.on("close", resolve));
    await writeFile(join(entry.userDir, "rssany.start.lock"), JSON.stringify({ pid: owner.pid, token: "stale-owner" }));
    const result = await runCli(entry);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny 已启动");
  });
});
