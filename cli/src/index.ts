#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./commands/login.js";
import { agentsList, agentsCreate, agentsRm } from "./commands/agents.js";
import { sessionsList, sessionsAttach, sessionsRm } from "./commands/sessions.js";
import { run } from "./commands/run.js";

const program = new Command();

program
  .name("lap")
  .description("LiteLLM Agent Platform CLI")
  .version("0.1.0");

// Global connection flags (all commands accept these)
const connOpts = (cmd: Command) =>
  cmd
    .option("--base-url <url>", "LAP base URL (overrides config/env)")
    .option("--api-key <key>", "LAP API key (overrides config/env)");

// lap login
program
  .command("login")
  .description("Authenticate and save credentials to ~/.lap/config.json")
  .action(login);

// lap run <agent-id>
connOpts(
  program
    .command("run <agent-id>")
    .description("Spawn a session for an agent and start an interactive REPL")
    .option("-p, --prompt <text>", "Initial prompt sent when session starts")
    .option("-t, --title <title>", "Session title")
    .action(async (agentId: string, opts: { baseUrl?: string; apiKey?: string; prompt?: string; title?: string }) => {
      await run(agentId, opts);
    }),
);

// lap ps
connOpts(
  program
    .command("ps")
    .description("List active sessions")
    .action(async (opts: { baseUrl?: string; apiKey?: string }) => {
      await sessionsList(opts);
    }),
);

// lap agents
const agents = program.command("agents").description("Manage agents");

connOpts(
  agents
    .command("list")
    .description("List all agents")
    .action(async (opts: { baseUrl?: string; apiKey?: string }) => {
      await agentsList(opts);
    }),
);

connOpts(
  agents
    .command("create")
    .description("Create a new agent")
    .requiredOption("-m, --model <model>", "Model ID (e.g. anthropic/claude-sonnet-4-6)")
    .requiredOption("--template <id>", "Template ID (e.g. tpl_opencode_default)")
    .option("-n, --name <name>", "Agent name")
    .option("-p, --prompt <text>", "System prompt")
    .option("--repo-url <url>", "Git repo URL to mount")
    .option("--branch <branch>", "Git branch")
    .option("--harness <id>", "Harness binary ID")
    .action(async (opts: {
      baseUrl?: string; apiKey?: string; model: string; template: string;
      name?: string; prompt?: string; repoUrl?: string; branch?: string; harness?: string;
    }) => {
      await agentsCreate(opts);
    }),
);

connOpts(
  agents
    .command("rm <agent-id>")
    .description("Delete an agent")
    .action(async (agentId: string, opts: { baseUrl?: string; apiKey?: string }) => {
      await agentsRm(agentId, opts);
    }),
);

// lap sessions
const sessions = program.command("sessions").description("Manage sessions");

connOpts(
  sessions
    .command("attach <session-id>")
    .description("Re-attach to an existing session")
    .action(async (sessionId: string, opts: { baseUrl?: string; apiKey?: string }) => {
      await sessionsAttach(sessionId, opts);
    }),
);

connOpts(
  sessions
    .command("rm <session-id>")
    .description("Terminate a session")
    .action(async (sessionId: string, opts: { baseUrl?: string; apiKey?: string }) => {
      await sessionsRm(sessionId, opts);
    }),
);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
