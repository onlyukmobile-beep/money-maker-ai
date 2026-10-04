export interface GatewayMediaResponse { dataUrl: string; contentType?: string }

async function callGateway<T>(route: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/${route.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Provider gateway failed (HTTP ${response.status}).`);
  return payload;
}

export function gatewayHealth(): Promise<{ ok: boolean; providers: Record<string, boolean> }> {
  return fetch("/api/health").then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || `Gateway health check failed (HTTP ${response.status}).`);
    return payload;
  });
}

export function testGatewayProvider(adapter: string, model: string): Promise<{ ok: boolean }> {
  return callGateway("test", { adapter, model });
}

export function generateLLM(model: string, prompt: string): Promise<{ content: string; model: string }> {
  return callGateway("llm", { model, prompt, maxOutputTokens: 1800 });
}

export function searchGateway(query: string, searchDepth = "basic"): Promise<{ answer?: string; results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> }> {
  return callGateway("research", { query, searchDepth, maxResults: 5 });
}

export function generateImage(model: string, prompt: string): Promise<GatewayMediaResponse> {
  return callGateway("image", { model, prompt, width: 1024, height: 576 });
}

export function generateVideo(model: string, prompt: string): Promise<GatewayMediaResponse> {
  return callGateway("video", { model, prompt });
}

export function generateVoice(model: string, text: string): Promise<GatewayMediaResponse> {
  return callGateway("voice", { model, text });
}

export function generateSfx(prompt: string): Promise<GatewayMediaResponse> {
  return callGateway("sfx", { prompt });
}
