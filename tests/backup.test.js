import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runBackupRoundTrip(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import {
        createItemsBackup,
        createSourcesBackup,
        importItemsBackup,
        importSourcesBackup,
      } from "./app/backup/index.ts";

      const sourceBackup = {
        format: "rssany-sources-backup",
        schemaVersion: 1,
        exportedAt: "2026-08-28T00:00:00.000Z",
        sources: [
          { ref: "https://example.com/feed/", label: "Example", group: ["Tech", "AI"], refresh: "1h", proxyMode: "default" },
          { ref: "https://root.example.com/feed", label: "Root" }
        ]
      };
      const item = {
        id: "item-1",
        url: "https://example.com/items/1",
        source_url: "https://example.com/feed/",
        title: "First",
        author: ["Alice"],
        summary: "Summary",
        content: "<p>Body</p>",
        image_url: "https://example.com/cover.jpg",
        tags: ["news"],
        translations: { "zh-CN": { title: "第一条" } },
        extra: { aiTechblog: { contentType: "research", confidence: 0.82 } },
        pub_date: "2026-08-27T00:00:00.000Z",
        fetched_at: "2026-08-28T00:00:00.000Z",
        pushed_at: "2026-08-28T01:00:00.000Z"
      };
      const itemsBackup = {
        format: "rssany-items-backup",
        schemaVersion: 1,
        exportedAt: "2026-08-28T00:00:00.000Z",
        items: [item]
      };

      const sourceResult = await importSourcesBackup(sourceBackup, "replace");
      const itemResult = await importItemsBackup(itemsBackup, "replace");
      const exportedSources = await createSourcesBackup();
      const exportedItems = await createItemsBackup();
      const mergedItems = await importItemsBackup({
        ...itemsBackup,
        items: [{ ...item, id: "item-2", url: "https://example.com/items/2", title: "Second" }]
      }, "merge");
      const afterMerge = await createItemsBackup();
      process.stdout.write(JSON.stringify({ sourceResult, itemResult, exportedSources, exportedItems, mergedItems, afterMerge }));
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
      if (code !== 0) return reject(new Error(stderr || `备份测试子进程退出码 ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(new Error(`无法解析备份测试结果: ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

describe("independent sources and items backups", () => {
  it("round-trips sources and all item fields independently", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-backup-test-"));
    try {
      const result = await runBackupRoundTrip(userDir);
      expect(result.sourceResult).toMatchObject({ sources: 2 });
      expect(result.itemResult).toMatchObject({ items: 1, insertedItems: 1, updatedItems: 0 });
      expect(result.exportedSources).toMatchObject({
        format: "rssany-sources-backup",
        sources: [
          { ref: "https://example.com/feed", label: "Example", group: ["Tech", "AI"], proxyMode: "default" },
          { ref: "https://root.example.com/feed", label: "Root", group: [], proxyMode: "none" },
        ],
      });
      expect(result.exportedItems.format).toBe("rssany-items-backup");
      expect(result.exportedItems.items[0]).toMatchObject({
        id: "item-1",
        author: ["Alice"],
        content: "<p>Body</p>",
        tags: ["news"],
        translations: { "zh-CN": { title: "第一条" } },
        extra: { aiTechblog: { contentType: "research", confidence: 0.82 } },
        pushed_at: "2026-08-28T01:00:00.000Z",
      });
      expect(result.mergedItems).toMatchObject({ items: 1, insertedItems: 1, updatedItems: 0 });
      expect(result.afterMerge.items).toHaveLength(2);
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  }, 10_000);
});
