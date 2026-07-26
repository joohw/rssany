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
});
