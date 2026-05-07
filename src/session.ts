import { type Client, request } from "./http.js";
import { Run } from "./run.js";

export class Session {
  constructor(
    readonly id: string,
    readonly agentId: string,
    private readonly c: Client,
  ) {}

  async send(prompt: string): Promise<Run> {
    const r = await request<{ id: string }>(
      this.c,
      "POST",
      `/v1/sessions/${this.id}/prompt_async`,
      { text: prompt },
    );
    return new Run(r.id, this.id, this.c);
  }

  async followup(prompt: string): Promise<void> {
    await request<void>(
      this.c,
      "POST",
      `/v1/sessions/${this.id}/prompt_async`,
      { text: prompt, followup: true },
    );
  }
}
