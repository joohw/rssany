import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../packageRoot.js";
import { resolveDefaultUserDir } from "./userDir.js";

const CONFIG_PATH = join(resolveDefaultUserDir(PACKAGE_ROOT), "config.json");

export type ConfigRoot = Record<string, unknown>;

let updateQueue: Promise<void> = Promise.resolve();

export async function readConfigFile(): Promise<ConfigRoot> {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ConfigRoot)
      : {};
  } catch {
    return {};
  }
}

export async function updateConfigFile(
  update: (config: ConfigRoot) => void | Promise<void>,
): Promise<void> {
  const operation = updateQueue.then(async () => {
    const config = await readConfigFile();
    await update(config);
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
  });
  updateQueue = operation.catch(() => {});
  return operation;
}

export async function isInitialized(): Promise<boolean> {
  const config = await readConfigFile();
  return config.initialized === true;
}

export async function setInitialized(initialized: boolean): Promise<void> {
  await updateConfigFile((config) => {
    config.initialized = initialized;
  });
}
