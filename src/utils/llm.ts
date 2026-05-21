/**
 * OpenAI-compatible LLM client.
 * Works with vLLM, sglang, Ollama (with /v1), llama.cpp server, etc.
 *
 * IMPORTANT: the local LLM server must allow CORS from the Tauri webview origin.
 *  - vLLM:   --allowed-origins='*'
 *  - sglang: --allow-origins '*'
 *  - Ollama: serves CORS automatically for localhost
 */

export interface LLMSettings {
  baseURL: string;
  apiKey: string;
  chatModel: string;
  reasoningModel: string;
  embedModel: string;
  imageModel: string;
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  baseURL: "http://localhost:8000/v1",
  apiKey: "",
  chatModel: "",
  reasoningModel: "",
  embedModel: "",
  imageModel: "",
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelInfo {
  id: string;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function headers(settings: LLMSettings): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) h["Authorization"] = `Bearer ${settings.apiKey}`;
  return h;
}

/** Quick health check + model listing. Throws on error. */
export async function listModels(settings: LLMSettings): Promise<ModelInfo[]> {
  const res = await fetch(`${trimSlash(settings.baseURL)}/models`, {
    method: "GET",
    headers: headers(settings),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  // OpenAI returns {data: [{id, ...}, ...]}; some servers return {models: [...]}
  const arr = json.data ?? json.models ?? [];
  return arr.map((m: any) => ({ id: m.id ?? m.name ?? "" })).filter((m: ModelInfo) => m.id);
}

/** Non-streaming chat completion. */
export async function chat(
  settings: LLMSettings,
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const model = opts.model || settings.chatModel;
  if (!model) throw new Error("No chat model configured");
  const res = await fetch(`${trimSlash(settings.baseURL)}/chat/completions`, {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

/** Streaming chat completion. Yields incremental delta strings. */
export async function* chatStream(
  settings: LLMSettings,
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; signal?: AbortSignal } = {},
): AsyncIterableIterator<string> {
  const model = opts.model || settings.chatModel;
  if (!model) throw new Error("No chat model configured");
  const res = await fetch(`${trimSlash(settings.baseURL)}/chat/completions`, {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* skip malformed SSE chunk */
      }
    }
  }
}

/** Batch embeddings. Returns one vector per input string. */
export async function embed(
  settings: LLMSettings,
  texts: string[],
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<number[][]> {
  const model = opts.model || settings.embedModel;
  if (!model) throw new Error("No embedding model configured");
  if (texts.length === 0) return [];
  const res = await fetch(`${trimSlash(settings.baseURL)}/embeddings`, {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({ model, input: texts }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  const data: { embedding: number[] }[] = json.data ?? [];
  return data.map((d) => d.embedding);
}

export interface GeneratedImage {
  /** Base64-encoded image (without data: prefix), if returned that way */
  b64?: string;
  /** Direct URL, if returned that way */
  url?: string;
}

/** Image generation (OpenAI-compatible /v1/images/generations) */
export async function generateImage(
  settings: LLMSettings,
  prompt: string,
  opts: { model?: string; size?: string; signal?: AbortSignal } = {},
): Promise<GeneratedImage> {
  const model = opts.model || settings.imageModel;
  if (!model) throw new Error("No image model configured");
  const res = await fetch(`${trimSlash(settings.baseURL)}/images/generations`, {
    method: "POST",
    headers: headers(settings),
    body: JSON.stringify({
      model,
      prompt,
      size: opts.size ?? "1024x1024",
      n: 1,
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  const first = json.data?.[0] ?? {};
  return { b64: first.b64_json, url: first.url };
}

const LS_KEY = "llmSettings";

export function loadLLMSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LLM_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export function saveLLMSettings(settings: LLMSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}
