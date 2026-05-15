import { createInterface } from "readline";
import { saveConfig, configPath } from "../config.js";
import { lapRequest } from "../http.js";

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function login(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    let baseUrl = await prompt(rl, "LAP base URL (e.g. https://litellm-agent-platform.onrender.com/api): ");
    baseUrl = baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      console.error("Base URL required.");
      process.exit(1);
    }

    let apiKey = await prompt(rl, "API key (sk-...): ");
    apiKey = apiKey.trim();
    if (!apiKey) {
      console.error("API key required.");
      process.exit(1);
    }

    let cfg = { baseUrl, apiKey };
    process.stdout.write("Verifying credentials...");
    try {
      await lapRequest(cfg, "GET", "/v1/managed_agents/agents");
      process.stdout.write(" OK\n");
    } catch (err) {
      const msg = (err as Error).message ?? "";
      // 404 often means the /api prefix is missing — try appending it
      if (msg.includes("404") && !baseUrl.endsWith("/api")) {
        process.stdout.write(" retrying with /api suffix...");
        cfg = { baseUrl: baseUrl + "/api", apiKey };
        try {
          await lapRequest(cfg, "GET", "/v1/managed_agents/agents");
          process.stdout.write(" OK\n");
          console.log(`Note: saved base URL as ${cfg.baseUrl}`);
        } catch (err2) {
          process.stdout.write(" failed\n");
          console.error(`Could not connect. Check base URL and API key.`);
          process.exit(1);
        }
      } else {
        process.stdout.write(" failed\n");
        console.error(`Could not connect. Check base URL and API key.`);
        process.exit(1);
      }
    }

    saveConfig(cfg);
    console.log(`Saved to ${configPath()}`);
  } finally {
    rl.close();
  }
}
