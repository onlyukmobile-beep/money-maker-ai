const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const TAVILY_API_KEY = defineSecret("TAVILY_API_KEY");
const HF_TOKEN = defineSecret("HF_TOKEN");
const ELEVENLABS_API_KEY = defineSecret("ELEVENLABS_API_KEY");
const ELEVENLABS_VOICE_ID = defineSecret("ELEVENLABS_VOICE_ID");

function json(res, status, body) {
  res.status(status).set("Content-Type", "application/json").send(JSON.stringify(body));
}

function requirePost(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return false;
  }
  return true;
}

function secretValue(secret) {
  const value = secret.value();
  if (!value) throw new Error(`${secret.name} is not configured on the server.`);
  return value;
}

async function readError(response) {
  const text = await response.text();
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    detail = parsed?.error?.message || parsed?.message || text;
  } catch {}
  return `Provider request failed (HTTP ${response.status}): ${String(detail).slice(0, 500)}`;
}

exports.providerGateway = onRequest({
  region: "us-central1",
  timeoutSeconds: 540,
  memory: "1GiB",
  secrets: [GEMINI_API_KEY, TAVILY_API_KEY, HF_TOKEN, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID],
}, async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }
    const path = (req.path || "/").replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    if (req.method === "GET" && path === "/health") {
      const hasSecret = (secret) => {
        try { return Boolean(secret.value()); } catch { return false; }
      };
      return json(res, 200, {
        ok: true,
        gateway: "Money Maker AI provider gateway",
        providers: {
          gemini: hasSecret(GEMINI_API_KEY),
          tavily: hasSecret(TAVILY_API_KEY),
          huggingface: hasSecret(HF_TOKEN),
          elevenlabs: hasSecret(ELEVENLABS_API_KEY),
        },
      });
    }
    if (!requirePost(req, res)) return;
    const body = req.body || {};

    if (path === "/test") {
      const adapter = body.adapter;
      if (adapter === "gemini") {
        const key = secretValue(GEMINI_API_KEY);
        const model = body.model || "gemini-2.5-flash-lite";
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly: CONNECTION_OK" }] }], generationConfig: { maxOutputTokens: 16 } }),
        });
        if (!response.ok) throw new Error(await readError(response));
        return json(res, 200, { ok: true, adapter, model });
      }
      if (adapter === "tavily") {
        const key = secretValue(TAVILY_API_KEY);
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "documentary storytelling current information", search_depth: "basic", max_results: 1, topic: "general" }),
        });
        if (!response.ok) throw new Error(await readError(response));
        return json(res, 200, { ok: true, adapter });
      }
      if (adapter === "huggingface-image") {
        const key = secretValue(HF_TOKEN);
        const response = await fetch("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ inputs: "cinematic documentary establishing shot, professional lighting" }) });
        if (!response.ok) throw new Error(await readError(response));
        return json(res, 200, { ok: true, adapter });
      }
      if (adapter === "huggingface-video") {
        const key = secretValue(HF_TOKEN);
        const model = body.model || "Lightricks/LTX-Video-0.9.8-13B-distilled";
        const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ inputs: "A short cinematic documentary shot of a city street at golden hour, subtle realistic camera motion" }) });
        if (!response.ok) throw new Error(await readError(response));
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length) throw new Error("Hugging Face returned an empty video response.");
        return json(res, 200, { ok: true, adapter, bytes: bytes.length });
      }
      if (adapter === "elevenlabs-voice") {
        const key = secretValue(ELEVENLABS_API_KEY);
        const voiceId = ELEVENLABS_VOICE_ID.value() || "JBFqnCBsd6RMkjVDRZzb";
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text: "Money Maker AI connection test.", model_id: body.model || "eleven_multilingual_v2" }) });
        if (!response.ok) throw new Error(await readError(response));
        return json(res, 200, { ok: true, adapter });
      }
      if (adapter === "elevenlabs-sfx") {
        const key = secretValue(ELEVENLABS_API_KEY);
        const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_22050_32", { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text: "soft cinematic documentary transition whoosh" }) });
        if (!response.ok) throw new Error(await readError(response));
        return json(res, 200, { ok: true, adapter });
      }
      return json(res, 400, { error: `No test adapter is configured for ${adapter}.` });
    }

    if (path === "/llm") {
      const key = secretValue(GEMINI_API_KEY);
      const model = body.model || "gemini-2.5-flash-lite";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: body.prompt || "" }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.55, maxOutputTokens: Number(body.maxOutputTokens || 1600) } }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!text) throw new Error("Gemini returned an empty response.");
      return json(res, 200, { content: text, model });
    }

    if (path === "/research") {
      const key = secretValue(TAVILY_API_KEY);
      const response = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: body.query, search_depth: body.searchDepth || "basic", max_results: Math.min(10, Math.max(1, Number(body.maxResults || 5))), topic: "general", include_answer: true }) });
      if (!response.ok) throw new Error(await readError(response));
      return json(res, 200, await response.json());
    }

    if (path === "/image") {
      const key = secretValue(HF_TOKEN);
      const model = body.model || "black-forest-labs/FLUX.1-schnell";
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ inputs: body.prompt, parameters: { width: body.width || 1024, height: body.height || 576 } }) });
      if (!response.ok) throw new Error(await readError(response));
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 8 * 1024 * 1024) throw new Error("Generated image is too large to pass through the provider gateway.");
      const contentType = response.headers.get("content-type") || "image/jpeg";
      return json(res, 200, { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`, contentType });
    }

    if (path === "/video") {
      const key = secretValue(HF_TOKEN);
      const model = body.model || "Lightricks/LTX-Video-0.9.8-13B-distilled";
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ inputs: body.prompt }) });
      if (!response.ok) throw new Error(await readError(response));
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 9 * 1024 * 1024) throw new Error("Generated video is too large for the gateway response; use a server-side storage adapter for longer clips.");
      const contentType = response.headers.get("content-type") || "video/mp4";
      return json(res, 200, { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`, contentType });
    }

    if (path === "/voice") {
      const key = secretValue(ELEVENLABS_API_KEY);
      const voiceId = body.voiceId || ELEVENLABS_VOICE_ID.value() || "JBFqnCBsd6RMkjVDRZzb";
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text: body.text, model_id: body.model || "eleven_multilingual_v2" }) });
      if (!response.ok) throw new Error(await readError(response));
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 8 * 1024 * 1024) throw new Error("Generated audio is too large for the provider gateway response.");
      return json(res, 200, { dataUrl: `data:audio/mpeg;base64,${buffer.toString("base64")}` });
    }

    if (path === "/sfx") {
      const key = secretValue(ELEVENLABS_API_KEY);
      const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_22050_32", { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ text: body.prompt }) });
      if (!response.ok) throw new Error(await readError(response));
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 8 * 1024 * 1024) throw new Error("Generated sound is too large for the provider gateway response.");
      return json(res, 200, { dataUrl: `data:audio/mpeg;base64,${buffer.toString("base64")}` });
    }

    return json(res, 404, { error: "Unknown provider gateway route." });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : "Provider gateway failed." });
  }
});
