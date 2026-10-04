export type ProviderId = "llm" | "research" | "image" | "video" | "voice" | "music" | "publishing";
export type ProviderStatus = "demo" | "configured" | "connected" | "error";
export type ProviderAdapter = "openai" | "gemini" | "tavily" | "huggingface-image" | "huggingface-video" | "elevenlabs-voice" | "elevenlabs-sfx" | null;
export type JobStatus =
  | "QUEUED"
  | "RESEARCHING"
  | "IDEA"
  | "STORY"
  | "SCRIPT"
  | "SCENES"
  | "ASSETS"
  | "VOICE"
  | "ASSEMBLY"
  | "QC"
  | "REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "FAILED"
  | "REVISIONS_REQUESTED"
  | "REJECTED";

export type StageId = "research" | "idea" | "story" | "script" | "scenes" | "assets" | "voice" | "assembly" | "qc";

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  group: string;
  adapter: ProviderAdapter;
  model: string;
  dailyLimit: number;
  unit: string;
  apiKey: string;
  enabled: boolean;
  status: ProviderStatus;
  website: string;
  description: string;
  costRisk: "no" | "unknown" | "yes";
  error?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  publishedDate?: string;
  summary: string;
}

export interface Idea {
  title: string;
  hook: string;
  audience: string;
  concept: string;
  curiosity: string;
  emotion: string;
  visual: string;
  platform: string;
}

export interface Scene {
  number: number;
  duration: string;
  narration: string;
  visual: string;
  camera: string;
  lighting: string;
  audio: string;
  text: string;
  transition: string;
}

export interface QCCheck {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

export interface Production {
  id: string;
  title: string;
  topic: string;
  platform: string;
  format: string;
  duration: string;
  status: JobStatus;
  stage: JobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  idea: Idea | null;
  textMode: "demo" | "live";
  story: string;
  script: string;
  scenes: Scene[];
  sources: ResearchSource[];
  researchBrief: string;
  researchMode: "demo" | "live";
  assetNote: string;
  voicePlan: string;
  previewMode: "demo-storyboard" | "rendered";
  qc: QCCheck[];
  error?: { provider: string; stage: string; message: string };
  media?: {
    imageDataUrls?: string[];
    audioDataUrl?: string;
    sfxDataUrl?: string;
    videoDataUrl?: string;
    audioDurationSeconds?: number;
  };
  reviewNotes: string[];
  approvedAt?: string;
}

export interface CreditDay {
  overallUsed: number;
  providers: Record<string, number>;
}

export interface SavedIdea extends Idea {
  id: string;
  topic: string;
  mode: "demo" | "live";
  createdAt: string;
}

export interface FirebaseConfigInput {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface StudioSettings {
  dailyLimit: number;
  timeZone: string;
  firebaseConfig: FirebaseConfigInput | null;
  firebaseUid: string | null;
}

export interface StudioData {
  version: number;
  settings: StudioSettings;
  providers: ProviderConfig[];
  creditsByDay: Record<string, CreditDay>;
  productions: Production[];
  ideas: SavedIdea[];
  researchHistory: Array<{ id: string; query: string; date: string; mode: "demo" | "live"; sources: ResearchSource[] }>;
  selectedProductionId: string | null;
}

export const STAGES: Array<{ id: StageId; label: string; status: JobStatus; provider: ProviderId }> = [
  { id: "research", label: "Research", status: "RESEARCHING", provider: "research" },
  { id: "idea", label: "Story angle", status: "IDEA", provider: "llm" },
  { id: "story", label: "Story engine", status: "STORY", provider: "llm" },
  { id: "script", label: "Script", status: "SCRIPT", provider: "llm" },
  { id: "scenes", label: "Scene design", status: "SCENES", provider: "llm" },
  { id: "assets", label: "Visual plan", status: "ASSETS", provider: "image" },
  { id: "voice", label: "Voice plan", status: "VOICE", provider: "voice" },
  { id: "assembly", label: "Preview assembly", status: "ASSEMBLY", provider: "video" },
  { id: "qc", label: "Quality review", status: "QC", provider: "llm" },
];

export const PROVIDER_CATALOG: ProviderConfig[] = [
  {
    id: "llm",
    name: "Google Gemini",
    group: "Language / reasoning",
    adapter: "gemini",
    model: "gemini-2.5-flash-lite",
    dailyLimit: 50,
    unit: "requests",
    apiKey: "",
    enabled: true,
    status: "demo",
    website: "https://aistudio.google.com/apikey",
    description: "Fast, structured story development, scripts, scene plans and editorial checks. Free-tier eligible model.",
    costRisk: "unknown",
  },
  {
    id: "research",
    name: "Tavily Search",
    group: "Research / search",
    adapter: "tavily",
    model: "Search API · basic",
    dailyLimit: 20,
    unit: "searches",
    apiKey: "",
    enabled: true,
    status: "demo",
    website: "https://app.tavily.com/home",
    description: "Current web sources, public articles and source-linked research.",
    costRisk: "unknown",
  },
  {
    id: "image",
    name: "Hugging Face · FLUX",
    group: "Image generation",
    adapter: "huggingface-image",
    model: "black-forest-labs/FLUX.1-schnell",
    dailyLimit: 10,
    unit: "generations",
    apiKey: "",
    enabled: true,
    status: "demo",
    website: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
    description: "Production-grade open image generation through Hugging Face Inference Providers. Free monthly credit is limited.",
    costRisk: "unknown",
  },
  {
    id: "video",
    name: "Hugging Face · LTX Video",
    group: "Video generation",
    adapter: "huggingface-video",
    model: "Lightricks/LTX-Video-0.9.8-13B-distilled",
    dailyLimit: 2,
    unit: "generations",
    apiKey: "",
    enabled: true,
    status: "demo",
    website: "https://huggingface.co/docs/inference-providers/tasks/text-to-video",
    description: "Short AI video clips through Hugging Face Inference Providers. Free credit is small; use one clip per test first.",
    costRisk: "unknown",
  },
  {
    id: "voice",
    name: "ElevenLabs TTS",
    group: "Voice / TTS",
    adapter: "elevenlabs-voice",
    model: "eleven_multilingual_v2",
    dailyLimit: 10,
    unit: "minutes",
    apiKey: "",
    enabled: true,
    status: "demo",
    website: "https://elevenlabs.io/app/developers/api-keys",
    description: "Natural narration with multilingual delivery. Free plan includes monthly API credits; key stays server-side in production.",
    costRisk: "unknown",
  },
  {
    id: "music",
    name: "ElevenLabs Sound Effects",
    group: "Music / sound",
    adapter: "elevenlabs-sfx",
    model: "sound-generation",
    dailyLimit: 10,
    unit: "generations",
    apiKey: "",
    enabled: true,
    status: "demo",
    website: "https://elevenlabs.io/app/sound-effects",
    description: "AI sound effects for scene texture. Full music generation is a paid ElevenLabs feature, so this adapter never pretends it is free music.",
    costRisk: "unknown",
  },
  {
    id: "publishing",
    name: "Official Social OAuth",
    group: "Social publishing",
    adapter: null,
    model: "OAuth required",
    dailyLimit: 10,
    unit: "publishes",
    apiKey: "",
    enabled: false,
    status: "demo",
    website: "https://developers.google.com/youtube/v3",
    description: "Official platform authorization and publishing status. OAuth credentials are platform-specific and must not be entered as API secrets here.",
    costRisk: "unknown",
  },
];

export const DEFAULT_SETTINGS: StudioSettings = {
  dailyLimit: 100,
  timeZone: "Asia/Karachi",
  firebaseConfig: null,
  firebaseUid: null,
};

export const STORAGE_KEY = "money-maker-ai.studio.v1";

export function createInitialData(): StudioData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    providers: PROVIDER_CATALOG.map((provider) => ({ ...provider })),
    creditsByDay: {},
    productions: [],
    ideas: [],
    researchHistory: [],
    selectedProductionId: null,
  };
}

