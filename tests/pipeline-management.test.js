import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runPipelineScenario(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { Hono } from "hono";
      import { initUserDir } from "./app/config/paths.ts";
      import { registerPipelineRoutes } from "./app/router/routes/api/pipeline.ts";
      import { reloadUserPipelines, runPipeline } from "./app/pipeline/index.ts";

      const app = new Hono();
      registerPipelineRoutes(app);
      const localEnv = { incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 12345, remoteFamily: "IPv4" } } };
      const request = (path, init) => app.request(path, init, localEnv);
      const source = (prefix) => [
        'export default {',
        '  id: "pipeline-api-test",',
        '  name: "API Test Pipeline",',
        '  description: "Pipeline upload integration test",',
        '  async process(item) {',
        '    if (item.title === "drop") return null;',
        '    return { ...item, title: ' + JSON.stringify(prefix) + ' + item.title };',
        '  },',
        '};',
      ].join("\\n");

      await initUserDir();
      await reloadUserPipelines();

      const deniedResponse = await app.request("/api/pipelines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "pipeline-api-test", content: source("first:") }),
      });
      const deniedOriginResponse = await request("/api/pipelines", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://malicious.example" },
        body: JSON.stringify({ id: "pipeline-api-test", content: source("first:") }),
      });
      const validateResponse = await request("/api/pipelines/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "pipeline-api-test", content: source("first:") }),
      });
      const createResponse = await request("/api/pipelines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "pipeline-api-test", content: source("first:") }),
      });
      const created = await createResponse.json();
      const arrangeResponse = await request("/api/pipeline", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ steps: [{ id: "pipeline-api-test" }] }),
      });
      const item = { guid: "keep", title: "keep", link: "https://example.com/keep", pubDate: new Date() };
      const dropItem = { guid: "drop", title: "drop", link: "https://example.com/drop", pubDate: new Date() };
      const processedFirst = await runPipeline(item, {});
      const processedDrop = await runPipeline(dropItem, {});

      const invalidUpdateResponse = await request("/api/pipelines/pipeline-api-test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: 'export default { id: "wrong", name: "Wrong", process(item) { return item; } };' }),
      });
      const afterRollback = await request("/api/pipelines/pipeline-api-test").then((response) => response.json());
      const updateResponse = await request("/api/pipelines/pipeline-api-test", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: source("second:") }),
      });
      const processedSecond = await runPipeline(item, {});
      const pipelineResponse = await request("/api/pipeline");
      const pipelineState = await pipelineResponse.json();
      const deleteResponse = await request("/api/pipelines/pipeline-api-test", { method: "DELETE" });
      const deleted = await deleteResponse.json();
      const afterDeleteState = await request("/api/pipeline").then((response) => response.json());

      process.stdout.write(JSON.stringify({
        deniedStatus: deniedResponse.status,
        deniedOriginStatus: deniedOriginResponse.status,
        validateStatus: validateResponse.status,
        createStatus: createResponse.status,
        created: { id: created.id, name: created.name, scope: created.scope },
        arrangeStatus: arrangeResponse.status,
        firstTitle: processedFirst?.title,
        dropResult: processedDrop,
        invalidUpdateStatus: invalidUpdateResponse.status,
        rollbackPreserved: afterRollback.content.includes('"first:"'),
        updateStatus: updateResponse.status,
        secondTitle: processedSecond?.title,
        listedUserPipeline: pipelineState.available.find((pipeline) => pipeline.id === "pipeline-api-test"),
        arrangedIds: pipelineState.steps.map((step) => step.id),
        deleteStatus: deleteResponse.status,
        deleted,
        arrangedAfterDelete: afterDeleteState.steps.map((step) => step.id),
        availableAfterDelete: afterDeleteState.available.map((pipeline) => pipeline.id),
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
      if (code !== 0) return reject(new Error(stderr || `Pipeline 管理子进程退出码 ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`无法解析 Pipeline 管理结果: ${stdout}\n${stderr}`, { cause: error }));
      }
    });
  });
}

describe("pipeline management", () => {
  it("uploads, validates, runs, updates, rolls back, and deletes a user Pipeline", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-pipeline-management-test-"));
    try {
      const result = await runPipelineScenario(userDir);
      expect(result).toMatchObject({
        deniedStatus: 403,
        deniedOriginStatus: 403,
        validateStatus: 200,
        createStatus: 200,
        created: { id: "pipeline-api-test", name: "API Test Pipeline", scope: "user" },
        arrangeStatus: 200,
        firstTitle: "first:keep",
        dropResult: null,
        invalidUpdateStatus: 422,
        rollbackPreserved: true,
        updateStatus: 200,
        secondTitle: "second:keep",
        listedUserPipeline: { id: "pipeline-api-test", scope: "user", canDelete: true },
        arrangedIds: ["pipeline-api-test"],
        deleteStatus: 200,
        deleted: { ok: true, id: "pipeline-api-test" },
        arrangedAfterDelete: [],
      });
      expect(result.availableAfterDelete).not.toContain("pipeline-api-test");
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  }, 15_000);
});
