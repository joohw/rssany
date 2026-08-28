import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runLogRangeScenario(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { Hono } from "hono";
      import { insertLog, queryLogs } from "./app/db/index.ts";
      import { registerLogsRoutes } from "./app/router/routes/api/logs.ts";

      const entries = [
        ["info", "worker", "before", "2026-07-31T23:59:59.999Z"],
        ["info", "worker", "at-start", "2026-08-01T00:00:00.000Z"],
        ["warn", "scheduler", "inside", "2026-08-01T12:00:00.000Z"],
        ["info", "worker", "at-end", "2026-08-02T00:00:00.000Z"],
      ];
      for (const [level, category, message, created_at] of entries) {
        await insertLog({ level, category, message, created_at });
      }

      const direct = await queryLogs({
        since: new Date("2026-08-01T00:00:00.000Z"),
        until: new Date("2026-08-02T00:00:00.000Z"),
      });

      const app = new Hono();
      registerLogsRoutes(app);
      const apiResponse = await app.request(
        "/api/logs?since=2026-08-01T00%3A00%3A00.000Z&until=2026-08-02T00%3A00%3A00.000Z&level=info&category=WORK",
      );
      const api = await apiResponse.json();
      const invalidSince = await app.request("/api/logs?since=not-a-date");
      const invalidUntil = await app.request("/api/logs?until=not-a-date");
      const reversed = await app.request(
        "/api/logs?since=2026-08-02T00%3A00%3A00.000Z&until=2026-08-01T00%3A00%3A00.000Z",
      );

      process.stdout.write(JSON.stringify({
        direct,
        apiStatus: apiResponse.status,
        api,
        invalidSinceStatus: invalidSince.status,
        invalidUntilStatus: invalidUntil.status,
        reversedStatus: reversed.status,
      }));
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: repoRoot,
      env: { ...process.env, RSSANY_USER_DIR: userDir, LOG_TO_DB: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `日志范围测试子进程退出码 ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(new Error(`无法解析日志范围测试结果: ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

describe("log date range filtering", () => {
  it("uses an inclusive start and exclusive end for one-day ranges", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-logs-range-test-"));
    try {
      const result = await runLogRangeScenario(userDir);
      expect(result.direct.total).toBe(2);
      expect(result.direct.items.map((item) => item.message)).toEqual(["inside", "at-start"]);
      expect(result.apiStatus).toBe(200);
      expect(result.api).toMatchObject({ total: 1, items: [{ message: "at-start" }] });
      expect(result.invalidSinceStatus).toBe(400);
      expect(result.invalidUntilStatus).toBe(400);
      expect(result.reversedStatus).toBe(400);
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  });
});
