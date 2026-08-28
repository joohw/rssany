import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runScriptBackupRoundTrip(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { initUserDir } from "./app/config/paths.ts";
      import {
        createPipelinesBackup,
        createPluginsBackup,
        importPipelinesBackup,
        importPluginsBackup,
      } from "./app/backup/index.ts";

      await initUserDir();
      const pluginContent = [
        'export const id = "backup-plugin";',
        'export const name = "Backup Plugin";',
        'export const pattern = /^backup:/;',
        'export async function fetchItems() { return []; }',
      ].join("\\n");
      const pipelineContent = [
        'export default {',
        '  id: "backup-pipeline",',
        '  name: "Backup Pipeline",',
        '  process(item) { return { ...item, title: "restored:" + item.title }; },',
        '};',
      ].join("\\n");

      const pluginResult = await importPluginsBackup({
        format: "rssany-plugins-backup",
        schemaVersion: 1,
        exportedAt: "2026-08-28T00:00:00.000Z",
        plugins: [{ id: "backup-plugin", fileName: "backup-plugin.rssany.ts", content: pluginContent }],
      }, "replace");
      const exportedPlugins = await createPluginsBackup();

      const pipelineResult = await importPipelinesBackup({
        format: "rssany-pipelines-backup",
        schemaVersion: 1,
        exportedAt: "2026-08-28T00:00:00.000Z",
        pipelines: [{ id: "backup-pipeline", fileName: "backup-pipeline.rssany.js", content: pipelineContent }],
        steps: [{ id: "tagger" }, { id: "backup-pipeline" }],
      }, "replace");
      const exportedPipelines = await createPipelinesBackup();

      process.stdout.write(JSON.stringify({ pluginResult, exportedPlugins, pipelineResult, exportedPipelines }));
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
      if (code !== 0) return reject(new Error(stderr || `脚本备份测试子进程退出码 ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(new Error(`无法解析脚本备份测试结果: ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

describe("plugin and Pipeline backups", () => {
  it("round-trips executable sources and Pipeline step order", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-script-backup-test-"));
    try {
      const result = await runScriptBackupRoundTrip(userDir);
      expect(result.pluginResult).toMatchObject({ mode: "replace", plugins: 1 });
      expect(result.exportedPlugins).toMatchObject({
        format: "rssany-plugins-backup",
        plugins: [{ id: "backup-plugin", fileName: "backup-plugin.rssany.ts" }],
      });
      expect(result.exportedPlugins.plugins[0].content).toContain('id = "backup-plugin"');
      expect(result.pipelineResult).toMatchObject({ mode: "replace", pipelines: 1, steps: 2 });
      expect(result.exportedPipelines).toMatchObject({
        format: "rssany-pipelines-backup",
        pipelines: [{ id: "backup-pipeline", fileName: "backup-pipeline.rssany.js" }],
        steps: [{ id: "tagger" }, { id: "backup-pipeline" }],
      });
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  }, 20_000);
});
