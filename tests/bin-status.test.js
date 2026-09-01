import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const binPath = join(repoRoot, "bin", "rssany.js");

function runRssAny(args, userDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, RSSANY_USER_DIR: userDir },
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

  it("starts by default and reports the gateway status", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-status-test-"));
    await writeFile(join(userDir, "rssany.pid"), `${process.pid}\n`, "utf-8");

    const result = await runRssAny([], userDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RssAny 已在运行 (pid ${process.pid})`);
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
    expect(result.stdout).toContain(`RssAny: 运行中 (pid ${process.pid})`);
    expect(result.stderr).toBe("");
  });

  it("accepts the --dir alias after the command", async () => {
    const envUserDir = await mkdtemp(join(tmpdir(), "rssany-status-env-test-"));
    const cliUserDir = await mkdtemp(join(tmpdir(), "rssany-status-cli-test-"));
    await writeFile(join(cliUserDir, "rssany.pid"), `${process.pid}\n`, "utf-8");

    const result = await runRssAny(["status", `--dir=${cliUserDir}`], envUserDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RssAny: 运行中 (pid ${process.pid})`);
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
