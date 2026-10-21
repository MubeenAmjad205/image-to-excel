import Anthropic from "@anthropic-ai/sdk";
import { base64, normalizeTable, parseJsonObject } from "./format.ts";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, type Env, type Extraction } from "./types.ts";

export type Engine = "workers-ai" | "claude";

/** Optional "second door" model. Only used when ANTHROPIC_API_KEY is set and the user asks for /hq. */
const CLAUDE_MODEL = "claude-opus-5-5";

function userInstruction(instruction: string) {
  return instruction.trim()
    ? `Extract the table(s) from this image.\nExtra instruction from the user: ${instruction.trim()}`
    : "Extract the table(s) from this image.";
}

function toExtraction(raw: unknown): Extraction {
  const obj = parseJsonObject(raw) as Partial<Extraction>;
  return {
    tables: (obj.tables ?? []).map(normalizeTable).filter((t) => t.headers.length || t.rows.length),
    notes: typeof obj.notes === "string" ? obj.notes.trim() : "",
  };
}

/** Default door: free Workers AI vision model. */
export async function extractWithWorkersAI(env: Env, image: ArrayBuffer, mime: string, instruction: string): Promise<Extraction> {
  const dataUrl = `data:${mime};base64,${base64(image)}`;
  const result = (await env.AI.run(env.VISION_MODEL as Parameters<Ai["run"]>[0], {
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userInstruction(instruction) },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
    max_tokens: 8192,
    temperature: 0,
  } as never)) as { response?: unknown };
  return toExtraction(result.response);
}

/** Second door: Claude. Better on dense, blurry or handwritten tables. */
export async function extractWithClaude(env: Env, image: ArrayBuffer, mime: string, instruction: string): Promise<Extraction> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime) ? mime : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    // Re-routes the request if a safety classifier declines it.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> },
    },
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64(image) } },
          { type: "text", text: userInstruction(instruction) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined this image");
  if (response.stop_reason === "max_tokens") throw new Error("Table too large for one reply");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return toExtraction(text);
}

/** Answer a question about the data the user has sent so far. Uses the free Workers AI model. */
export async function chat(
  env: Env,
  context: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const system = `You help the user work with tables they extracted from images.
Answer briefly and plainly. Use only the data below; say so if it is not there.
When the user asks for a changed or filtered table, output the whole result as tab-separated values inside one \`\`\` code block, header row first, so it pastes into Excel.

Recent tables (tab-separated):
${context || "(none yet - the user has not sent an image)"}`;
  const result = (await env.AI.run(env.VISION_MODEL as Parameters<Ai["run"]>[0], {
    messages: [{ role: "system", content: system }, ...history],
    max_tokens: 4096,
    temperature: 0.2,
  } as never)) as { response?: unknown };
  return typeof result.response === "string" ? result.response : JSON.stringify(result.response ?? "");
}
