import { readConfigFile, updateConfigFile } from "./configFile.js";

export interface UpdateSettings {
  autoUpdate: boolean;
  autoRestart: boolean;
}

const DEFAULTS: UpdateSettings = {
  autoUpdate: true,
  autoRestart: true,
};

export async function getUpdateSettings(): Promise<UpdateSettings> {
  const root = await readConfigFile();
  const value = root.update;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULTS };
  const update = value as Record<string, unknown>;
  return {
    autoUpdate: typeof update.autoUpdate === "boolean" ? update.autoUpdate : DEFAULTS.autoUpdate,
    autoRestart: typeof update.autoRestart === "boolean" ? update.autoRestart : DEFAULTS.autoRestart,
  };
}

export async function setUpdateSettings(settings: UpdateSettings): Promise<void> {
  await updateConfigFile((root) => {
    root.update = {
      autoUpdate: settings.autoUpdate,
      autoRestart: settings.autoRestart,
    };
  });
}
