import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { registerSkillRoutes } from "../app/router/routes/api/skill.ts";

describe("official RssAny skill API", () => {
  it("returns skill metadata and the canonical SKILL.md", async () => {
    const app = new Hono();
    registerSkillRoutes(app);

    const response = await app.request("/api/skill");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.name).toBe("rssany");
    expect(body.skill).toContain("name: rssany");
    expect(body.downloadUrl).toBe("/api/skill.zip");
    expect(body.files.map((file) => file.path)).toContain("references/mcp.md");
    expect(body.files.map((file) => file.path)).toContain("references/plugins.md");
  });

  it("downloads a valid ZIP containing the complete skill folder", async () => {
    const app = new Hono();
    registerSkillRoutes(app);

    const response = await app.request("/api/skill.zip");
    const archive = Buffer.from(await response.arrayBuffer());
    const names = readStoredZipNames(archive);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("rssany-skill-");
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(names).toContain("rssany/SKILL.md");
    expect(names).toContain("rssany/agents/openai.yaml");
    expect(names).toContain("rssany/references/installation.md");
    expect(names).toContain("rssany/references/troubleshooting.md");
  });
});

function readStoredZipNames(archive) {
  const names = [];
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(archive.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    offset = nameStart + nameLength + extraLength + size;
  }
  return names;
}
