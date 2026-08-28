import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runManagementScenario(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { access, readFile } from "node:fs/promises";
      import { join } from "node:path";
      import {
        BUILTIN_COLLECTORS_DIR,
        BUILTIN_COLLECTORS_SEED_MARKER_PATH,
        USER_COLLECTORS_DIR,
        initUserDir,
      } from "./app/config/paths.ts";
      import { initCollectors } from "./app/scraper/sources/index.ts";
      import { Hono } from "hono";
      import { registerCollectorsRoutes } from "./app/router/routes/api/collectors.ts";
      import {
        deleteManagedCollector,
        listManagedCollectors,
        readManagedCollector,
        writeManagedCollector,
      } from "./app/collectors/management.ts";

      const source = (name) => \`
        export const id = "collector-management-test";
        export const name = "\${name}";
        export const listUrlPattern = "https://example.com/*";
        export async function fetchItems() { return []; }
      \`;

      const packagedRssPath = join(BUILTIN_COLLECTORS_DIR, "rss.rssany.js");
      const packagedRssBefore = await readFile(packagedRssPath, "utf-8");
      await initUserDir();
      await initCollectors();
      const seedMarker = JSON.parse(await readFile(BUILTIN_COLLECTORS_SEED_MARKER_PATH, "utf-8"));
      const created = await writeManagedCollector("collector-management-test", source("first"));
      const updated = await writeManagedCollector("collector-management-test", source("second"));
      const read = await readManagedCollector("collector-management-test");
      const listed = listManagedCollectors().find((collector) => collector.id === "collector-management-test");

      let invalidStatus = null;
      try {
        await writeManagedCollector(
          "collector-management-test",
          'export const id = "wrong-id"; export async function fetchItems() { return []; }',
        );
      } catch (error) {
        invalidStatus = error.status ?? null;
      }
      const afterRollback = await readManagedCollector("collector-management-test");
      const deleted = await deleteManagedCollector("collector-management-test");

      const seededBefore = await readManagedCollector("__rss__");
      const editableSeedSource = \`
        export const id = "__rss__";
        export const name = "RSS editable copy";
        export const pattern = /^https:\\\\/\\\\//;
        export async function fetchItems() { return []; }
      \`;
      await writeManagedCollector("__rss__", editableSeedSource);
      await initUserDir();
      await initCollectors();
      const seededAfterReinitialization = await readManagedCollector("__rss__");
      const seededDelete = await deleteManagedCollector("__rss__");
      await initUserDir();
      await initCollectors();
      let seededRestoredAfterDelete = true;
      try {
        await readManagedCollector("__rss__");
      } catch (error) {
        seededRestoredAfterDelete = error.status !== 404;
      }
      const packagedRssAfter = await readFile(packagedRssPath, "utf-8");
      const markerStillExists = await access(BUILTIN_COLLECTORS_SEED_MARKER_PATH).then(() => true, () => false);

      const app = new Hono();
      registerCollectorsRoutes(app);
      const apiId = "collector-api-test";
      const apiCreateResponse = await app.request("/api/collectors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: apiId, listUrlPattern: "https://api.example.com/*" }),
      });
      const apiCreate = await apiCreateResponse.json();
      const apiReadResponse = await app.request("/api/collectors/" + apiId);
      const apiRead = await apiReadResponse.json();
      const apiUpdateResponse = await app.request("/api/collectors/" + apiId, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: apiRead.content.replace(
            'export const name = "collector-api-test";',
            'export const name = "Collector API updated";',
          ),
        }),
      });
      const apiUpdate = await apiUpdateResponse.json();
      const apiDeleteResponse = await app.request("/api/collectors/" + apiId, { method: "DELETE" });
      const apiDelete = await apiDeleteResponse.json();

      process.stdout.write(JSON.stringify({
        created: { scope: created.scope, canDelete: created.canDelete },
        updatedNamePresent: updated.content.includes('"second"'),
        readNamePresent: read.content.includes('"second"'),
        listed,
        invalidStatus,
        rollbackPreserved: afterRollback.content.includes('"second"'),
        deleted,
        seed: {
          markerStillExists,
          availableCount: seedMarker.availableFiles.length,
          rssPathInUserDir: seededBefore.filePath === join(USER_COLLECTORS_DIR, "rss.rssany.js"),
          scope: seededBefore.scope,
          editPreserved: seededAfterReinitialization.content.includes("RSS editable copy"),
          deleteResult: seededDelete,
          restoredAfterDelete: seededRestoredAfterDelete,
          packagedFileUntouched: packagedRssBefore === packagedRssAfter,
        },
        api: {
          createStatus: apiCreateResponse.status,
          createScope: apiCreate.scope,
          readStatus: apiReadResponse.status,
          updateStatus: apiUpdateResponse.status,
          updateReloaded: apiUpdate.content.includes("Collector API updated"),
          deleteStatus: apiDeleteResponse.status,
          deleted: apiDelete.ok,
        },
      }));
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
        reject(new Error(stderr || `采集器管理子进程退出码 ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`无法解析采集器管理结果: ${stdout}\n${stderr}`, { cause: error }));
      }
    });
  });
}

describe("collector management", () => {
  it("creates, hot-reloads, validates, rolls back, and deletes user collectors", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-collector-management-test-"));
    try {
      const result = await runManagementScenario(userDir);
      expect(result).toMatchObject({
        created: { scope: "user", canDelete: true },
        updatedNamePresent: true,
        readNamePresent: true,
        listed: {
          id: "collector-management-test",
          name: "second",
          scope: "user",
          canDelete: true,
        },
        invalidStatus: 422,
        rollbackPreserved: true,
        deleted: {
          ok: true,
          id: "collector-management-test",
          activeScopeAfterDelete: null,
        },
        seed: {
          markerStillExists: true,
          rssPathInUserDir: true,
          scope: "user",
          editPreserved: true,
          deleteResult: {
            ok: true,
            id: "__rss__",
            activeScopeAfterDelete: null,
          },
          restoredAfterDelete: false,
          packagedFileUntouched: true,
        },
        api: {
          createStatus: 200,
          createScope: "user",
          readStatus: 200,
          updateStatus: 200,
          updateReloaded: true,
          deleteStatus: 200,
          deleted: true,
        },
      });
      expect(result.seed.availableCount).toBeGreaterThan(0);
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  }, 15_000);
});
