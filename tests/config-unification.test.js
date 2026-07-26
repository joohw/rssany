import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function initializeUserDir(userDir) {
  return new Promise((resolve, reject) => {
    const script = [
      'import { initUserDir } from "./app/config/paths.ts";',
      "await initUserDir();",
    ].join("\n");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: repoRoot,
        env: { ...process.env, RSSANY_USER_DIR: userDir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `初始化子进程退出码 ${code}`));
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("unified config", () => {
  it("merges legacy files into config.json and removes them", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-config-test-"));
    await writeFile(
      join(userDir, "config.json"),
      JSON.stringify({ deliver: { gateway: "https://example.com/gateway" } }),
    );
    await writeFile(join(userDir, "sources.json"), JSON.stringify({ sources: [{ ref: "https://example.com/feed" }] }));
    await writeFile(join(userDir, "sites.json"), JSON.stringify({ sites: { example: { enabled: true } } }));
    await writeFile(join(userDir, "tags.json"), JSON.stringify({ tags: ["AI"] }));

    await initializeUserDir(userDir);

    const config = JSON.parse(await readFile(join(userDir, "config.json"), "utf-8"));
    expect(config).toMatchObject({
      initialized: false,
      sources: [{ ref: "https://example.com/feed" }],
      sites: { example: { enabled: true } },
      tags: ["AI"],
      deliver: { gateway: "https://example.com/gateway" },
    });
    await expect(exists(join(userDir, "sources.json"))).resolves.toBe(false);
    await expect(exists(join(userDir, "sites.json"))).resolves.toBe(false);
    await expect(exists(join(userDir, "tags.json"))).resolves.toBe(false);
  });

  it("ships one default config without proxy settings", async () => {
    const config = JSON.parse(await readFile(join(repoRoot, "app/init/config.json"), "utf-8"));
    expect(config.initialized).toBe(false);
    expect(Array.isArray(config.sources)).toBe(true);
    expect(config.sites).toEqual({});
    expect(config.tags).toEqual([]);
    expect(config.update).toEqual({ autoUpdate: true, autoRestart: true });
    expect(config).not.toHaveProperty("globalProxy");
    expect(config).not.toHaveProperty("proxyList");
    await expect(exists(join(repoRoot, "app/init/sources.json"))).resolves.toBe(false);
  });
});
