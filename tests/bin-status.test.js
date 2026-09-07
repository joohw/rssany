import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const binPath = join(repoRoot, "bin", "rssany.js");

async function runRssAny(args, userDir) {
  const portProbe = createServer();
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, RSSANY_USER_DIR: userDir, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("rssany status", () => {
  it("reports an unconfigured gateway without starting the service", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-status-test-"));
    const result = await runRssAny(["status"], userDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("RssAny: 未运行");
    expect(result.stdout).toContain("Gateway: 未配置");
    expect(result.stderr).toBe("");
  });

  it("does not claim a live process is ready without a healthy server", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-status-test-"));
    await writeFile(join(userDir, "rssany.pid"), `${process.pid}\n`, "utf-8");

    const result = await runRssAny([], userDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RssAny 正在后台启动或尚未就绪 (pid ${process.pid})`);
    expect(result.stdout).toContain("Gateway: 未配置");
    expect(result.stderr).toBe("");
  });

  it("reports the configured gateway", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-status-test-"));
    await mkdir(userDir, { recursive: true });
    await writeFile(
      join(userDir, "config.json"),
      JSON.stringify({ deliver: { gateway: "https://example.com/api/gateway/" } }),
      "utf-8",
    );

    const result = await runRssAny(["status"], userDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Gateway: 已配置 (https://example.com/api/gateway)");
    expect(result.stderr).toBe("");
  });

  it("accepts a CLI user directory override before the command", async () => {
    const envUserDir = await mkdtemp(join(tmpdir(), "rssany-status-env-test-"));
    const parentDir = await mkdtemp(join(tmpdir(), "rssany-status-cli-test-"));
    const cliUserDir = join(parentDir, "user data");
    await mkdir(cliUserDir, { recursive: true });
    await writeFile(join(cliUserDir, "rssany.pid"), `${process.pid}\n`, "utf-8");

    const result = await runRssAny(["--user-dir", cliUserDir, "status"], envUserDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RssAny: 启动中或未就绪 (pid ${process.pid})`);
    expect(result.stderr).toBe("");
  });

  it("accepts the --dir alias after the command", async () => {
    const envUserDir = await mkdtemp(join(tmpdir(), "rssany-status-env-test-"));
    const cliUserDir = await mkdtemp(join(tmpdir(), "rssany-status-cli-test-"));
    await writeFile(join(cliUserDir, "rssany.pid"), `${process.pid}\n`, "utf-8");

    const result = await runRssAny(["status", `--dir=${cliUserDir}`], envUserDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RssAny: 启动中或未就绪 (pid ${process.pid})`);
    expect(result.stderr).toBe("");
  });

  it("rejects a user directory option without a path", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-status-test-"));
    const result = await runRssAny(["status", "--user-dir"], userDir);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--user-dir 需要提供目录路径");
  });
});
