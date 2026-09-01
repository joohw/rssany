import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function runExtraRoundTrip(userDir) {
  return new Promise((resolve, reject) => {
    const script = `
      import { getItemById, queryItems, updateItemContent, upsertItems } from "./app/db/index.ts";
      const item = {
        guid: "extra-1",
        title: "Pipeline metadata",
        link: "https://example.com/extra-1",
        pubDate: new Date("2026-09-01T00:00:00.000Z"),
        sourceRef: "https://example.com/feed",
        tags: ["ats:topic:eval"],
        extra: { collector: { rawType: "article" } },
      };
      await upsertItems([item]);
      item.content = "Technical body";
      item.extra = {
        ...item.extra,
        aiTechblog: { contentType: "research", prefilterEligible: true, confidence: 0.82 },
      };
      await updateItemContent(item);
      const byId = await getItemById(item.guid);
      const queried = await queryItems({ tags: ["ats:topic:eval"], limit: 5 });
      process.stdout.write(JSON.stringify({ byId, queried: queried.items[0] }));
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
      if (code !== 0) return reject(new Error(stderr || `extra round-trip child exited ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(new Error(`Unable to parse extra round-trip output: ${stdout}\n${stderr}`, { cause: error })); }
    });
  });
}

describe("item extra persistence", () => {
  it("preserves namespaced pipeline metadata through database queries", async () => {
    const userDir = await mkdtemp(join(tmpdir(), "rssany-db-extra-test-"));
    try {
      const result = await runExtraRoundTrip(userDir);
      const expectedExtra = {
        collector: { rawType: "article" },
        aiTechblog: { contentType: "research", prefilterEligible: true, confidence: 0.82 },
      };
      expect(result.byId).toMatchObject({
        id: "extra-1",
        tags: ["ats:topic:eval"],
        extra: expectedExtra,
      });
      expect(result.queried.extra).toEqual(expectedExtra);
    } finally {
      await rm(userDir, { recursive: true, force: true });
    }
  });
});
