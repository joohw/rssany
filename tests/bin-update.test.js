import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const binPath = join(repoRoot, "bin", "rssany.js");

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
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

describe("rssany update", () => {
  it("installs the latest npm package and does not restart when no pid is running", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rssany-update-test-"));
    const fakeNpm = join(dir, process.platform === "win32" ? "fake-npm.cmd" : "fake-npm");
    const logPath = join(dir, "npm-args.txt");
    if (process.platform === "win32") {
      await writeFile(fakeNpm, ["@echo off", "echo %* > \"" + logPath + "\""].join("\n") + "\n", "utf-8");
    } else {
      await writeFile(fakeNpm, ["#!/bin/sh", "printf '%s\n' \"" + String.fromCharCode(36) + "*\" > '" + logPath + "'"].join("\n") + "\n", "utf-8");
      await chmod(fakeNpm, 0o755);
    }

    const result = await runNode([binPath, "update"], {
      RSSANY_USER_DIR: dir,
      RSSANY_UPDATE_NPM_CMD: fakeNpm,
    });

    expect(result.code).toBe(0);
    await expect(readFile(logPath, "utf-8")).resolves.toContain("install -g rssany@latest");
    expect(result.stdout).toContain("RssAny 更新完成");
    expect(result.stdout).not.toContain("重新启动");
  });
});
