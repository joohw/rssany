import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function migrateAndQuery(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { getDb, queryItems } from "./app/db/index.ts";
      const db = await getDb();
      const columns = db.prepare("PRAGMA table_info(items)").all().map((row) => row.name);
      const result = await queryItems({ limit: 5 });
      process.stdout.write(JSON.stringify({ columns, total: result.total, item: result.items[0] }));
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          RSSANY_USER_DIR: userDir,
          LOG_TO_DB: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `数据库迁移子进程退出码 ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`无法解析数据库迁移结果: ${stdout}\n${stderr}`, { cause: error }));
      }
    });
  });
}

describe("database schema migration", () => {
  it("adds optional item columns before querying an older database", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-db-migration-test-"));
    const dataDir = join(userDir, "data");
    await mkdir(dataDir, { recursive: true });
    const db = new DatabaseSync(join(dataDir, "rssany.db"));
    db.exec(`
      CREATE TABLE items (
        id          TEXT PRIMARY KEY,
        url         TEXT UNIQUE NOT NULL,
        source_url  TEXT NOT NULL,
        title       TEXT,
        author      TEXT,
        summary     TEXT,
        pub_date    TEXT,
        fetched_at  TEXT NOT NULL
      );
      INSERT INTO items (id, url, source_url, title, fetched_at)
      VALUES ('legacy-1', 'https://example.com/1', 'https://example.com/feed', 'Legacy item', '2026-01-01T00:00:00.000Z');
    `);
    db.close();

    try {
      const result = await migrateAndQuery(userDir);
      expect(result.columns).toEqual(expect.arrayContaining([
        "content",
        "image_url",
        "tags",
        "translations",
        "pushed_at",
      ]));
      expect(result).toMatchObject({
        total: 1,
        item: {
          id: "legacy-1",
          title: "Legacy item",
          tags: null,
          translations: null,
        },
      });
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  });
});
