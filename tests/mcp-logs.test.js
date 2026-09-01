import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runMcpLogsScenario(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { insertLog } from "./app/db/index.ts";
      import { callMcpTool, listMcpTools } from "./app/mcp/tools.ts";

      await insertLog({ level: "info", category: "scheduler", message: "started", payload: { source: "one" }, created_at: "2026-08-28T01:00:00.000Z" });
      await insertLog({ level: "error", category: "collector", message: "failed", payload: { source: "two" }, created_at: "2026-08-28T02:00:00.000Z" });
      const queried = await callMcpTool("query_logs", {
        level: "error",
        since: "2026-08-28T00:00:00.000Z",
        until: "2026-08-29T00:00:00.000Z",
        limit: 10,
      });
      const invalid = await callMcpTool("query_logs", { level: "fatal" });
      process.stdout.write(JSON.stringify({
        tool: listMcpTools().find((entry) => entry.name === "query_logs"),
        queried: JSON.parse(queried.content[0].text),
        invalid,
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
      if (code !== 0) return reject(new Error(stderr || `MCP 日志测试子进程退出码 ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(new Error(`无法解析 MCP 日志测试结果: ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

describe("MCP query_logs", () => {
  it("advertises and filters local runtime logs", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-mcp-logs-test-"));
    try {
      const result = await runMcpLogsScenario(userDir);
      expect(result.tool).toMatchObject({
        name: "query_logs",
        annotations: { readOnlyHint: true, destructiveHint: false },
      });
      expect(result.queried).toMatchObject({
        total: 1,
        logs: [{ level: "error", category: "collector", message: "failed" }],
      });
      expect(result.invalid.isError).toBe(true);
      expect(JSON.parse(result.invalid.content[0].text).error).toContain("level");
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  }, 10_000);
});
