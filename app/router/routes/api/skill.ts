import type { Hono } from "hono";
import { getAppVersion } from "../../../version.js";
import { buildRssAnySkillZip, loadRssAnySkill } from "../../../skill/index.js";

export function registerSkillRoutes(app: Hono): void {
  app.get("/api/skill", async (c) => {
    const bundle = await loadRssAnySkill();
    return c.json({
      name: bundle.name,
      version: getAppVersion(),
      description: bundle.description,
      skill: bundle.skill,
      files: bundle.files.map((file) => ({ path: file.path, size: file.content.length })),
      downloadUrl: "/api/skill.zip",
    });
  });

  app.get("/api/skill.zip", async (c) => {
    const bundle = await loadRssAnySkill();
    const archive = buildRssAnySkillZip(bundle);
    const version = getAppVersion();
    return c.body(new Uint8Array(archive), 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="rssany-skill-${version}.zip"`,
      "Content-Length": String(archive.length),
      "Cache-Control": "no-cache",
    });
  });
}
