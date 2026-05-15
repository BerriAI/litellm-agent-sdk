import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface Config {
  baseUrl: string;
  apiKey: string;
}

const CONFIG_PATH = join(homedir(), ".lap", "config.json");

export function loadConfig(overrides?: Partial<Config>): Config {
  const env: Partial<Config> = {
    baseUrl: process.env.LAP_BASE_URL,
    apiKey: process.env.LAP_API_KEY,
  };

  let file: Partial<Config> = {};
  try {
    file = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
  } catch {
    // no config file yet
  }

  const merged: Partial<Config> = {
    ...file,
    ...Object.fromEntries(Object.entries(env).filter(([, v]) => v != null)),
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => v != null)),
  };

  if (!merged.baseUrl) {
    console.error("Error: LAP base URL not set. Run `lap login` or set LAP_BASE_URL.");
    process.exit(1);
  }
  if (!merged.apiKey) {
    console.error("Error: LAP API key not set. Run `lap login` or set LAP_API_KEY.");
    process.exit(1);
  }

  return merged as Config;
}

export function saveConfig(config: Config): void {
  mkdirSync(join(homedir(), ".lap"), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function configPath(): string {
  return CONFIG_PATH;
}