export function loadStudioData(): StudioData {
  const initial = createInitialData();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initial;
    const parsed = JSON.parse(stored) as Partial<StudioData>;
    const savedProviders = Array.isArray(parsed.providers) ? parsed.providers : [];
    return {
      ...initial,
      ...parsed,
      settings: { ...initial.settings, ...parsed.settings },
      providers: initial.providers.map((fallback) => {
        const saved = savedProviders.find((candidate) => candidate.id === fallback.id);
        return saved ? { ...fallback, ...saved, apiKey: "", status: "demo", error: undefined } : fallback;
      }),
      creditsByDay: parsed.creditsByDay ?? {},
      productions: parsed.productions ?? [],
      ideas: parsed.ideas ?? [],
      researchHistory: parsed.researchHistory ?? [],
    };
  } catch {
    return initial;
  }
}

export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function getCreditDay(data: StudioData, date = new Date()): CreditDay {
  const key = dayKeyInTimeZone(date, data.settings.timeZone);
  return data.creditsByDay[key] ?? { overallUsed: 0, providers: {} };
}

export function getRemaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

export function canConsume(limit: number, used: number, amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && used + amount <= limit;
}

export function runCreditSelfTest(): string[] {
  const checks: string[] = [];
  const limit = 100;
  let used = 0;
  used += 20;
  if (getRemaining(limit, used) !== 80) throw new Error("20-credit remaining check failed");
  checks.push("20 used → 80 remaining");
  used += 80;
  if (getRemaining(limit, used) !== 0) throw new Error("100-credit exhaustion check failed");
  checks.push("80 more used → 0 remaining");
  if (canConsume(limit, used, 1)) throw new Error("Exhausted limit was not blocked");
  checks.push("Next operation → blocked");
  used = 0;
  if (getRemaining(limit, used) !== 100) throw new Error("Daily reset check failed");
  checks.push("Reset → 100 available");
  return checks;
}

export function providerIsLive(provider: ProviderConfig | undefined): boolean {
  return Boolean(provider?.enabled && provider.status === "connected" && provider.apiKey && provider.adapter);
}

export function studioMode(providers: ProviderConfig[]): "DEMO MODE" | "MIXED MODE" {
  const live = providers.filter((provider) => providerIsLive(provider));
  if (live.length === 0) return "DEMO MODE";
  return "MIXED MODE";
}

export function cleanErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240);
  }
  return "The request failed. Check the provider status and try again.";
}