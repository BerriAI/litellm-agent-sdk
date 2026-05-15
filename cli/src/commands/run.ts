import { createInterface } from "readline";
import { loadConfig, type Config } from "../config.js";
import { lapRequest } from "../http.js";
import { startSpinner } from "../ui/spinner.js";
import { extractReplyText } from "../ui/printer.js";

interface SessionSnapshot {
  id: string;
  agentId: string;
  status: string;
  response?: Record<string, unknown>;
}

interface AgentRow {
  id: string;
  name?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAgentId(cfg: Config, nameOrId: string): Promise<string> {
  if (UUID_RE.test(nameOrId)) return nameOrId;

  // Treat as name — fetch list and match
  const res = await lapRequest<AgentRow[] | { data?: AgentRow[] }>(cfg, "GET", "/v1/managed_agents/agents");
  const agents: AgentRow[] = Array.isArray(res) ? res : (res as { data?: AgentRow[] }).data ?? [];

  const lower = nameOrId.toLowerCase();
  const exact = agents.find((a) => a.name?.toLowerCase() === lower);
  if (exact) return exact.id;

  const partial = agents.filter((a) => a.name?.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0].id;
  if (partial.length > 1) {
    console.error(`Ambiguous name "${nameOrId}" matches: ${partial.map((a) => a.name).join(", ")}`);
    process.exit(1);
  }

  console.error(`No agent found matching "${nameOrId}". Run \`lap agents list\` to see available agents.`);
  process.exit(1);
}

/** Interactive REPL against an already-live session. */
export async function repl(cfg: Config, sessionId: string): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let streaming = false;

  const ask = (): Promise<string | null> =>
    new Promise((resolve) => {
      rl.question(">>> ", resolve);
      rl.once("close", () => resolve(null));
    });

  console.log(`Session: ${sessionId}`);
  console.log('Type your message. Slash commands: /quit  /id  /stream on|off\n');

  while (true) {
    const line = await ask();
    if (line === null) break; // Ctrl-D

    const text = line.trim();
    if (!text) continue;

    // slash commands
    if (text === "/quit") break;
    if (text === "/id") { console.log(sessionId); continue; }
    if (text === "/stream on") { streaming = true; console.log("Streaming: on (tokens via SSE)"); continue; }
    if (text === "/stream off") { streaming = false; console.log("Streaming: off (blocking)"); continue; }

    if (streaming) {
      await streamTurn(cfg, sessionId, text);
    } else {
      await blockingTurn(cfg, sessionId, text);
    }
  }

  rl.close();
}

async function blockingTurn(cfg: Config, sessionId: string, text: string): Promise<void> {
  const spinner = startSpinner("Thinking...");
  try {
    const reply = await lapRequest<Record<string, unknown>>(
      cfg,
      "POST",
      `/v1/managed_agents/sessions/${sessionId}/message`,
      { text },
    );
    spinner.stop();
    console.log(extractReplyText(reply));
  } catch (err) {
    spinner.stop();
    console.error(`Error: ${(err as Error).message}`);
  }
}

async function streamTurn(cfg: Config, sessionId: string, text: string): Promise<void> {
  // Fire the message (don't await — let the stream carry the response)
  const sendPromise = lapRequest<Record<string, unknown>>(
    cfg,
    "POST",
    `/v1/managed_agents/sessions/${sessionId}/message`,
    { text },
  ).catch((err) => {
    console.error(`\nSend error: ${(err as Error).message}`);
  });

  // Import dynamically so non-streaming path has no SDK dependency at load time
  const { createClaudeStream } = await import("@litellm/agent-sdk");
  const { foldSdkMessages } = await import("@litellm/agent-sdk");

  let lastCount = 0;
  const ac = new AbortController();

  await new Promise<void>((resolve) => {
    const handle = createClaudeStream({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      sessionId,
      signal: ac.signal,
    });

    type AssistantLike = { type: "assistant"; message: { content: unknown[] } };

    const unsub = handle.subscribe((state) => {
      // print any new messages since last render
      const folded = foldSdkMessages(state.messages);
      if (folded.length > lastCount) {
        for (const msg of folded.slice(lastCount)) {
          if (msg.type !== "assistant") continue;
          const content = (msg as unknown as AssistantLike).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block &&
                typeof block === "object" &&
                "type" in block &&
                (block as { type: string }).type === "text" &&
                "text" in block &&
                typeof (block as { text: string }).text === "string"
              ) {
                process.stdout.write((block as { text: string }).text);
              }
            }
          }
        }
        lastCount = folded.length;
      }

      if (state.status === "idle" || state.status === "error" || state.status === "aborted") {
        unsub();
        ac.abort();
        process.stdout.write("\n");
        if (state.status === "error") console.error(`Stream error: ${state.error}`);
        resolve();
      }
    });
  });

  await sendPromise;
}

export async function run(
  agentId: string,
  opts: {
    baseUrl?: string;
    apiKey?: string;
    prompt?: string;
    title?: string;
  },
): Promise<void> {
  const cfg = loadConfig(opts);
  const resolvedId = await resolveAgentId(cfg, agentId);

  const spinner = startSpinner("Spawning session (cold-start ~60-120s)...");
  let session: SessionSnapshot;
  try {
    session = await lapRequest<SessionSnapshot>(
      cfg,
      "POST",
      `/v1/managed_agents/agents/${resolvedId}/session`,
      {
        ...(opts.prompt ? { initialPrompt: opts.prompt } : {}),
        ...(opts.title ? { title: opts.title } : {}),
      },
    );
  } catch (err) {
    spinner.stop();
    console.error(`Failed to create session: ${(err as Error).message}`);
    process.exit(1);
  }
  spinner.stop();

  console.log(`Session ready: ${session.id} (status: ${session.status})`);

  if (session.response && Object.keys(session.response).length > 0) {
    console.log("\n" + extractReplyText(session.response) + "\n");
  }

  await repl(cfg, session.id);
}
