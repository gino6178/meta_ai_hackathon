// Client for the coaches' language model. LLM_URL points at whichever runs it:
//   Muse Glimmer, Meta's open-weights model, on our own GPU (default): Ollama http://127.0.0.1:11435/v1, LLM_MODEL=muse-glimmer
//   Muse Spark on the Meta Model API: LLM_URL=https://api.meta.ai/v1, LLM_MODEL=muse-spark-1.3, MODEL_API_KEY=<key>
// Glimmer is called through Ollama's native chat API with low thinking. With thinking switched off (think: false, or
// reasoning_effort "none") it still reasons in a hidden channel and can use up the whole budget before the reply, which
// then comes back empty; at "low" the reasoning is shorter and returned separately, so the reply budget is kept for the
// answer. Any other server (llama.cpp, vLLM, SGLang, Meta Model API) gets OpenAI-compatible chat completions (LLM_API=openai).
const URL_ = (process.env.LLM_URL || "http://127.0.0.1:11435/v1").replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL || "muse-glimmer";
const KEY = process.env.MODEL_API_KEY || process.env.LLM_API_KEY || "";
const API = process.env.LLM_API || (KEY ? "openai" : "ollama");
const TIMEOUT = +(process.env.LLM_TIMEOUT_MS || 180000);
const THINKING = process.env.LLM_THINK || "low"; // false | low | medium | high
const THINK_BUDGET = +(process.env.LLM_THINK_TOKENS || 900); // tokens allowed for reasoning on top of the reply
const THINK = /<think>[\s\S]*?<\/think>\s*/g;
const headers = { "content-type": "application/json", ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) };
export const device = () => process.env.LLM_DEVICE || (KEY ? "Meta Model API" : "local GPU");
const debug = async (messages, response) => { if (process.env.LLM_DEBUG) (await import("node:fs")).appendFileSync(process.env.LLM_DEBUG, JSON.stringify({ messages, response }) + "\n"); };

// every model call is counted, with how many ran at the same time (the agent runs read it for their reports)
export const stats = { calls: 0, seconds: 0, inflight: 0, peak: 0 };
const begin = () => { stats.calls++; stats.inflight++; stats.peak = Math.max(stats.peak, stats.inflight); return Date.now(); };
const end = (t0) => { stats.inflight--; stats.seconds += (Date.now() - t0) / 1000; };

export async function chat(messages, { maxTokens = 420, temperature = 0.4 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  const t0 = begin();
  try {
    if (API === "ollama") {
      const r = await fetch(`${URL_.replace(/\/v1$/, "")}/api/chat`, {
        method: "POST", headers, signal: ctl.signal,
        body: JSON.stringify({ model: MODEL, messages, stream: false, think: THINKING === "false" ? false : THINKING, keep_alive: "24h",
          options: { num_predict: maxTokens + THINK_BUDGET, temperature } }),
      });
      if (!r.ok) throw new Error(`LLM server ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json(), secs = (Date.now() - t0) / 1000;
      await debug(messages, j);
      const gen = j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : null;
      return { text: (j.message?.content || "").replace(THINK, "").trim(),
        timing: { seconds: +secs.toFixed(2), tokens_per_s: gen ? +gen.toFixed(1) : null, device: device() } };
    }
    const r = await fetch(`${URL_}/chat/completions`, {
      method: "POST", headers, signal: ctl.signal,
      body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature }),
    });
    if (!r.ok) throw new Error(`LLM server ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(), secs = (Date.now() - t0) / 1000, n = j.usage?.completion_tokens;
    await debug(messages, j);
    return { text: (j.choices[0].message.content || "").replace(THINK, "").trim(),
      timing: j.timing ?? { seconds: +secs.toFixed(2), tokens_per_s: n ? +(n / secs).toFixed(1) : null, device: device() } };
  } finally { clearTimeout(t); end(t0); }
}

// one turn of a tool-using agent: the model either answers or asks for tools. Returns { text, calls: [{ name, args }],
// message } where message is what to append to the conversation before the tool results. Muse Glimmer through Ollama's
// native tool calling; any OpenAI-compatible server (Meta Model API included) through function calling.
export async function chatTools(messages, tools, { maxTokens = 500, temperature = 0.2 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  const t0 = begin();
  try {
    if (API === "ollama") {
      const r = await fetch(`${URL_.replace(/\/v1$/, "")}/api/chat`, {
        method: "POST", headers, signal: ctl.signal,
        body: JSON.stringify({ model: MODEL, messages, tools, stream: false, think: THINKING === "false" ? false : THINKING, keep_alive: "24h",
          options: { num_predict: maxTokens + THINK_BUDGET, temperature } }),
      });
      if (!r.ok) throw new Error(`LLM server ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json(), m = j.message || {};
      await debug(messages, j);
      const calls = (m.tool_calls || []).map((c) => ({ name: c.function?.name, args: typeof c.function?.arguments === "string" ? safeJSON(c.function.arguments) : c.function?.arguments || {} }));
      return { text: (m.content || "").replace(THINK, "").trim(), calls, message: { role: "assistant", content: m.content || "", tool_calls: m.tool_calls }, seconds: +((Date.now() - t0) / 1000).toFixed(2) };
    }
    const r = await fetch(`${URL_}/chat/completions`, {
      method: "POST", headers, signal: ctl.signal,
      body: JSON.stringify({ model: MODEL, messages, tools, max_tokens: maxTokens, temperature }),
    });
    if (!r.ok) throw new Error(`LLM server ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(), m = j.choices[0].message;
    await debug(messages, j);
    const calls = (m.tool_calls || []).map((c) => ({ id: c.id, name: c.function?.name, args: safeJSON(c.function?.arguments) }));
    return { text: (m.content || "").replace(THINK, "").trim(), calls, message: m, seconds: +((Date.now() - t0) / 1000).toFixed(2) };
  } finally { clearTimeout(t); end(t0); }
}
const safeJSON = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };

export async function health() {
  try { // any OpenAI-compatible model list (Ollama, llama.cpp, vLLM, SGLang, Meta Model API)
    const r = await fetch(URL_ + "/models", { headers, signal: AbortSignal.timeout(4000) });
    const ids = (await r.json()).data?.map((m) => m.id) ?? [];
    const ready = ids.some((id) => id === MODEL || id.split(":")[0] === MODEL);
    return { url: URL_, ready, model: MODEL, device: device(), error: ready ? null : `model ${MODEL} not loaded` };
  } catch (e) {
    return { url: URL_, ready: false, model: MODEL, error: String(e.message || e) };
  }
}
