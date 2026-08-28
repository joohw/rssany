import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../packageRoot.js";
import { buildZip, type ZipEntry } from "./zip.js";

const SKILL_RELATIVE_PATHS = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/installation.md",
  "references/http-api.md",
  "references/mcp.md",
  "references/collectors.md",
  "references/pipelines.md",
  "references/configuration.md",
  "references/operations.md",
  "references/troubleshooting.md",
  "references/architecture.md",
] as const;

const CHAPTER_TITLES: Readonly<Record<string, string>> = {
  "SKILL.md": "概览",
  "references/installation.md": "安装与连接",
  "references/http-api.md": "HTTP API",
  "references/mcp.md": "MCP",
  "references/collectors.md": "采集器",
  "references/pipelines.md": "流水线",
  "references/configuration.md": "配置",
  "references/operations.md": "运行维护",
  "references/troubleshooting.md": "故障排查",
  "references/architecture.md": "架构",
};

export interface RssAnySkillFile {
  path: string;
  content: Buffer;
}

export interface RssAnySkillBundle {
  name: "rssany";
  description: string;
  skill: string;
  files: RssAnySkillFile[];
  chapters: Array<{ path: string; title: string; content: string }>;
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
    chapters: files
      .filter((file) => file.path in CHAPTER_TITLES)
      .map((file) => ({
        path: file.path,
        title: CHAPTER_TITLES[file.path]!,
        content: file.content.toString("utf8"),
      })),
  };
}

export function buildRssAnySkillZip(bundle: RssAnySkillBundle): Buffer {
  const entries: ZipEntry[] = bundle.files.map((file) => ({
    path: `rssany/${file.path}`,
    content: file.content,
  }));
  return buildZip(entries);
}
