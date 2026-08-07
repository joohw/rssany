import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../packageRoot.js";
import { buildZip, type ZipEntry } from "./zip.js";

const SKILL_RELATIVE_PATHS = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/architecture.md",
  "references/configuration.md",
  "references/http-api.md",
  "references/installation.md",
  "references/mcp.md",
  "references/operations.md",
  "references/plugins.md",
  "references/troubleshooting.md",
] as const;

export interface RssAnySkillFile {
  path: string;
  content: Buffer;
}

export interface RssAnySkillBundle {
  name: "rssany";
  description: string;
  skill: string;
  files: RssAnySkillFile[];
}

const SKILL_ROOT = join(PACKAGE_ROOT, "skills", "rssany");

function frontmatterDescription(skill: string): string {
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
  return frontmatter.match(/^description:\s*(.+)$/mu)?.[1]?.trim() ?? "RssAny Agent skill";
}

export async function loadRssAnySkill(): Promise<RssAnySkillBundle> {
  const files = await Promise.all(
    SKILL_RELATIVE_PATHS.map(async (path) => ({
      path,
      content: await readFile(join(SKILL_ROOT, ...path.split("/"))),
    })),
  );
  const skill = files.find((file) => file.path === "SKILL.md")!.content.toString("utf8");
  return {
    name: "rssany",
    description: frontmatterDescription(skill),
    skill,
    files,
  };
}

export function buildRssAnySkillZip(bundle: RssAnySkillBundle): Buffer {
  const entries: ZipEntry[] = bundle.files.map((file) => ({
    path: `rssany/${file.path}`,
    content: file.content,
  }));
  return buildZip(entries);
}
