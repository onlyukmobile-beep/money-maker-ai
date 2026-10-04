import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  AudioLines,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clock3,
  Cloud,
  CloudOff,
  Clapperboard,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  FolderOpen,
  Globe2,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Mic2,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Video,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { connectFirebase, readFirebaseSnapshot, syncFirebaseSnapshot } from "./lib/firebase";
import { generateImage, generateLLM, generateSfx, generateVideo, generateVoice, gatewayHealth, searchGateway, testGatewayProvider } from "./lib/providerGateway";
import {
  canConsume,
  cleanErrorMessage,
  dayKeyInTimeZone,
  getCreditDay,
  getRemaining,
  loadStudioData,
  providerIsLive,
  runCreditSelfTest,
  STAGES,
  STORAGE_KEY,
  studioMode,
  type FirebaseConfigInput,
  type Idea,
  type JobStatus,
  type Production,
  type ProviderConfig,
  type ProviderId,
  type QCCheck,
  type ResearchSource,
  type SavedIdea,
  type StageId,
  type StudioData,
} from "./lib/studio";

type ViewId = "dashboard" | "create" | "research" | "ideas" | "production" | "review" | "library" | "publishing" | "analytics" | "providers" | "settings" | "help";
type NoticeTone = "success" | "warning" | "error" | "info";
type Toast = { id: number; message: string; tone: NoticeTone };
type BeforeInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: LucideIcon; group: string }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity, group: "Studio" },
  { id: "create", label: "Create", icon: WandSparkles, group: "Studio" },
  { id: "research", label: "Research", icon: Globe2, group: "Studio" },
  { id: "ideas", label: "Ideas", icon: Lightbulb, group: "Studio" },
  { id: "production", label: "Production", icon: Clapperboard, group: "Workflow" },
  { id: "review", label: "Review", icon: CheckCircle2, group: "Workflow" },
  { id: "library", label: "Library", icon: FolderOpen, group: "Workflow" },
  { id: "publishing", label: "Publishing", icon: Send, group: "Publish" },
  { id: "analytics", label: "Analytics", icon: BarChart3, group: "Publish" },
  { id: "providers", label: "AI Providers", icon: Radio, group: "Control room" },
  { id: "settings", label: "Settings", icon: Settings2, group: "Control room" },
  { id: "help", label: "Help center", icon: CircleHelp, group: "Control room" },
];

const STAGE_CREDIT_COST: Record<StageId, number> = {
  research: 2,
  idea: 1,
  story: 1,
  script: 1,
  scenes: 1,
  assets: 1,
  voice: 1,
  assembly: 2,
  qc: 1,
};

const PIPELINE_PROVIDER_UNITS: Record<ProviderId, number> = {
  research: 1,
  llm: 5,
  image: 1,
  video: 1,
  voice: 1,
  music: 0,
  publishing: 0,
};

const TOTAL_PIPELINE_CREDITS = Object.values(STAGE_CREDIT_COST).reduce((sum, value) => sum + value, 0);
const FORMATS = ["Mini documentary", "Mystery / investigation", "Educational entertainment", "Business story", "Science story", "Cinematic short", "Explainer"];
const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook"];
const TIME_ZONES = ["Asia/Karachi", "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Dubai"];

class DailyLimitError extends Error {
  providerName: string;
  used: number;
  limit: number;
  resetTime: string;

  constructor(providerName: string, used: number, limit: number, resetTime: string) {
    super("Daily limit reached.");
    this.name = "DailyLimitError";
    this.providerName = providerName;
    this.used = used;
    this.limit = limit;
    this.resetTime = resetTime;
  }
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `mma-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function titleCaseStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | Date, includeTime = false): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function clampPercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function formatTimecode(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function extractJson<T>(value: string, fallback: T): T {
  const unwrapped = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const firstBrace = unwrapped.indexOf("{");
  const lastBrace = unwrapped.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? unwrapped.slice(firstBrace, lastBrace + 1) : unwrapped;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return fallback;
  }
}

function demoIdea(topic: string, platform: string): Idea {
  const cleanTopic = topic.trim() || "The world's quietest places";
  return {
    title: `The hidden story behind ${cleanTopic}`,
    hook: `There is a detail in ${cleanTopic} that changes the way the whole story looks.`,
    audience: "Curious viewers who enjoy smart, cinematic explainers.",
    concept: `A concise, character-led investigation into ${cleanTopic}, following one compelling question from first clue to a grounded answer.`,
    curiosity: "Open with the unanswered question; reveal context only as each clue earns it.",
    emotion: "Wonder, followed by a satisfying sense of discovery.",
    visual: "Macro details, deliberate match cuts and one strong establishing image.",
    platform,
  };
}

function demoIdeas(topic: string, platform: string): Idea[] {
  const subject = topic.trim() || "unnoticed details in everyday life";
  return [
    demoIdea(subject, platform),
    {
      ...demoIdea(subject, platform),
      title: `What most people miss about ${subject}`,
      hook: `The obvious explanation for ${subject} is not the most interesting one.`,
      concept: `A myth-versus-evidence format that separates familiar assumptions about ${subject} from verified context.`,
      curiosity: "Set up a common assumption, then test it against traceable evidence.",
      emotion: "Surprise without sensational claims.",
    },
    {
      ...demoIdea(subject, platform),
      title: `${subject}: one question, three clues`,
      hook: `Three small clues point toward a much bigger story about ${subject}.`,
      concept: `A visual-first short built around three distinct clues, each adding context before a clear final takeaway.`,
      curiosity: "Use a three-part reveal with a visual change at each turn.",
      emotion: "Tension, then clarity.",
    },
  ];
}

function demoScenes(topic: string, script: string): Production["scenes"] {
  const subject = topic.trim() || "the story";
  const lines = script.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const beats = [
    { name: "The question", camera: "Slow push-in, tight detail", lighting: "Cool dawn with one warm practical source", sound: "Low room tone; a single restrained pulse" },
    { name: "The first clue", camera: "Measured lateral track", lighting: "Soft directional window light", sound: "Paper, wind or location texture under narration" },
    { name: "The context", camera: "Wide establishing shot into medium", lighting: "Natural contrast, controlled highlights", sound: "Music opens slightly; keep dialogue clear" },
    { name: "The turn", camera: "Cut on movement to a close detail", lighting: "Deeper shadows with a precise edge light", sound: "Brief silence before the reveal" },
    { name: "The takeaway", camera: "Gentle pull-back, hold the final frame", lighting: "Warm neutral finish, consistent palette", sound: "Resolve the music without an artificial sting" },
  ];
  return beats.map((beat, index) => ({
    number: index + 1,
    duration: `${formatTimecode(index === 0 ? 0 : index * 12)}–${formatTimecode(index === 0 ? 8 : (index + 1) * 12)}`,
    narration: lines[index] || (index === 0 ? `Start with one precise question about ${subject}.` : `${beat.name}: reveal one clear piece of context, then leave room for the image.`),
    visual: index === 0 ? `A deliberate, story-led opening image for ${subject}; illustrative direction only.` : `${beat.name}: a relevant location detail or archival reference, selected after fact-checking.`,
    camera: beat.camera,
    lighting: beat.lighting,
    audio: beat.sound,
    text: index === 0 ? "One unanswered question" : index === 4 ? "The idea to remember" : "",
    transition: index === beats.length - 1 ? "Hold, then fade to black" : "Cut on action or sound bridge",
  }));
}

function prettyReset(timeZone: string): string {
  return `00:00 · ${timeZone}`;
}

function modeLabel(mode: "demo" | "live"): string {
  return mode === "live" ? "LIVE PROVIDER" : "DEMO OUTPUT";
}

function pipelineCapacityError(data: StudioData, hasSelectedIdea = false): DailyLimitError | null {
  const day = getCreditDay(data);
  const requiredCredits = TOTAL_PIPELINE_CREDITS - (hasSelectedIdea ? 1 : 0);
  if (!canConsume(data.settings.dailyLimit, day.overallUsed, requiredCredits)) {
    return new DailyLimitError("Overall AI credits", day.overallUsed, data.settings.dailyLimit, prettyReset(data.settings.timeZone));
  }
  for (const provider of data.providers) {
    const required = PIPELINE_PROVIDER_UNITS[provider.id] - (hasSelectedIdea && provider.id === "llm" ? 1 : 0);
    if (required <= 0) continue;
    const used = day.providers[provider.id] ?? 0;
    if (!canConsume(provider.dailyLimit, used, required)) {
      return new DailyLimitError(provider.name, used, provider.dailyLimit, prettyReset(data.settings.timeZone));
    }
  }
  return null;
}

function mergeByUpdatedAt<T extends { id: string; updatedAt?: string; createdAt?: string }>(left: T[], right: T[]): T[] {
  const merged = new Map<string, T>();
  for (const entry of [...left, ...right]) {
    const current = merged.get(entry.id);
    const currentTime = Date.parse(current?.updatedAt ?? current?.createdAt ?? "1970-01-01");
    const nextTime = Date.parse(entry.updatedAt ?? entry.createdAt ?? "1970-01-01");
    if (!current || nextTime >= currentTime) merged.set(entry.id, entry);
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
}

function mergeUsage(local: StudioData["creditsByDay"], remote: StudioData["creditsByDay"]): StudioData["creditsByDay"] {
  const merged = { ...remote };
  for (const [date, day] of Object.entries(local)) {
    const previous = merged[date] ?? { overallUsed: 0, providers: {} };
    merged[date] = { overallUsed: Math.max(previous.overallUsed, day.overallUsed), providers: { ...previous.providers } };
    for (const [providerId, used] of Object.entries(day.providers)) {
      merged[date].providers[providerId] = Math.max(merged[date].providers[providerId] ?? 0, used);
    }
  }
  return merged;
}

function mergeProviderMetadata(local: ProviderConfig[], remote: Array<Omit<ProviderConfig, "apiKey">> = []): ProviderConfig[] {
  return local.map((provider) => {
    const metadata = remote.find((entry) => entry.id === provider.id);
    if (!metadata) return provider;
    return {
      ...provider,
      ...metadata,
      apiKey: provider.apiKey,
      status: provider.apiKey ? metadata.status : "demo",
    };
  });
}

function parseResearchResults(payload: unknown): { answer: string; sources: ResearchSource[] } {
  if (!payload || typeof payload !== "object") return { answer: "Search returned no usable results.", sources: [] };
  const result = payload as { answer?: string; results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
  return {
    answer: result.answer?.trim() || "Live sources collected. Review the original pages before publishing.",
    sources: (result.results ?? []).filter((entry) => entry.url).map((entry) => ({
      title: entry.title || entry.url || "Untitled source",
      url: entry.url || "",
      publishedDate: entry.published_date,
      summary: entry.content || "Open the source to review the original reporting.",
    })),
  };
}

async function openAIJson(provider: ProviderConfig, prompt: string): Promise<string> {
  if (!provider.adapter) throw new Error("The language provider has no live adapter.");
  const result = await generateLLM(provider.model, prompt);
  return result.content;
}

async function tavilySearch(provider: ProviderConfig, query: string): Promise<{ answer: string; sources: ResearchSource[] }> {
  if (!provider.adapter) throw new Error("The research provider has no live adapter.");
  const profile = provider.model.toLowerCase();
  const searchDepth = profile.includes("advanced") ? "advanced" : profile.includes("fast") ? "fast" : "basic";
  const payload = await searchGateway(query, searchDepth);
  return parseResearchResults(payload);
}

function Badge({ children, tone = "neutral", icon: Icon }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "dark"; icon?: LucideIcon }) {
  return <span className={`badge badge-${tone}`}>{Icon ? <Icon size={12} aria-hidden="true" /> : null}{children}</span>;
}

function AppButton({ children, onClick, icon: Icon, variant = "primary", type = "button", disabled, className = "", title }: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return <button className={`button button-${variant} ${className}`} type={type} onClick={onClick} disabled={disabled} title={title}>
    {Icon ? <Icon size={16} aria-hidden="true" /> : null}{children}
  </button>;
}

function IconButton({ label, onClick, children, className = "" }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function PanelHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="panel-heading">
    <div>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    {action ? <div className="panel-heading-action">{action}</div> : null}
  </div>;
}

function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state">
    <span className="empty-state-icon"><Icon size={21} aria-hidden="true" /></span>
    <h3>{title}</h3>
    <p>{body}</p>
    {action ? <div className="empty-state-action">{action}</div> : null}
  </div>;
}

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? "brand-mark-small" : ""}`} aria-hidden="true"><span /><span /><i /></span>;
}

export default function App() {
  const [data, setData] = useState<StudioData>(() => loadStudioData());
  const dataRef = useRef(data);
  const [view, setView] = useState<ViewId>("dashboard");
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPrompt | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [draft, setDraft] = useState({ topic: "Why do some places disappear from maps?", platform: "YouTube", format: "Mini documentary", duration: "3–5 minutes" });
  const [draftIdea, setDraftIdea] = useState<(Idea & Partial<SavedIdea>) | null>(null);
  const [confirmProduction, setConfirmProduction] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderId | null>(null);
  const [providerForm, setProviderForm] = useState({ name: "", model: "", dailyLimit: 0, enabled: true, apiKey: "" });
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);
  const [providerFilter, setProviderFilter] = useState("All providers");
  const [firebaseStatus, setFirebaseStatus] = useState<"off" | "connecting" | "connected" | "error">("off");
  const [firebaseMessage, setFirebaseMessage] = useState("");
  const [firebaseForm, setFirebaseForm] = useState<FirebaseConfigInput>({ apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" });
  const [researchQuery, setResearchQuery] = useState("");
  const [researchBusy, setResearchBusy] = useState(false);
  const [ideasTopic, setIdeasTopic] = useState("An overlooked question people ask every day");
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [refiningIdeaId, setRefiningIdeaId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewRequestOpen, setReviewRequestOpen] = useState(false);
  const [reviewRequestText, setReviewRequestText] = useState("");
  const [creditCheck, setCreditCheck] = useState<string[] | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [publishingPlatform, setPublishingPlatform] = useState("YouTube");
  const [helpExpanded, setHelpExpanded] = useState<string | null>("install");
  const [running, setRunning] = useState(false);
  const runningJobs = useRef(new Set<string>());
  const firebaseReady = useRef(false);
  const firebaseBootstrap = useRef(false);
  const toastCounter = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const commit = useCallback((updater: (previous: StudioData) => StudioData) => {
    const next = updater(dataRef.current);
    dataRef.current = next;
    setData(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local storage is the offline-first fallback, not a runtime dependency.
    }
    return next;
  }, []);

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4300);
  }, []);

  const activeDay = useMemo(() => getCreditDay(data), [data]);
  const usedCredits = activeDay.overallUsed;
  const remainingCredits = getRemaining(data.settings.dailyLimit, usedCredits);
  const currentProduction = useMemo(() => {
    const selected = data.productions.find((production) => production.id === data.selectedProductionId);
    if (selected && !["APPROVED", "PUBLISHED", "REJECTED"].includes(selected.status)) return selected;
    return data.productions.find((production) => !["APPROVED", "PUBLISHED", "REJECTED"].includes(production.status)) ?? null;
  }, [data.productions, data.selectedProductionId]);
  const selectedProduction = useMemo(() => data.productions.find((production) => production.id === data.selectedProductionId) ?? currentProduction, [currentProduction, data.productions, data.selectedProductionId]);
  const pendingReviews = useMemo(() => data.productions.filter((production) => production.status === "REVIEW" || production.status === "REVISIONS_REQUESTED"), [data.productions]);
  const liveProviders = useMemo(() => data.providers.filter((provider) => providerIsLive(provider)), [data.providers]);
  const selectedReview = useMemo(() => {
    return data.productions.find((production) => production.id === selectedReviewId && (production.status === "REVIEW" || production.status === "REVISIONS_REQUESTED")) ?? pendingReviews[0] ?? null;
  }, [data.productions, pendingReviews, selectedReviewId]);
  const mode = useMemo(() => studioMode(data.providers), [data.providers]);

  useEffect(() => {
    const savedConfig = data.settings.firebaseConfig;
    if (!savedConfig || firebaseBootstrap.current) return;
    firebaseBootstrap.current = true;
    let cancelled = false;
    setFirebaseStatus("connecting");
    connectFirebase(savedConfig)
      .then(async (uid) => {
        const remote = await readFirebaseSnapshot(uid);
        if (cancelled) return;
        commit((previous) => ({
          ...previous,
          productions: mergeByUpdatedAt(previous.productions, remote.productions ?? []),
          ideas: mergeByUpdatedAt(previous.ideas, remote.ideas ?? []),
          researchHistory: mergeByUpdatedAt(previous.researchHistory, remote.researchHistory ?? []),
          creditsByDay: mergeUsage(previous.creditsByDay, remote.creditsByDay ?? {}),
          providers: mergeProviderMetadata(previous.providers, remote.providers),
          settings: { ...previous.settings, ...remote.settings, firebaseUid: uid },
        }));
        firebaseReady.current = true;
        setFirebaseStatus("connected");
        setFirebaseMessage("Private workspace sync is on for this browser account.");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFirebaseStatus("error");
        setFirebaseMessage(cleanErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, [commit, data.settings.firebaseConfig, data.settings.firebaseUid]);

  useEffect(() => {
    const uid = data.settings.firebaseUid;
    if (!firebaseReady.current || !uid) return;
    const timeout = window.setTimeout(() => {
      syncFirebaseSnapshot(uid, data).catch((error: unknown) => {
        setFirebaseStatus("error");
        setFirebaseMessage(cleanErrorMessage(error));
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [data]);

  useEffect(() => {
    gatewayHealth().then((health) => {
      commit((previous) => ({
        ...previous,
        providers: previous.providers.map((provider) => {
          const available = provider.adapter === "gemini" ? health.providers.gemini
            : provider.adapter === "tavily" ? health.providers.tavily
            : provider.adapter === "huggingface-image" || provider.adapter === "huggingface-video" ? health.providers.huggingface
            : provider.adapter === "elevenlabs-voice" || provider.adapter === "elevenlabs-sfx" ? health.providers.elevenlabs
            : false;
          return provider.adapter && available ? { ...provider, status: "connected", error: undefined } : provider;
        }),
      }));
    }).catch(() => {
      // Local development can run without the Firebase Functions gateway; provider tests explain the missing gateway.
    });
  }, [commit]);

  useEffect(() => {
    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPrompt);
    };
    const installedHandler = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      notify("Money Maker AI is installed on this device.", "success");
    };
    setIsInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    window.addEventListener("beforeinstallprompt", installHandler);
    window.addEventListener("appinstalled", installedHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", installHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [notify]);

  useEffect(() => {
    const incomplete = dataRef.current.productions.filter((production) =>
      ["QUEUED", "RESEARCHING", "IDEA", "STORY", "SCRIPT", "SCENES", "ASSETS", "VOICE", "ASSEMBLY", "QC"].includes(production.status),
    );
    if (incomplete.length === 0) return;
    commit((previous) => ({
      ...previous,
      productions: previous.productions.map((production) => incomplete.some((item) => item.id === production.id)
        ? {
          ...production,
          status: "FAILED",
          updatedAt: new Date().toISOString(),
          error: { provider: "Local studio", stage: titleCaseStatus(production.stage), message: "The browser was refreshed while this production was running. Your saved work is intact; retry the workflow to continue." },
        }
        : production),
    }));
  }, [commit]);

  const goTo = useCallback((next: ViewId) => {
    setView(next);
    setMobileMoreOpen(false);
    setMobileMenuOpen(false);
    if (next === "create") setConfirmProduction(false);
  }, []);

  const providerById = useCallback((id: ProviderId) => dataRef.current.providers.find((provider) => provider.id === id), []);

  const reserveUsage = useCallback((providerId: ProviderId, providerUnits: number, credits: number) => {
    const current = dataRef.current;
    const provider = current.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error("The selected provider is not available in this workspace.");
    const dateKey = dayKeyInTimeZone(new Date(), current.settings.timeZone);
    const day = current.creditsByDay[dateKey] ?? { overallUsed: 0, providers: {} };
    const providerUsed = day.providers[providerId] ?? 0;
    if (credits > 0 && !canConsume(current.settings.dailyLimit, day.overallUsed, credits)) {
      throw new DailyLimitError("Overall AI credits", day.overallUsed, current.settings.dailyLimit, prettyReset(current.settings.timeZone));
    }
    if (!canConsume(provider.dailyLimit, providerUsed, providerUnits)) {
      throw new DailyLimitError(provider.name, providerUsed, provider.dailyLimit, prettyReset(current.settings.timeZone));
    }
    commit((previous) => {
      const previousDay = previous.creditsByDay[dateKey] ?? { overallUsed: 0, providers: {} };
      return {
        ...previous,
        creditsByDay: {
          ...previous.creditsByDay,
          [dateKey]: {
            overallUsed: previousDay.overallUsed + credits,
            providers: { ...previousDay.providers, [providerId]: (previousDay.providers[providerId] ?? 0) + providerUnits },
          },
        },
      };
    });
  }, [commit]);

  const updateProduction = useCallback((id: string, patch: Partial<Production>) => {
    commit((previous) => ({
      ...previous,
      productions: previous.productions.map((production) => production.id === id
        ? { ...production, ...patch, updatedAt: new Date().toISOString() }
        : production),
    }));
  }, [commit]);

  const runPipeline = useCallback(async (id: string) => {
    if (runningJobs.current.has(id)) return;
    runningJobs.current.add(id);
    setRunning(true);
    const startingProduction = dataRef.current.productions.find((production) => production.id === id);
    if (!startingProduction) {
      runningJobs.current.delete(id);
      setRunning(false);
      return;
    }
    const liveLlm = providerIsLive(providerById("llm"));
    const liveResearch = providerIsLive(providerById("research"));
    const liveImage = providerIsLive(providerById("image"));
    const liveVideo = providerIsLive(providerById("video"));
    const liveVoice = providerIsLive(providerById("voice"));
    const liveSfx = providerIsLive(providerById("music"));
    const researchProvider = providerById("research");
    const llmProvider = providerById("llm");
    const imageProvider = providerById("image");
    const videoProvider = providerById("video");
    const voiceProvider = providerById("voice");
    const sfxProvider = providerById("music");
    let runningProduction = startingProduction;
    let researchSources = startingProduction.sources;
    let researchBrief = startingProduction.researchBrief;
    let idea = startingProduction.idea ?? demoIdea(startingProduction.topic, startingProduction.platform);
    let story = startingProduction.story;
    let script = startingProduction.script;
    let scenes = startingProduction.scenes;

    try {
      for (let index = 0; index < STAGES.length; index += 1) {
        const step = STAGES[index];
        runningProduction = dataRef.current.productions.find((production) => production.id === id) ?? runningProduction;
        updateProduction(id, { status: step.status, stage: step.status, progress: Math.round((index / STAGES.length) * 100), error: undefined });
        await new Promise((resolve) => window.setTimeout(resolve, 280));
        const providerId = step.provider;
        const live = providerId === "research" ? liveResearch
          : providerId === "llm" ? liveLlm
          : providerId === "image" ? liveImage
          : providerId === "video" ? liveVideo
          : providerId === "voice" ? liveVoice
          : providerId === "music" ? liveSfx
          : false;
        const suppliedIdea = step.id === "idea" && Boolean(startingProduction.idea);
        if (!suppliedIdea) reserveUsage(providerId, 1, STAGE_CREDIT_COST[step.id]);

        if (step.id === "research") {
          if (live && researchProvider) {
            const result = await tavilySearch(researchProvider, `${runningProduction.topic} recent reporting context sources`);
            researchSources = result.sources;
            researchBrief = result.answer;
            if (researchSources.length === 0) throw new Error("The live research provider returned no source URLs. Try a narrower topic before production.");
          } else {
            researchSources = [];
            researchBrief = `Demo research brief for “${runningProduction.topic}”. This is a workflow example, not live internet research. No source claims have been verified.`;
          }
          const history = { id: makeId(), query: runningProduction.topic, date: new Date().toISOString(), mode: live ? "live" as const : "demo" as const, sources: researchSources };
          commit((previous) => ({ ...previous, researchHistory: [history, ...previous.researchHistory].slice(0, 60) }));
          updateProduction(id, { sources: researchSources, researchBrief, researchMode: live ? "live" : "demo" });
        }

        if (step.id === "idea") {
          if (suppliedIdea && startingProduction.idea) {
            idea = startingProduction.idea;
          } else if (live && llmProvider) {
            const raw = await openAIJson(llmProvider, `For a ${runningProduction.platform} ${runningProduction.format} about “${runningProduction.topic}”, create one accurate, non-clickbait idea. Use this research brief and sources as the only factual basis: ${researchBrief}. Return JSON with title, hook, audience, concept, curiosity, emotion, visual, platform. Keep the hook curious but not misleading.`);
            const parsed = extractJson<Partial<Idea>>(raw, {});
            if (!parsed.title || !parsed.hook || !parsed.concept) throw new Error("OpenAI returned an incomplete idea object. Retry the idea stage after checking the selected model.");
            idea = { ...demoIdea(runningProduction.topic, runningProduction.platform), ...parsed };
          } else {
            idea = demoIdea(runningProduction.topic, runningProduction.platform);
          }
          updateProduction(id, { idea, title: idea.title, textMode: suppliedIdea ? runningProduction.textMode : live ? "live" : "demo" });
        }

        if (step.id === "story") {
          if (live && llmProvider) {
            const raw = await openAIJson(llmProvider, `Develop this ${runningProduction.format} as a truthful documentary story: ${idea.title}. Hook: ${idea.hook}. Concept: ${idea.concept}. Evidence available: ${researchSources.map((source) => `${source.title} (${source.url})`).join("; ") || "No live sources; identify claims that need verification."}. Return JSON with logline, opening, context, turn, resolution, audienceValue. Keep the outline concise and flag any fact requiring verification.`);
            const parsed = extractJson<Record<string, string>>(raw, {});
            story = Object.entries(parsed).map(([label, text]) => `${label.replace(/([A-Z])/g, " $1").toUpperCase()}\n${text}`).join("\n\n") || raw;
          } else {
            story = `LOGLINE\n${idea.concept}\n\nOPENING\nBegin with the specific question: ${idea.hook}\n\nCONTEXT\nIntroduce the people, place or mechanism behind ${runningProduction.topic}. Establish what is known and what still needs evidence.\n\nTURN\nFollow one revealing clue. Let the audience revise its first assumption without overstating the evidence.\n\nRESOLUTION\nAnswer the central question as far as the available sources allow, and leave the viewer with a useful takeaway.\n\nDEMO NOTE\nThis story outline is a local workflow example. It has not been fact-checked against live sources.`;
          }
          updateProduction(id, { story });
        }

        if (step.id === "script") {
          if (live && llmProvider) {
            const raw = await openAIJson(llmProvider, `Write a production-ready narration script for this concept: ${idea.title}. Story outline: ${story}. Target duration: ${runningProduction.duration}. Return JSON with openingLine, narration, closingLine, youtubeTitle, description, captions. Use spoken language, concise lines, truthful phrasing, and mark unsourced claims [VERIFY].`);
            const parsed = extractJson<Record<string, string>>(raw, {});
            script = Object.entries(parsed).map(([label, text]) => `${label.replace(/([A-Z])/g, " $1").toUpperCase()}\n${text}`).join("\n\n") || raw;
          } else {
            script = `OPENING\n${idea.hook}\n\nNARRATION\n${idea.concept}\n\nThe most useful stories do not start with a grand claim. They start with a detail worth examining. We follow the evidence, introduce context only when it helps, and separate what is documented from what remains uncertain.\n\nCLOSING\nThe best question is not always the loudest one. It is the one that helps us see the subject differently.\n\nCAPTION NOTE\nDemo narration draft only. Confirm every factual claim and source before publication.`;
          }
          updateProduction(id, { script });
        }

        if (step.id === "scenes") {
          if (live && llmProvider) {
            const raw = await openAIJson(llmProvider, `Create five continuous documentary scenes for “${idea.title}”. Script: ${script}. Return JSON with scenes array; each scene must have number, duration, narration, visual, camera, lighting, audio, text, transition. Visuals must directly support the topic and never imply footage exists when it does not. Use a coherent palette and repeat a continuity motif.`);
            const parsed = extractJson<{ scenes?: Production["scenes"] }>(raw, {});
            scenes = Array.isArray(parsed.scenes) && parsed.scenes.length >= 3 ? parsed.scenes.slice(0, 8) : demoScenes(runningProduction.topic, script);
          } else {
            scenes = demoScenes(runningProduction.topic, script);
          }
          updateProduction(id, { scenes });
        }

        if (step.id === "assets") {
          if (live && imageProvider) {
            const scene = scenes[0];
            const prompt = `Cinematic documentary hero still. Topic: ${runningProduction.topic}. Visual direction: ${scene?.visual || idea.visual}. Camera: ${scene?.camera || "cinematic medium shot"}. Lighting: ${scene?.lighting || "natural cinematic light"}. No text, no logos, realistic editorial photography.`;
            const generated = await generateImage(imageProvider.model, prompt);
            const imageDataUrls = [generated.dataUrl];
            updateProduction(id, {
              media: { ...(runningProduction.media ?? {}), imageDataUrls },
              assetNote: `Generated one story-specific hero still with ${imageProvider.name}. This is an actual provider output, not a placeholder.`,
            });
          } else {
            updateProduction(id, { assetNote: "Visual direction only. Connect and verify the image provider to generate story-specific stills." });
          }
        }

        if (step.id === "voice") {
          if (live && voiceProvider) {
            const narration = script.replace(/^[A-Z &]+\n/gm, "").slice(0, 12000);
            const generated = await generateVoice(voiceProvider.model, narration);
            updateProduction(id, {
              media: { ...(dataRef.current.productions.find((item) => item.id === id)?.media ?? {}), audioDataUrl: generated.dataUrl },
              voicePlan: `Actual narration audio generated with ${voiceProvider.name}. Delivery: warm, measured and curious.`,
            });
          } else {
            updateProduction(id, { voicePlan: "Narration direction only. Connect and verify the voice provider to synthesize the actual audio track." });
          }
        }

        if (step.id === "assembly") {
          if (live && videoProvider) {
            const primaryScene = scenes[0];
            if (!primaryScene) throw new Error("Video generation requires at least one scene.");
            const generated = await generateVideo(videoProvider.model, `Create a short cinematic documentary clip for: ${runningProduction.topic}. Scene: ${primaryScene.visual}. Camera: ${primaryScene.camera}. Lighting: ${primaryScene.lighting}. Natural realistic motion, no text overlays.`);
            updateProduction(id, {
              media: { ...(dataRef.current.productions.find((item) => item.id === id)?.media ?? {}), videoDataUrl: generated.dataUrl },
              previewMode: "rendered",
              voicePlan: dataRef.current.productions.find((item) => item.id === id)?.voicePlan || "Rendered video clip generated.",
            });
            if (liveSfx && sfxProvider) {
              reserveUsage("music", 1, 0);
              const sfx = await generateSfx(`Subtle cinematic documentary transition sound for ${runningProduction.topic}, restrained and realistic.`);
              updateProduction(id, { media: { ...(dataRef.current.productions.find((item) => item.id === id)?.media ?? {}), sfxDataUrl: sfx.dataUrl }, voicePlan: `${dataRef.current.productions.find((item) => item.id === id)?.voicePlan ?? ""} Sound design generated with ${sfxProvider.name}.` });
            }
          } else {
            updateProduction(id, { previewMode: "demo-storyboard" });
          }
        }

        if (step.id === "qc") {
          let editorialCheck: QCCheck | null = null;
          if (live && llmProvider) {
            const raw = await openAIJson(llmProvider, `Perform an editorial-risk scan, not an independent fact check. Review this story and scene plan: ${story}. Script: ${script}. Source URLs: ${researchSources.map((source) => source.url).join(", ") || "none"}. Return JSON with risk (low or high) and note. Mark high only for a serious coherence or unsupported-claim concern. Do not say that facts are verified.`);
            const parsed = extractJson<{ risk?: string; note?: string }>(raw, {});
            editorialCheck = {
              label: "AI editorial risk scan",
              status: parsed.risk === "high" ? "warning" : parsed.risk === "low" ? "pass" : "warning",
              detail: parsed.note || "The language provider returned no editorial note. Human review remains required.",
            };
          }
          const checks: QCCheck[] = [
            { label: "Story coherence", status: story.length > 80 ? "pass" : "fail", detail: story.length > 80 ? "A complete story outline is present." : "The story outline is too short; revise before review." },
            { label: "Opening hook", status: idea.hook.length > 20 ? "pass" : "fail", detail: idea.hook.length > 20 ? "A clear opening question is included." : "Add a specific opening hook before review." },
            { label: "Scene pacing", status: scenes.length >= 4 ? "pass" : "fail", detail: `${scenes.length} planned scenes are available.` },
            { label: "Visual relevance", status: scenes.some((scene) => scene.visual.length > 16) ? "pass" : "fail", detail: "Visuals are represented as a shot plan, not generated footage." },
            { label: "Source verification", status: researchSources.length > 0 ? "pass" : "warning", detail: researchSources.length > 0 ? `${researchSources.length} live source links are attached; confirm original claims.` : "Demo research has no live sources. Verify facts before public release." },
            { label: "Rendered media", status: (dataRef.current.productions.find((item) => item.id === id)?.media?.videoDataUrl || dataRef.current.productions.find((item) => item.id === id)?.media?.audioDataUrl) ? "pass" : "warning", detail: (dataRef.current.productions.find((item) => item.id === id)?.media?.videoDataUrl || dataRef.current.productions.find((item) => item.id === id)?.media?.audioDataUrl) ? "Provider-generated media is attached to this production." : "No generated media is attached; this package remains a storyboard-only production." },
            ...(editorialCheck ? [editorialCheck] : []),
          ];
          const hasFailure = checks.some((check) => check.status === "fail");
          updateProduction(id, { qc: checks, status: hasFailure ? "FAILED" : "REVIEW", stage: hasFailure ? "FAILED" : "REVIEW", progress: 100, error: hasFailure ? { provider: "Quality control", stage: "QC", message: "A serious story or scene issue needs production changes before review." } : undefined });
          if (hasFailure) {
            notify("Quality control found a serious issue. Return to production before review.", "error");
            return;
          }
        }

        runningProduction = dataRef.current.productions.find((production) => production.id === id) ?? runningProduction;
      }
      commit((previous) => ({
        ...previous,
        selectedProductionId: id,
        productions: previous.productions.map((production) => production.id === id
          ? { ...production, status: "REVIEW", stage: "REVIEW", progress: 100, updatedAt: new Date().toISOString() }
          : production),
      }));
      setSelectedReviewId(id);
      goTo("review");
      notify("Production package is ready for your review.", "success");
    } catch (error) {
      const errorMessage = cleanErrorMessage(error);
      const failingProduction = dataRef.current.productions.find((production) => production.id === id) ?? runningProduction;
      const stageName = titleCaseStatus(failingProduction.stage);
      const failedStage = STAGES.find((stage) => stage.status === failingProduction.stage);
      const providerName = error instanceof DailyLimitError ? error.providerName : (providerById(failedStage?.provider ?? "llm")?.name ?? "Production provider");
      updateProduction(id, {
        status: "FAILED",
        stage: "FAILED",
        error: { provider: providerName, stage: stageName, message: errorMessage },
      });
      if (error instanceof DailyLimitError) {
        notify(`DAILY LIMIT REACHED · ${error.providerName}: ${error.used}/${error.limit}. Resets at ${error.resetTime}.`, "error");
      } else {
        notify(`${providerName} failed during ${stageName}. Your saved work is available to retry.`, "error");
      }
    } finally {
      runningJobs.current.delete(id);
      setRunning(runningJobs.current.size > 0);
    }
  }, [commit, goTo, notify, providerById, reserveUsage, updateProduction]);

  const beginProduction = useCallback(() => {
    const normalizedTopic = draft.topic.trim();
    if (!normalizedTopic) {
      notify("Add a topic or audience question before production.", "warning");
      return;
    }
    const capacityError = pipelineCapacityError(dataRef.current, Boolean(draftIdea));
    if (capacityError) {
      notify(`DAILY LIMIT REACHED · ${capacityError.providerName}: ${capacityError.used}/${capacityError.limit}. Resets at ${capacityError.resetTime}.`, "error");
      return;
    }
    const paidProviders = dataRef.current.providers.filter((provider) => providerIsLive(provider) && provider.costRisk !== "no");
    if (paidProviders.length > 0 && !confirmProduction) {
      setConfirmProduction(true);
      return;
    }
    if (paidProviders.length > 0) {
      setConfirmProduction(false);
      const accepted = window.confirm(`POSSIBLE PAID USAGE\n\n${paidProviders.map((provider) => `${provider.name}: ${provider.dailyLimit} configured ${provider.unit}/day`).join("\n")}\n\nProvider billing/free-credit status cannot be verified by this browser app. No operation will exceed your local daily limits, but a provider may charge for any API request. Continue with live providers?`);
      if (!accepted) return;
    }

    const timestamp = new Date().toISOString();
    const production: Production = {
      id: makeId(),
      title: draftIdea?.title ?? `Untitled production: ${normalizedTopic}`,
      topic: normalizedTopic,
      platform: draft.platform,
      format: draft.format,
      duration: draft.duration,
      status: "QUEUED",
      stage: "QUEUED",
      progress: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      idea: draftIdea,
      textMode: draftIdea?.mode ?? "demo",
      story: "",
      script: "",
      scenes: [],
      sources: [],
      researchBrief: "",
      researchMode: "demo",
      assetNote: "",
      voicePlan: "",
      previewMode: "demo-storyboard",
      qc: [],
      reviewNotes: [],
    };
    commit((previous) => ({ ...previous, productions: [production, ...previous.productions], selectedProductionId: production.id }));
    setConfirmProduction(false);
    setDraftIdea(null);
    setView("production");
    void runPipeline(production.id);
  }, [commit, confirmProduction, draft, draftIdea, notify, runPipeline]);

  const retryProduction = useCallback((production: Production) => {
    setDraft({ topic: production.topic, platform: production.platform, format: production.format, duration: production.duration });
    setDraftIdea(production.idea ? { ...production.idea, mode: production.textMode } : null);
    setView("create");
    notify("Brief restored. Retry creates a new job and uses today's configured quota.", "info");
  }, [notify]);

  const runResearch = useCallback(async (query: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery || researchBusy) return;
    const provider = providerById("research");
    const live = providerIsLive(provider);
    if (live && !window.confirm("POSSIBLE PAID USAGE\n\nThis action performs a real Tavily search. Your provider may charge or deduct quota. The app will enforce its local daily limit but cannot verify your free-credit balance. Continue?")) return;
    setResearchBusy(true);
    try {
      reserveUsage("research", 1, 2);
      let sources: ResearchSource[] = [];
      if (live && provider) {
        const response = await tavilySearch(provider, cleanQuery);
        sources = response.sources;
        if (sources.length === 0) throw new Error("The live provider returned no source URLs.");
      }
      const entry = { id: makeId(), query: cleanQuery, date: new Date().toISOString(), mode: live ? "live" as const : "demo" as const, sources };
      commit((previous) => ({ ...previous, researchHistory: [entry, ...previous.researchHistory].slice(0, 60) }));
      setResearchQuery(cleanQuery);
      notify(live ? `Research saved with ${sources.length} live source links.` : "Demo research brief saved. No web search was performed.", live ? "success" : "info");
    } catch (error) {
      notify(error instanceof DailyLimitError ? `DAILY LIMIT REACHED · ${error.providerName}: ${error.used}/${error.limit}.` : cleanErrorMessage(error), "error");
    } finally {
      setResearchBusy(false);
    }
  }, [commit, notify, providerById, reserveUsage, researchBusy]);

  const createMoreIdeas = useCallback(async (topic: string) => {
    const cleanTopic = topic.trim();
    if (!cleanTopic || ideasBusy) return;
    const provider = providerById("llm");
    const live = providerIsLive(provider);
    if (live && !window.confirm("POSSIBLE PAID USAGE\n\nThis action sends a prompt to your configured language provider. Your provider may charge or deduct quota. The app will enforce its local daily limit but cannot verify free credits. Continue?")) return;
    setIdeasBusy(true);
    try {
      reserveUsage("llm", 1, 1);
      let ideas: Idea[];
      if (live && provider) {
        const raw = await openAIJson(provider, `Create three distinct documentary content ideas about “${cleanTopic}”. Avoid clickbait. Return JSON with an ideas array; each item has title, hook, audience, concept, curiosity, emotion, visual, platform. Include no invented facts or claims of live research.`);
        const parsed = extractJson<{ ideas?: Idea[] }>(raw, {});
        if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) throw new Error("The language provider returned an incomplete idea list. No demo substitute was used.");
        ideas = parsed.ideas.slice(0, 5);
      } else {
        ideas = demoIdeas(cleanTopic, draft.platform);
      }
      const saved: SavedIdea[] = ideas.map((idea) => ({ ...demoIdea(cleanTopic, draft.platform), ...idea, id: makeId(), topic: cleanTopic, mode: live ? "live" as const : "demo" as const, createdAt: new Date().toISOString() }));
      commit((previous) => ({ ...previous, ideas: [...saved, ...previous.ideas].slice(0, 100) }));
      notify(live ? "Live-provider ideas saved." : "Demo idea directions saved. No external model was used.", live ? "success" : "info");
    } catch (error) {
      notify(error instanceof DailyLimitError ? `DAILY LIMIT REACHED · ${error.providerName}: ${error.used}/${error.limit}.` : cleanErrorMessage(error), "error");
    } finally {
      setIdeasBusy(false);
    }
  }, [commit, draft.platform, ideasBusy, notify, providerById, reserveUsage]);

  const refineIdea = useCallback(async (idea: SavedIdea) => {
    if (refiningIdeaId) return;
    const provider = providerById("llm");
    const live = providerIsLive(provider);
    if (live && !window.confirm("POSSIBLE PAID USAGE\n\nRefining this idea sends a prompt to your configured language provider. Continue?")) return;
    setRefiningIdeaId(idea.id);
    try {
      reserveUsage("llm", 1, 1);
      let refined: Idea;
      if (live && provider) {
        const raw = await openAIJson(provider, `Refine this existing ${idea.platform} story idea without changing its factual scope. Keep it non-clickbait and improve specificity, visual clarity and audience value. Return JSON with title, hook, audience, concept, curiosity, emotion, visual, platform. Existing idea: ${JSON.stringify(idea)}.`);
        const parsed = extractJson<Partial<Idea>>(raw, {});
        if (!parsed.title || !parsed.hook || !parsed.concept) throw new Error("The language provider returned an incomplete refinement. No demo substitute was used.");
        refined = { ...idea, ...parsed };
      } else {
        refined = {
          ...idea,
          title: `A closer look at ${idea.topic}`,
          hook: `What would change if we looked at ${idea.topic} through one specific clue?`,
          concept: `Refined demo direction: narrow “${idea.topic}” to one question, follow a visible clue, distinguish evidence from assumption, and end with a clear audience takeaway.`,
          curiosity: "Hold back the explanation until the strongest verified clue earns it.",
          visual: "Build one consistent motif around a real, topic-specific visual reference.",
        };
      }
      const saved: SavedIdea = { ...refined, id: makeId(), topic: idea.topic, mode: live ? "live" : "demo", createdAt: new Date().toISOString() };
      commit((previous) => ({ ...previous, ideas: [saved, ...previous.ideas].slice(0, 100) }));
      notify(live ? "Refined idea saved from the connected language provider." : "A clearly labeled demo refinement was saved.", live ? "success" : "info");
    } catch (error) {
      notify(error instanceof DailyLimitError ? `DAILY LIMIT REACHED · ${error.providerName}: ${error.used}/${error.limit}.` : cleanErrorMessage(error), "error");
    } finally {
      setRefiningIdeaId(null);
    }
  }, [commit, notify, providerById, refiningIdeaId, reserveUsage]);

  const openProviderEditor = useCallback((id: ProviderId) => {
    const provider = dataRef.current.providers.find((item) => item.id === id);
    if (!provider) return;
    setProviderForm({ name: provider.name, model: provider.model, dailyLimit: provider.dailyLimit, enabled: provider.enabled, apiKey: "" });
    setEditingProvider(id);
  }, []);

  const saveProvider = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProvider) return;
    const current = dataRef.current.providers.find((provider) => provider.id === editingProvider);
    if (!current) return;
    const changedModel = providerForm.model.trim() !== current.model;
    commit((previous) => ({
      ...previous,
      providers: previous.providers.map((provider) => provider.id === editingProvider
        ? {
          ...provider,
          name: providerForm.name.trim() || provider.name,
          model: providerForm.model.trim() || provider.model,
          dailyLimit: Math.max(0, Math.floor(Number(providerForm.dailyLimit) || 0)),
          enabled: providerForm.enabled,
          status: provider.adapter ? (changedModel ? "demo" : provider.status) : "demo",
          error: undefined,
        }
        : provider),
    }));
    const supported = current.adapter !== null;
    setEditingProvider(null);
    notify(supported ? "Provider settings saved. The live secret is server-managed; test the connection to verify it." : "Provider notes saved. This provider requires a dedicated OAuth adapter.", supported ? "success" : "info");
  }, [commit, editingProvider, notify, providerForm]);

  const testProvider = useCallback(async (id: ProviderId) => {
    const provider = dataRef.current.providers.find((item) => item.id === id);
    if (!provider) return;
    if (!provider.adapter) {
      notify(`${provider.name} is not connected because this provider requires an official OAuth adapter.`, "warning");
      return;
    }
    if (id === "research" && !window.confirm("Tavily connection testing performs a real search and may consume provider quota. Continue?")) return;
    setTestingProvider(id);
    try {
      reserveUsage(id, 1, 1);
      const result = await testGatewayProvider(provider.adapter, provider.model);
      if (!result.ok) throw new Error(`${provider.name} connection test did not return a successful provider response.`);
      commit((previous) => ({
        ...previous,
        providers: previous.providers.map((item) => item.id === id ? { ...item, status: "connected", error: undefined } : item),
      }));
      notify(`${provider.name} server connection verified. Provider secrets remain outside the browser.`, "success");
    } catch (error) {
      const errorMessage = cleanErrorMessage(error);
      if (!(error instanceof DailyLimitError)) {
        commit((previous) => ({
          ...previous,
          providers: previous.providers.map((item) => item.id === id ? { ...item, status: "error", error: errorMessage } : item),
        }));
      }
      notify(error instanceof DailyLimitError ? `DAILY LIMIT REACHED · ${error.providerName}: ${error.used}/${error.limit}.` : errorMessage, "error");
    } finally {
      setTestingProvider(null);
    }
  }, [commit, notify, reserveUsage]);

  const connectConfiguredFirebase = useCallback(async (config: FirebaseConfigInput) => {
    if (!config.apiKey || !config.projectId || !config.appId || !config.authDomain) {
      notify("Enter the Firebase API key, auth domain, project ID and app ID first.", "warning");
      return;
    }
    firebaseReady.current = false;
    firebaseBootstrap.current = true;
    setFirebaseStatus("connecting");
    setFirebaseMessage("Connecting with Firebase anonymous authentication…");
    const savedConfig = { ...config };
    commit((previous) => ({ ...previous, settings: { ...previous.settings, firebaseConfig: savedConfig, firebaseUid: null } }));
    try {
      const uid = await connectFirebase(savedConfig);
      const remote = await readFirebaseSnapshot(uid);
      commit((previous) => ({
        ...previous,
        productions: mergeByUpdatedAt(previous.productions, remote.productions ?? []),
        ideas: mergeByUpdatedAt(previous.ideas, remote.ideas ?? []),
        researchHistory: mergeByUpdatedAt(previous.researchHistory, remote.researchHistory ?? []),
        creditsByDay: mergeUsage(previous.creditsByDay, remote.creditsByDay ?? {}),
        providers: mergeProviderMetadata(previous.providers, remote.providers),
        settings: { ...previous.settings, ...remote.settings, firebaseUid: uid, firebaseConfig: savedConfig },
      }));
      firebaseReady.current = true;
      setFirebaseStatus("connected");
      setFirebaseMessage("Private workspace sync is connected. Provider secrets stay in this browser and are never uploaded.");
      notify("Firebase is connected. Production documents will sync to your private workspace.", "success");
    } catch (error) {
      firebaseReady.current = false;
      const message = cleanErrorMessage(error);
      setFirebaseStatus("error");
      setFirebaseMessage(message);
      notify(`Firebase connection failed: ${message}`, "error");
    }
  }, [commit, notify]);

  const installApp = useCallback(async () => {
    if (!installPrompt) {
      notify(isInstalled ? "Money Maker AI is already installed on this device." : "Use your browser menu and choose Install app or Add to Home Screen.", "info");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt, isInstalled, notify]);

  const approveProduction = useCallback((production: Production) => {
    const timestamp = new Date().toISOString();
    updateProduction(production.id, { status: "APPROVED", stage: "APPROVED", approvedAt: timestamp, error: undefined });
    commit((previous) => ({ ...previous, selectedProductionId: production.id }));
    notify("Production package approved. No social account was accessed or published to.", "success");
  }, [commit, notify, updateProduction]);

  const submitReviewRequest = useCallback(() => {
    if (!selectedReview) return;
    const note = reviewRequestText.trim();
    if (!note) {
      notify("Add a change request so the production team knows what to revise.", "warning");
      return;
    }
    updateProduction(selectedReview.id, {
      status: "REVISIONS_REQUESTED",
      stage: "SCRIPT",
      reviewNotes: [...selectedReview.reviewNotes, note],
      error: undefined,
    });
    setReviewRequestText("");
    setReviewRequestOpen(false);
    notify("Revision request saved to the production record.", "success");
  }, [notify, reviewRequestText, selectedReview, updateProduction]);

  const rejectProduction = useCallback((production: Production) => {
    const accepted = window.confirm(`Reject “${production.title}”? This keeps the package in your library with a rejected status.`);
    if (!accepted) return;
    updateProduction(production.id, { status: "REJECTED", stage: "REJECTED" });
    notify("Production rejected and retained in the library.", "info");
  }, [notify, updateProduction]);

  const useIdea = useCallback((idea: Idea & Partial<SavedIdea>) => {
    setDraft((previous) => ({ ...previous, topic: idea.topic || idea.title, platform: idea.platform || previous.platform }));
    setDraftIdea(idea);
    setView("create");
    notify("Idea added to a new production brief.", "success");
  }, [notify]);

  const saveSettings = useCallback((settingsPatch: Partial<StudioData["settings"]>) => {
    commit((previous) => ({ ...previous, settings: { ...previous.settings, ...settingsPatch } }));
    notify("Studio settings saved on this device.", "success");
  }, [commit, notify]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      window.setTimeout(() => setCopiedText(""), 1800);
      notify(`${label} copied to clipboard.`, "success");
    } catch {
      notify("Clipboard access is unavailable. Select and copy the text manually.", "warning");
    }
  }, [notify]);

  const saveResearchForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runResearch(researchQuery);
  };

  const saveIdeasForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void createMoreIdeas(ideasTopic);
  };

  const productionFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    beginProduction();
  };

  const currentTitle = NAV_ITEMS.find((item) => item.id === view)?.label ?? "Dashboard";
  const filteredLibrary = useMemo(() => data.productions.filter((production) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || `${production.title} ${production.topic} ${production.platform} ${production.format}`.toLowerCase().includes(query);
  }), [data.productions, searchQuery]);
  const recentProductions = data.productions.slice(0, 4);
  const providerGroups = [...new Set(data.providers.map((provider) => provider.group))];
  const providersToShow = data.providers.filter((provider) => providerFilter === "All providers" || provider.group === providerFilter);
  const latestResearch = data.researchHistory[0] ?? null;
  const isPaidPipeline = liveProviders.length > 0;
  const estimatedCredits = TOTAL_PIPELINE_CREDITS - (draftIdea ? 1 : 0);
  const estimatedUnits = Object.values(PIPELINE_PROVIDER_UNITS).reduce((sum, value) => sum + value, 0) - (draftIdea ? 1 : 0);

  const usageMeter = (provider: ProviderConfig, compact = false) => {
    const used = activeDay.providers[provider.id] ?? 0;
    const percent = clampPercent(used, provider.dailyLimit);
    return <div className={`usage-meter ${compact ? "usage-meter-compact" : ""}`} key={provider.id}>
      <div className="usage-meter-heading">
        <span>{provider.id === "llm" ? "LLM" : provider.id === "research" ? "Research" : provider.id === "image" ? "Images" : provider.id === "video" ? "Video" : provider.id === "voice" ? "Voice" : provider.name}</span>
        <span><strong>{used}</strong> / {provider.dailyLimit}{provider.id === "voice" ? " min" : ""}</span>
      </div>
      <div className="meter-track"><span style={{ width: `${percent}%` }} /></div>
      {!compact ? <span className="usage-meter-foot">{getRemaining(provider.dailyLimit, used)} {provider.unit} remaining</span> : null}
    </div>;
  };

  const usageOverview = (compact = false) => <section className={`usage-overview ${compact ? "usage-overview-compact" : ""}`}>
    <div className="usage-overview-top">
      <div>
        <span className="eyebrow">DAILY CREDIT MANAGER</span>
        <h3>{usedCredits}<span> / {data.settings.dailyLimit}</span></h3>
        <p>credits used today · resets at {prettyReset(data.settings.timeZone)}</p>
      </div>
      <div className="usage-overview-percent">{clampPercent(usedCredits, data.settings.dailyLimit)}<small>%</small></div>
    </div>
    <div className="overall-meter"><span style={{ width: `${clampPercent(usedCredits, data.settings.dailyLimit)}%` }} /></div>
    <div className="usage-breakdown">
      {data.providers.filter((provider) => ["llm", "research", "image", "video", "voice"].includes(provider.id)).map((provider) => usageMeter(provider, true))}
    </div>
    {!compact ? <div className="usage-overview-bottom"><span>{remainingCredits} credits available</span><button className="text-button" onClick={() => goTo("providers")}>Manage provider limits <ArrowRight size={14} /></button></div> : null}
  </section>;

  const statusBadge = (status: JobStatus) => {
    const tone = status === "APPROVED" || status === "PUBLISHED" ? "green" : status === "FAILED" || status === "REJECTED" ? "red" : status === "REVIEW" || status === "REVISIONS_REQUESTED" ? "amber" : "neutral";
    return <Badge tone={tone}>{titleCaseStatus(status)}</Badge>;
  };

  const productionRow = (production: Production, onOpen?: () => void) => <button className="production-row" key={production.id} onClick={onOpen ?? (() => { commit((previous) => ({ ...previous, selectedProductionId: production.id })); goTo("production"); })}>
    <span className="production-row-art" style={{ backgroundImage: "url('/assets/images/featured-frame.jpg')" }}><Film size={17} /></span>
    <span className="production-row-main">
      <strong>{production.title}</strong>
      <small>{production.platform} <span>·</span> {production.format} <span>·</span> {formatDate(production.createdAt)}</small>
    </span>
    <span className="production-row-status">{statusBadge(production.status)}</span>
    <ChevronRight className="production-row-arrow" size={16} />
  </button>;

  const providerStatus = (provider: ProviderConfig) => {
    if (provider.status === "connected") return <Badge tone="green" icon={Check}>Connected</Badge>;
    if (provider.status === "configured") return <Badge tone="amber">Ready to test</Badge>;
    if (provider.status === "error") return <Badge tone="red" icon={CircleAlert}>Connection error</Badge>;
    return <Badge tone="neutral">Demo route</Badge>;
  };

  const dashboardPage = <div className="page-content dashboard-page">
    <div className="dashboard-hero">
      <div className="dashboard-hero-photo" aria-hidden="true" />
      <div className="dashboard-hero-content">
        <div className="hero-brand-line"><BrandMark small /><span>MONEY MAKER AI</span><span className="hero-divider" /> <span>CONTENT PRODUCTION STUDIO</span></div>
        <h1>Make stories<br />worth staying for.</h1>
        <p>Research-led ideas. Deliberate storytelling. A studio workflow that keeps you in control.</p>
        <AppButton onClick={() => goTo("create")} icon={WandSparkles} className="hero-cta">Create today's video</AppButton>
      </div>
      <div className="hero-photo-credit"><span className="hero-credit-dot" /> CINEMATIC STORYBOARD · DEMO ARTWORK</div>
    </div>

    <div className="dashboard-grid">
      <div className="dashboard-primary-column">
        <div className="section-head-row">
          <div><div className="eyebrow">YOUR STUDIO TODAY</div><h2>Production at a glance</h2></div>
          <span className="quiet-date">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span>
        </div>
        {currentProduction ? <div className="current-production-panel">
          <div className="current-production-top"><div><span className="eyebrow">CURRENT PRODUCTION</span><h3>{currentProduction.title}</h3><p>{currentProduction.topic}</p></div>{statusBadge(currentProduction.status)}</div>
          <div className="current-progress"><div className="current-progress-bar"><span style={{ width: `${currentProduction.progress}%` }} /></div><span>{currentProduction.progress}%</span></div>
          <div className="current-production-bottom"><span><Clock3 size={14} /> {titleCaseStatus(currentProduction.stage)}</span><AppButton variant="ghost" icon={ArrowRight} onClick={() => { commit((previous) => ({ ...previous, selectedProductionId: currentProduction.id })); goTo(currentProduction.status === "REVIEW" ? "review" : "production"); }}>Open production</AppButton></div>
        </div> : <div className="first-production-prompt">
          <div className="prompt-index">01</div><div><strong>Your first production starts with a question.</strong><p>{liveProviders.length ? "Connected text/search providers are available; image, video and voice stages remain explicitly in demo mode." : "No providers connected yet. Demo mode walks the brief through research, story, script, scene design and review."}</p></div>
          <button className="round-arrow" aria-label="Start your first production" onClick={() => goTo("create")}><ArrowRight size={18} /></button>
        </div>}

        <div className="section-head-row recent-section-head">
          <div><div className="eyebrow">RECENT WORK</div><h2>Production library</h2></div>
          <button className="text-button" onClick={() => goTo("library")}>View all <ArrowRight size={14} /></button>
        </div>
        {recentProductions.length ? <div className="recent-production-list">{recentProductions.map((production) => productionRow(production, () => {
          commit((previous) => ({ ...previous, selectedProductionId: production.id }));
          goTo(production.status === "REVIEW" || production.status === "REVISIONS_REQUESTED" ? "review" : "production");
        }))}</div> : <div className="empty-inline"><span>No productions yet.</span><button className="text-button" onClick={() => goTo("create")}>Start with a brief <ArrowRight size={14} /></button></div>}
      </div>
      <aside className="dashboard-side-column">
        {usageOverview()}
        <div className="provider-summary">
          <div className="provider-summary-head"><div><span className="eyebrow">AI PROVIDERS</span><h3>{liveProviders.length ? `${liveProviders.length} verified` : "Your studio is ready"}</h3></div><button className="round-arrow round-arrow-light" aria-label="Manage providers" onClick={() => goTo("providers")}><ArrowRight size={16} /></button></div>
          <p>{mode === "DEMO MODE" ? "Connect a provider when you are ready. No API key is required to explore." : "Unconnected production stages remain clearly marked as demo."}</p>
          <div className="provider-summary-list">{data.providers.filter((provider) => ["llm", "research", "video", "voice"].includes(provider.id)).map((provider) => <div key={provider.id}><span className={`provider-status-dot ${provider.status === "connected" ? "is-connected" : ""}`} /><span>{provider.id === "llm" ? "Language" : provider.id === "research" ? "Research" : provider.id === "video" ? "Video" : "Voice"}</span><strong>{provider.status === "connected" ? "Connected" : provider.adapter ? "Demo" : "Not connected"}</strong></div>)}</div>
          <button className="text-button provider-summary-link" onClick={() => goTo("providers")}>Configure AI providers <ArrowRight size={14} /></button>
        </div>
      </aside>
    </div>
  </div>;

  const createPage = <div className="page-content">
    <PanelHeading eyebrow="NEW PRODUCTION · 01 / BRIEF" title="Start with a better question." description="Set the story direction. The studio will build a research-led production package for human review." action={<Badge tone={mode === "DEMO MODE" ? "amber" : "green"} icon={mode === "DEMO MODE" ? Sparkles : Radio}>{mode}</Badge>} />
    <div className="create-layout">
      <form className="brief-form" onSubmit={productionFormSubmit}>
        <label className="field-label" htmlFor="brief-topic">The story or audience question <span>Required</span></label>
        <textarea id="brief-topic" className="field-control topic-textarea" maxLength={240} value={draft.topic} onChange={(event) => setDraft((previous) => ({ ...previous, topic: event.target.value }))} placeholder="What is the question worth exploring?" required />
        {draftIdea ? <div className="selected-idea-note"><Lightbulb size={15} /><span>Starting from: <strong>{draftIdea.title}</strong></span><button type="button" aria-label="Remove selected idea" onClick={() => setDraftIdea(null)}><X size={14} /></button></div> : null}
        <div className="form-grid-three">
          <label className="field-label">Platform<select className="field-control" value={draft.platform} onChange={(event) => setDraft((previous) => ({ ...previous, platform: event.target.value }))}>{PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
          <label className="field-label">Story format<select className="field-control" value={draft.format} onChange={(event) => setDraft((previous) => ({ ...previous, format: event.target.value }))}>{FORMATS.map((format) => <option key={format}>{format}</option>)}</select></label>
          <label className="field-label">Target duration<select className="field-control" value={draft.duration} onChange={(event) => setDraft((previous) => ({ ...previous, duration: event.target.value }))}>{["30–60 seconds", "1–3 minutes", "3–5 minutes", "5–8 minutes", "8–12 minutes"].map((duration) => <option key={duration}>{duration}</option>)}</select></label>
        </div>
        <div className="brief-guidance"><span className="guidance-symbol"><Target size={16} /></span><div><strong>Producer's note</strong><p>Choose one specific curiosity. A narrower question makes better research, clearer visuals and a more satisfying ending.</p></div></div>
        <div className="brief-submit-row">
          <div><span className="eyebrow">ESTIMATED LOCAL USAGE</span><strong>{estimatedCredits} credits · {estimatedUnits} tracked stage units</strong><small>{isPaidPipeline ? "POSSIBLE PAID USAGE · provider billing varies; confirmation required." : "Demo mode · no third-party API calls or charges."}</small></div>
          <AppButton type="submit" icon={running ? LoaderCircle : ArrowRight} disabled={running} className={running ? "button-working" : ""}>{confirmProduction ? "Confirm and start" : "Create production"}</AppButton>
        </div>
        {confirmProduction && isPaidPipeline ? <div className="paid-warning"><CircleAlert size={17} /><div><strong>Possible paid usage</strong><p>Live providers are configured. The app cannot know whether your account has free credits. Confirm that provider billing is acceptable before any request is sent.</p></div><button className="text-button" type="button" onClick={() => setConfirmProduction(false)}>Cancel</button></div> : null}
      </form>

      <aside className="create-side-note">
        <div className="create-note-top"><span className="eyebrow">THE PRODUCTION PATH</span><h3>One story.<br />Built with intent.</h3><p>Each step is saved locally as it runs. Refreshing the browser will not erase the brief or completed work.</p></div>
        <div className="workflow-mini-list">{STAGES.map((stage, index) => <div className="workflow-mini-row" key={stage.id}><span className="workflow-mini-index">{String(index + 1).padStart(2, "0")}</span><span>{stage.label}</span><small>{stage.id === "research" ? "Evidence" : stage.id === "qc" ? "Review" : "Studio"}</small></div>)}</div>
        <div className="create-safety-note"><ShieldCheck size={16} /><span>Human approval is required. Nothing publishes automatically.</span></div>
      </aside>
    </div>
  </div>;

  const researchPage = <div className="page-content">
    <PanelHeading eyebrow="RESEARCH DESK · SOURCE FIRST" title="Find the story in the evidence." description="Search for current public sources with Tavily, or explore the workflow in demo mode. Demo briefs are never presented as live research." />
    <form className="research-search-form" onSubmit={saveResearchForm}>
      <div className="search-field-wrap"><Search size={18} /><input className="field-control" value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="Ask a research question or enter a topic" required /><kbd>↵</kbd></div>
      <AppButton type="submit" icon={researchBusy ? LoaderCircle : Search} disabled={researchBusy}>{researchBusy ? "Searching…" : providerIsLive(providerById("research")) ? "Search the web" : "Create demo brief"}</AppButton>
    </form>
    {!providerIsLive(providerById("research")) ? <div className="inline-notice notice-amber"><Sparkles size={16} /><span><strong>Demo research.</strong> No web request is made in this mode. Add and test a Tavily key to collect source URLs.</span><button className="text-button" onClick={() => goTo("providers")}>Set up research <ArrowRight size={14} /></button></div> : null}
    <div className="research-workspace">
      <div className="research-main-column">
        <div className="section-head-row"><div><div className="eyebrow">LATEST RESEARCH BRIEF</div><h2>{latestResearch?.query ?? "Nothing researched yet"}</h2></div>{latestResearch ? <Badge tone={latestResearch.mode === "live" ? "green" : "amber"}>{modeLabel(latestResearch.mode)}</Badge> : null}</div>
        {latestResearch ? <>
          <div className="research-brief-meta"><span><Clock3 size={14} /> {formatDate(latestResearch.date, true)}</span><span>{latestResearch.sources.length} source{latestResearch.sources.length === 1 ? "" : "s"}</span></div>
          {latestResearch.sources.length ? <div className="source-list">{latestResearch.sources.map((source, index) => <a className="source-row" key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><span className="source-number">{String(index + 1).padStart(2, "0")}</span><span className="source-copy"><strong>{source.title}</strong><small>{source.summary}</small><em>{source.url}</em></span><ExternalLink size={15} /></a>)}</div> : <div className="research-demo-note"><div className="demo-stamp">NOT VERIFIED</div><p>This saved entry records a demo workflow step. It contains no live links, current trend data or verified facts.</p></div>}
        </> : <EmptyState icon={Globe2} title="Research begins with a question" body="Try a focused topic. With Tavily connected, this desk stores real source URLs and their search date; without it, the app records a clearly marked demo brief." />}
        {data.researchHistory.length > 1 ? <div className="research-history"><div className="eyebrow">RECENT QUERIES</div>{data.researchHistory.slice(1, 6).map((entry) => <button key={entry.id} onClick={() => { setResearchQuery(entry.query); void runResearch(entry.query); }}><span>{entry.query}</span><Badge tone={entry.mode === "live" ? "green" : "neutral"}>{entry.mode === "live" ? "Live" : "Demo"}</Badge><ChevronRight size={15} /></button>)}</div> : null}
      </div>
      <aside className="research-side-column">
        <div className="research-principles"><span className="eyebrow">RESEARCH STANDARD</span><div className="principle-item"><span>01</span><div><strong>Keep the source</strong><p>Live results store their original URL, source title, summary and date.</p></div></div><div className="principle-item"><span>02</span><div><strong>Separate evidence from angle</strong><p>A search result is a lead, not independent fact-checking.</p></div></div><div className="principle-item"><span>03</span><div><strong>No invented trends</strong><p>Demo mode does not claim to know what is trending today.</p></div></div></div>
        <div className="text-action-panel"><ImageIcon size={18} /><div><strong>Find an image story?</strong><p>Use visual potential as a production criterion, not a substitute for evidence.</p></div></div>
      </aside>
    </div>
  </div>;

  const ideasPage = <div className="page-content">
    <PanelHeading eyebrow="IDEA ROOM · QUALITY OVER VOLUME" title="A strong angle earns attention." description="Explore distinct story directions, then carry a selected idea straight into production." />
    <form className="idea-generator-form" onSubmit={saveIdeasForm}><label className="field-label" htmlFor="ideas-topic">What should the studio explore?</label><div className="idea-generator-row"><input id="ideas-topic" className="field-control" value={ideasTopic} onChange={(event) => setIdeasTopic(event.target.value)} /><AppButton type="submit" icon={ideasBusy ? LoaderCircle : Sparkles} disabled={ideasBusy}>{ideasBusy ? "Thinking…" : "Generate ideas"}</AppButton></div><small>{providerIsLive(providerById("llm")) ? "A tested language provider will generate ideas. Provider cost and quota apply." : "Demo ideas are locally composed examples, not live AI output."}</small></form>
    {data.ideas.length ? <div className="idea-list">{data.ideas.map((idea, index) => <article className="idea-row" key={idea.id}><div className="idea-row-index">{String(index + 1).padStart(2, "0")}</div><div className="idea-row-content"><div className="idea-row-meta"><Badge tone={idea.mode === "live" ? "green" : "neutral"}>{modeLabel(idea.mode)}</Badge><span>{idea.platform}</span><span>{formatDate(idea.createdAt)}</span></div><h3>{idea.title}</h3><p className="idea-hook">“{idea.hook}”</p><div className="idea-detail-grid"><div><span>CONCEPT</span><p>{idea.concept}</p></div><div><span>EMOTIONAL ANGLE</span><p>{idea.emotion}</p></div><div><span>VISUAL POTENTIAL</span><p>{idea.visual}</p></div><div><span>AUDIENCE</span><p>{idea.audience}</p></div></div></div><div className="idea-row-action"><AppButton variant="ghost" icon={refiningIdeaId === idea.id ? LoaderCircle : RefreshCw} disabled={refiningIdeaId === idea.id} onClick={() => void refineIdea(idea)}>{refiningIdeaId === idea.id ? "Refining…" : "Refine"}</AppButton><AppButton variant="secondary" icon={ArrowRight} onClick={() => useIdea(idea)}>Use idea</AppButton></div></article>)}</div> : <EmptyState icon={Lightbulb} title="Your idea room is clear" body="Generate three angles from a focused question. Each idea is labeled with the mode that created it and can be refined in your production brief." action={<AppButton onClick={() => void createMoreIdeas(ideasTopic)} icon={Sparkles}>Generate demo ideas</AppButton>} />}
  </div>;

  const productionProgress = (production: Production) => {
    const currentIndex = STAGES.findIndex((stage) => stage.status === production.status);
    return <div className="production-steps" aria-label="Production pipeline progress">
      {STAGES.map((stage, index) => {
        const isDone = production.status === "REVIEW" || production.status === "APPROVED" || production.status === "PUBLISHED" || index < currentIndex;
        const isCurrent = !isDone && stage.status === production.status;
        return <div className={`production-step ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`} key={stage.id}>
          <span className="step-dot">{isDone ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</span>
          <span>{stage.label}</span>
          {index < STAGES.length - 1 ? <i /> : null}
        </div>;
      })}
    </div>;
  };

  const productionDetail = (production: Production) => <div className="production-detail">
    <div className="production-detail-head"><div><div className="eyebrow">JOB {production.id.slice(0, 8).toUpperCase()} · {formatDate(production.createdAt, true)}</div><h2>{production.title}</h2><p>{production.topic}</p></div><div className="production-detail-status">{statusBadge(production.status)}</div></div>
    {production.status !== "APPROVED" && production.status !== "PUBLISHED" && production.status !== "REJECTED" ? <div className="progress-summary"><div className="progress-summary-copy"><strong>{production.status === "FAILED" ? "Workflow paused" : production.status === "REVIEW" ? "Production package ready" : titleCaseStatus(production.stage)}</strong><span>{production.progress}% complete</span></div><div className="current-progress-bar"><span style={{ width: `${production.progress}%` }} /></div></div> : null}
    {productionProgress(production)}
    {production.error ? <div className="production-error"><CircleAlert size={18} /><div><strong>{production.error.provider} · {production.error.stage}</strong><p>{production.error.message}</p></div><AppButton variant="secondary" icon={RefreshCw} onClick={() => retryProduction(production)}>Retry workflow</AppButton></div> : null}
    <div className="production-output-grid">
      <section className="production-output-section"><div className="production-output-head"><div><span className="eyebrow">01 · RESEARCH</span><h3>Evidence & context</h3></div><Badge tone={production.researchMode === "live" ? "green" : "amber"}>{modeLabel(production.researchMode)}</Badge></div><p className="production-output-copy">{production.researchBrief || "Research will appear here as the pipeline advances."}</p>{production.sources.length ? <div className="source-chip-list">{production.sources.slice(0, 5).map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />{source.title}</a>)}</div> : production.researchBrief ? <div className="verification-reminder"><CircleAlert size={14} /> No live source links are attached.</div> : null}</section>
      <section className="production-output-section"><div className="production-output-head"><div><span className="eyebrow">02 · IDEA</span><h3>{production.idea?.title ?? "Idea in development"}</h3></div>{production.idea ? <Badge tone={production.textMode === "live" ? "green" : "neutral"}>{production.textMode === "live" ? "LIVE PROVIDER" : "DEMO IDEA"}</Badge> : null}</div>{production.idea ? <><p className="idea-hook">“{production.idea.hook}”</p><p className="production-output-copy">{production.idea.concept}</p></> : <p className="production-output-copy">The selected angle and audience benefit will appear here.</p>}</section>
      <section className="production-output-section production-wide-section"><div className="production-output-head"><div><span className="eyebrow">03 · STORY & SCRIPT</span><h3>Writer's room</h3></div><Badge tone={production.script ? "green" : "neutral"}>{production.script ? "Draft saved" : "Waiting"}</Badge></div><details open={Boolean(production.story)}><summary>Story structure</summary><pre>{production.story || "The story outline will appear here."}</pre></details><details open={Boolean(production.script)}><summary>Scene-by-scene narration</summary><pre>{production.script || "The production script will appear here."}</pre></details></section>
      <section className="production-output-section production-wide-section"><div className="production-output-head"><div><span className="eyebrow">04 · SCENE DESIGN</span><h3>{production.scenes.length ? `${production.scenes.length} planned scenes` : "Scenes in development"}</h3></div><Badge tone="neutral">{production.format}</Badge></div>{production.scenes.length ? <div className="scene-list">{production.scenes.map((scene) => <article className="scene-row" key={`${production.id}-scene-${scene.number}`}><div className="scene-number">{String(scene.number).padStart(2, "0")}<small>{scene.duration}</small></div><div className="scene-copy"><strong>{scene.narration}</strong><p>{scene.visual}</p><div className="scene-tech-row"><span>CAMERA · {scene.camera}</span><span>LIGHT · {scene.lighting}</span><span>AUDIO · {scene.audio}</span></div></div></article>)}</div> : <p className="production-output-copy">The shot plan is generated after the story and script.</p>}</section>
      <section className="production-output-section"><div className="production-output-head"><div><span className="eyebrow">05 · ASSET PLAN</span><h3>Visual direction</h3></div><ImageIcon size={17} /></div><p className="production-output-copy">{production.assetNote || "No generated assets."}</p>{production.media?.imageDataUrls?.length ? <div className="generated-media-grid">{production.media.imageDataUrls.map((src, index) => <img key={`${production.id}-image-${index}`} src={src} alt={`Generated scene ${index + 1}`} loading="lazy" />)}</div> : <div className="asset-note-image"><img src="/assets/images/featured-frame.jpg" alt="Illustrative cinematic mood-board frame" /><span>NO STORY-SPECIFIC IMAGE GENERATED YET</span></div>}</section>
      <section className="production-output-section"><div className="production-output-head"><div><span className="eyebrow">06 · VOICE & ASSEMBLY</span><h3>Delivery plan</h3></div><AudioLines size={17} /></div><p className="production-output-copy">{production.voicePlan || "No generated voice or sound file."}</p>{production.media?.audioDataUrl ? <audio className="generated-audio" controls src={production.media.audioDataUrl} /> : null}{production.media?.sfxDataUrl ? <audio className="generated-audio" controls src={production.media.sfxDataUrl} /> : null}{production.media?.videoDataUrl ? <video className="generated-video" controls playsInline src={production.media.videoDataUrl} /> : <div className="storyboard-state"><Video size={17} /><span>Storyboard preview only. Connect the video provider to render an actual clip.</span></div>}</section>
      <section className="production-output-section production-wide-section"><div className="production-output-head"><div><span className="eyebrow">07 · QUALITY CONTROL</span><h3>{production.qc.length ? "Review checks" : "Checks run before review"}</h3></div>{production.qc.some((check) => check.status === "fail") ? <Badge tone="red">Needs production</Badge> : production.qc.length ? <Badge tone="green">QC complete</Badge> : <Badge tone="neutral">Pending</Badge>}</div>{production.qc.length ? <div className="qc-list">{production.qc.map((check) => <div className={`qc-row qc-${check.status}`} key={check.label}><span className="qc-icon">{check.status === "pass" ? <Check size={13} /> : <CircleAlert size={13} />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}</div> : <p className="production-output-copy">Story coherence, hook, pacing, visual relevance, source availability and rendered media are checked before review.</p>}</section>
    </div>
  </div>;

  const productionPage = <div className="page-content">
    <PanelHeading eyebrow="PRODUCTION CONTROL · PERSISTENT JOBS" title="Every stage, in view." description="Jobs save as they run. A failed provider request stops the workflow before another request is sent." action={<AppButton icon={Plus} onClick={() => goTo("create")}>New production</AppButton>} />
    {data.productions.length === 0 ? <EmptyState icon={Clapperboard} title="No production jobs yet" body="Start a brief to create a persistent job and follow its progress through research, story, script, scene design, preview and quality control." action={<AppButton icon={WandSparkles} onClick={() => goTo("create")}>Create today's video</AppButton>} /> : <div className="production-workspace">
      <aside className="production-job-list"><div className="eyebrow">ALL JOBS · {data.productions.length}</div>{data.productions.map((production) => <button className={`production-job-item ${production.id === selectedProduction?.id ? "is-selected" : ""}`} key={production.id} onClick={() => commit((previous) => ({ ...previous, selectedProductionId: production.id }))}><span className="job-status-mark">{production.status === "FAILED" ? <CircleAlert size={15} /> : production.status === "REVIEW" ? <CheckCircle2 size={15} /> : production.status === "APPROVED" ? <Check size={15} /> : <Film size={15} />}</span><span><strong>{production.title}</strong><small>{titleCaseStatus(production.stage)} · {formatDate(production.updatedAt, true)}</small></span><ChevronRight size={14} /></button>)}</aside>
      <div className="production-main-pane">{selectedProduction ? productionDetail(selectedProduction) : <EmptyState icon={Film} title="Select a production" body="Choose a job on the left to inspect its saved work." />}</div>
    </div>}
  </div>;

  const reviewPage = <div className="page-content">
    <PanelHeading eyebrow="CREATIVE DIRECTOR'S DESK · HUMAN APPROVAL" title="The final decision is yours." description="Review the story, script, scene plan, source links and quality notes before approval." action={pendingReviews.length ? <Badge tone="amber">{pendingReviews.length} awaiting review</Badge> : undefined} />
    {pendingReviews.length === 0 ? <EmptyState icon={CheckCircle2} title="Nothing is waiting for review" body={selectedReview?.status === "APPROVED" ? `“${selectedReview.title}” was approved and is saved in your library. Approval does not publish a file.` : "A completed production package will appear here for your approval, requested changes or rejection."} action={<AppButton icon={WandSparkles} onClick={() => goTo("create")}>Create a production</AppButton>} /> : <div className="review-workspace">
      <aside className="review-queue"><div className="eyebrow">REVIEW QUEUE · {pendingReviews.length}</div>{pendingReviews.map((production) => <button className={`review-queue-item ${production.id === (selectedReview?.id ?? pendingReviews[0]?.id) ? "is-selected" : ""}`} key={production.id} onClick={() => setSelectedReviewId(production.id)}><span className="review-thumb" style={{ backgroundImage: "url('/assets/images/featured-frame.jpg')" }} /><span><strong>{production.title}</strong><small>{production.platform} · {formatDate(production.createdAt)}</small>{statusBadge(production.status)}</span></button>)}</aside>
      {selectedReview ? <div className="review-main-pane">
        <div className="review-title-row"><div><div className="eyebrow">{selectedReview.platform.toUpperCase()} · {selectedReview.format.toUpperCase()}</div><h2>{selectedReview.title}</h2><p>{selectedReview.topic}</p></div>{statusBadge(selectedReview.status)}</div>
        <div className="review-player">
          <img src="/assets/images/featured-frame.jpg" alt="Illustrative storyboard mood-board frame" className={previewPlaying ? "is-preview-playing" : ""} />
          <div className="review-player-vignette" />
          <button className={`preview-play-button ${previewPlaying ? "is-playing" : ""}`} onClick={() => setPreviewPlaying((previous) => !previous)} aria-label={previewPlaying ? "Pause simulated storyboard preview" : "Play simulated storyboard preview"}><Play size={20} fill="currentColor" /></button>
          <span className="preview-mode-label">SIMULATED STORYBOARD PREVIEW · NO VIDEO FILE</span>
          <div className="preview-caption">{selectedReview.idea?.hook ?? selectedReview.topic}</div>
          <div className="preview-player-controls"><span>{previewPlaying ? "Storyboard playing" : "Storyboard still"}</span><span>{selectedReview.duration} · {selectedReview.format}</span></div>
        </div>
        <div className="review-integrity-note"><CircleAlert size={16} /><span>{selectedReview.media?.videoDataUrl || selectedReview.media?.audioDataUrl || selectedReview.media?.imageDataUrls?.length ? "Provider-generated media is attached to this production. Verify factual claims and review the media before publishing." : "This production is storyboard-only. No provider-generated media is attached yet."}</span></div>
        <div className="review-tabs-content">
          <details open><summary><FileText size={15} /> Story & script <ChevronDown size={14} /></summary><div className="review-text-block"><h3>Story engine</h3><pre>{selectedReview.story || "No story saved."}</pre><h3>Production script</h3><pre>{selectedReview.script || "No script saved."}</pre></div></details>
          <details><summary><ListChecks size={15} /> Scene plan <span>{selectedReview.scenes.length} scenes</span><ChevronDown size={14} /></summary><div className="review-text-block">{selectedReview.scenes.map((scene) => <div className="compact-scene" key={scene.number}><strong>Scene {String(scene.number).padStart(2, "0")} · {scene.duration}</strong><p>{scene.narration}</p><small>{scene.visual} · {scene.camera} · {scene.lighting}</small></div>)}</div></details>
          <details><summary><Globe2 size={15} /> Research sources <span>{selectedReview.sources.length} links</span><ChevronDown size={14} /></summary><div className="review-text-block">{selectedReview.sources.length ? selectedReview.sources.map((source) => <a className="review-source-link" key={source.url} href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /><span><strong>{source.title}</strong><small>{source.url}{source.publishedDate ? ` · ${source.publishedDate}` : ""}</small></span></a>) : <p className="no-source-note">Demo research has no live source links. Verify factual claims independently.</p>}</div></details>
          <details><summary><ShieldCheck size={15} /> Quality control <span>{selectedReview.qc.filter((check) => check.status === "warning").length} notes</span><ChevronDown size={14} /></summary><div className="review-text-block"><div className="qc-list">{selectedReview.qc.map((check) => <div className={`qc-row qc-${check.status}`} key={check.label}><span className="qc-icon">{check.status === "pass" ? <Check size={13} /> : <CircleAlert size={13} />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}</div></div></details>
        </div>
        {selectedReview.reviewNotes.length ? <div className="revision-notes"><div className="eyebrow">REQUESTED CHANGES</div>{selectedReview.reviewNotes.map((note, index) => <p key={`${index}-${note}`}>{note}</p>)}</div> : null}
        <div className="review-actions"><AppButton icon={Check} onClick={() => approveProduction(selectedReview)} disabled={selectedReview.status === "APPROVED"}>Approve package</AppButton><AppButton variant="secondary" icon={RefreshCw} onClick={() => retryProduction(selectedReview)}>Regenerate</AppButton><AppButton variant="ghost" icon={FileText} onClick={() => setReviewRequestOpen(true)}>Request changes</AppButton><button className="reject-link" onClick={() => rejectProduction(selectedReview)}>Reject</button></div>
        <p className="review-approval-note">Approval records a human decision on this production package. It does not create a publishable video or connect to a social account.</p>
      </div> : null}
    </div>}
  </div>;

  const libraryPage = <div className="page-content">
    <PanelHeading eyebrow="STUDIO ARCHIVE · LOCAL-FIRST" title="The work, as it really is." description="Every saved brief, story, script and approval stays in your library. Demo packages are labeled; no fake views or video exports are added." action={<label className="library-search"><Search size={15} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search library" /></label>} />
    {filteredLibrary.length ? <div className="library-list">{filteredLibrary.map((production) => <div className="library-list-item" key={production.id}>{productionRow(production, () => {
      commit((previous) => ({ ...previous, selectedProductionId: production.id }));
      goTo(production.status === "REVIEW" || production.status === "REVISIONS_REQUESTED" ? "review" : "production");
    })}<div className="library-list-meta"><span>{production.scenes.length} planned scenes</span><span>{production.sources.length} source links</span><span>{production.qc.filter((check) => check.status === "warning").length} QC notes</span></div></div>)}</div> : <EmptyState icon={FolderOpen} title={searchQuery ? "No matching productions" : "The archive is ready"} body={searchQuery ? "Try a shorter title, topic or platform." : "Completed and in-progress production packages will collect here. Start a brief to create your first saved job."} action={!searchQuery ? <AppButton icon={WandSparkles} onClick={() => goTo("create")}>Start a production</AppButton> : undefined} />}
    <div className="library-integrity"><HardDrive size={15} /><span>Saved locally in this browser{data.settings.firebaseUid ? " and syncing to your private Firebase workspace" : ""}. Provider API keys are never synchronized.</span></div>
  </div>;

  const publicationProduction = data.productions.find((production) => production.id === data.selectedProductionId) ?? data.productions.find((production) => production.status === "APPROVED") ?? data.productions[0] ?? null;
  const publicationTitle = publicationProduction?.idea?.title ?? publicationProduction?.title ?? "A story worth staying for";
  const publicationDescription = publicationProduction
    ? `${publicationProduction.idea?.concept ?? publicationProduction.topic}\n\nThis production package was prepared in Money Maker AI. Confirm all source claims before publishing.`
    : "Select a production package to prepare a platform-specific description.";
  const publicationCaption = `${publicationProduction?.idea?.hook ?? publicationProduction?.topic ?? "A question worth exploring."}\n\n#documentary #storytelling #curiosity`;
  const platformLabel = publishingPlatform === "YouTube" ? "YouTube title and description" : `${publishingPlatform} caption`;

  const publishingPage = <div className="page-content">
    <PanelHeading eyebrow="PUBLISHING DESK · HUMAN CONTROL" title="Package first. Publish by choice." description="Prepare platform-specific copy now. Official OAuth integrations are not enabled in Version 1; no passwords are requested or stored." action={<Badge tone="amber">NOT CONNECTED</Badge>} />
    <div className="publishing-layout">
      <div className="publishing-main">
        <div className="publishing-config-row"><label className="field-label">Production<select className="field-control" value={publicationProduction?.id ?? ""} onChange={(event) => commit((previous) => ({ ...previous, selectedProductionId: event.target.value || null }))}><option value="">Choose a production</option>{data.productions.map((production) => <option key={production.id} value={production.id}>{production.title}</option>)}</select></label><div className="field-label">Platform packaging<div className="platform-switcher">{PLATFORMS.map((platform) => <button type="button" key={platform} className={publishingPlatform === platform ? "is-active" : ""} onClick={() => setPublishingPlatform(platform)}>{platform}</button>)}</div></div></div>
        {publicationProduction ? <div className="publish-draft-summary"><div className="eyebrow">PACKAGE PREVIEW · {publishingPlatform.toUpperCase()}</div><h2>{publicationTitle}</h2><p>{publicationProduction.idea?.hook ?? publicationProduction.topic}</p><div><Badge tone={publicationProduction.status === "APPROVED" ? "green" : "amber"}>{publicationProduction.status === "APPROVED" ? "Approved package" : "Not yet approved"}</Badge><Badge tone="neutral">{publicationProduction.format}</Badge><Badge tone="neutral">{publicationProduction.duration}</Badge></div></div> : <EmptyState icon={Send} title="No production selected" body="Choose or create a production package to prepare platform copy." action={<AppButton onClick={() => goTo("create")} icon={Plus}>Create a production</AppButton>} />}
        <div className="publish-field"><div className="publish-field-head"><label>{platformLabel}</label><button className="text-button" onClick={() => void copyToClipboard(publishingPlatform === "YouTube" ? `${publicationTitle}\n\n${publicationDescription}` : publicationCaption, platformLabel)}><Copy size={13} />{copiedText === platformLabel ? "Copied" : "Copy"}</button></div><div className="copy-field"><strong>{publicationTitle}</strong><p>{publishingPlatform === "YouTube" ? publicationDescription : publicationCaption}</p></div></div>
        <div className="publish-field"><div className="publish-field-head"><label>Thumbnail direction</label><Badge tone="neutral">Concept only</Badge></div><div className="thumbnail-concept"><img src="/assets/images/featured-frame.jpg" alt="Illustrative thumbnail mood-board artwork" /><div><strong>Concept: one question, one revealing detail</strong><p>Use a story-specific subject, readable contrast and a single visual clue. This artwork is an illustrative mood board, not a generated thumbnail.</p></div></div></div>
        <div className="publish-hashtags"><span className="eyebrow">SUGGESTED TAGS</span><p>{publicationCaption.split("\n\n")[1]}</p></div>
      </div>
      <aside className="publishing-side">
        <div className="publish-control"><span className="eyebrow">PUBLISHING CONTROLS</span><div className="platform-connection-row"><span className="platform-letter">YT</span><span><strong>YouTube</strong><small>Official OAuth · not connected</small></span><Badge>Not connected</Badge></div><div className="platform-connection-row"><span className="platform-letter">TT</span><span><strong>TikTok</strong><small>Official OAuth · not connected</small></span><Badge>Not connected</Badge></div><div className="platform-connection-row"><span className="platform-letter">IG</span><span><strong>Instagram</strong><small>Official OAuth · not connected</small></span><Badge>Not connected</Badge></div><div className="platform-connection-row"><span className="platform-letter">f</span><span><strong>Facebook</strong><small>Official OAuth · not connected</small></span><Badge>Not connected</Badge></div><AppButton variant="secondary" icon={ExternalLink} onClick={() => goTo("providers")}>Provider setup guide</AppButton></div>
        <div className="publish-integrity"><LockKeyhole size={16} /><p>Money Maker AI never asks for or stores social-media passwords. Publishing requires a future official OAuth adapter and explicit approval.</p></div>
        <AppButton variant="dark" icon={Send} disabled title="Provider not configured. Configure official publishing OAuth to enable this feature.">Publish to {publishingPlatform}</AppButton>
      </aside>
    </div>
  </div>;

  const approvedCount = data.productions.filter((production) => production.status === "APPROVED" || production.status === "PUBLISHED").length;
  const analyticsPage = <div className="page-content">
    <PanelHeading eyebrow="ANALYTICS · REAL SIGNALS ONLY" title="Learn from what actually ships." description="Views, watch time, retention and audience response appear after an official platform connection returns real metrics." action={<Badge tone="neutral">{approvedCount} approved package{approvedCount === 1 ? "" : "s"}</Badge>} />
    <div className="analytics-empty-chart"><div className="analytics-chart-top"><div><span className="eyebrow">AUDIENCE PERFORMANCE</span><h2>No platform data connected</h2></div><span className="chart-period">LAST 30 DAYS <ChevronDown size={13} /></span></div><div className="chart-empty-plane"><div className="chart-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="chart-grid-lines"><i /><i /><i /><i /><i /><div className="chart-empty-message"><BarChart3 size={20} /><strong>Waiting for an authorized platform</strong><p>Demo packages never create fictional views, retention curves or follower growth.</p></div></div></div><div className="chart-labels"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div></div>
    <div className="analytics-bottom-grid"><div className="analytics-learning"><span className="eyebrow">LEARNING LOOP</span><h3>Performance can inform the next brief.</h3><p>When a platform is connected, the studio can associate real watch time, retention, shares and feedback with the source idea, story structure and viewer notes.</p><div className="learning-sequence"><span>Idea</span><ArrowRight size={13} /><span>Story</span><ArrowRight size={13} /><span>Audience signal</span><ArrowRight size={13} /><span>Next brief</span></div></div><div className="analytics-events"><span className="eyebrow">LOCAL STUDIO ACTIVITY</span><h3>{data.productions.length} saved production{data.productions.length === 1 ? "" : "s"}</h3><p>{approvedCount} approved · {pendingReviews.length} awaiting review</p><AppButton variant="ghost" icon={ArrowRight} onClick={() => goTo("library")}>Open production library</AppButton></div></div>
  </div>;

  const providersPage = <div className="page-content">
    <PanelHeading eyebrow="CONTROL ROOM · COST-AWARE CONFIGURATION" title="Connect only what you need." description="Keys live in this browser only. A provider becomes connected only after its real API test succeeds; unsupported production stages stay in demo mode." action={<Badge tone={mode === "DEMO MODE" ? "amber" : "green"} icon={mode === "DEMO MODE" ? Sparkles : Radio}>{mode}</Badge>} />
    <div className="provider-security-note"><LockKeyhole size={16} /><span><strong>Browser-only key storage.</strong> This standalone V1 sends keys directly to supported provider APIs and stores them in local browser storage. Do not use shared devices or production secrets; use a secured server proxy for multi-user or public deployments.</span></div>
    <div className="provider-filter-bar"><span>{data.providers.length} provider slots</span><div className="provider-filter-select"><label htmlFor="provider-filter">Show</label><select id="provider-filter" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option>All providers</option>{providerGroups.map((group) => <option key={group}>{group}</option>)}</select></div></div>
    <div className="provider-list">{providersToShow.map((provider) => {
      const used = activeDay.providers[provider.id] ?? 0;
      const percent = clampPercent(used, provider.dailyLimit);
      return <article className="provider-row-card" key={provider.id}>
        <div className="provider-row-main"><span className={`provider-icon provider-icon-${provider.id}`}>{provider.id === "llm" ? <Sparkles size={18} /> : provider.id === "research" ? <Globe2 size={18} /> : provider.id === "image" ? <ImageIcon size={18} /> : provider.id === "video" ? <Video size={18} /> : provider.id === "voice" ? <Mic2 size={18} /> : provider.id === "music" ? <AudioLines size={18} /> : <Send size={18} />}</span><div><span className="eyebrow">{provider.group.toUpperCase()}</span><h3>{provider.name}</h3><p>{provider.description}</p></div></div>
        <div className="provider-row-status">{providerStatus(provider)}<a href={provider.website} target="_blank" rel="noreferrer">Provider guide <ExternalLink size={12} /></a></div>
        <div className="provider-row-usage"><div><span>Today</span><strong>{used} / {provider.dailyLimit} <small>{provider.unit}</small></strong></div><div className="meter-track"><span style={{ width: `${percent}%` }} /></div><small>{getRemaining(provider.dailyLimit, used)} remaining · resets at {prettyReset(data.settings.timeZone)}</small></div>
        <div className="provider-row-actions"><AppButton variant="secondary" onClick={() => openProviderEditor(provider.id)} icon={Settings2}>Configure</AppButton>{provider.adapter ? <AppButton variant="ghost" onClick={() => void testProvider(provider.id)} disabled={testingProvider === provider.id} icon={testingProvider === provider.id ? LoaderCircle : Radio}>{testingProvider === provider.id ? "Testing…" : "Test connection"}</AppButton> : <span className="adapter-note">Dedicated adapter required</span>}</div>
        {provider.error ? <div className="provider-error-note"><CircleAlert size={14} />{provider.error}</div> : null}
        {!provider.adapter ? <div className="provider-adapter-notice">Provider not configured for live generation. This stage remains clearly labeled demo; no API request or paid usage is made.</div> : null}
      </article>;
    })}</div>
    <div className="provider-bottom-note"><ShieldCheck size={16} /><span>Daily limits block outgoing API requests before they are sent. Potentially billable requests require explicit confirmation.</span><AppButton variant="ghost" icon={ArrowRight} onClick={() => goTo("settings")}>Usage settings</AppButton></div>
  </div>;

  useEffect(() => {
    if (data.settings.firebaseConfig) setFirebaseForm(data.settings.firebaseConfig);
  }, [data.settings.firebaseConfig]);

  const settingsPage = <div className="page-content">
    <PanelHeading eyebrow="STUDIO SETTINGS · YOU ARE IN CONTROL" title="Set the boundaries first." description="Choose your daily quota, reset timezone, cloud sync and installation preferences. Settings save on this device." />
    <div className="settings-layout">
      <div className="settings-main-column">
        <section className="settings-section">
          <div className="settings-section-heading"><span className="settings-icon"><Target size={18} /></span><div><h3>Daily credit guardrail</h3><p>One shared ceiling across the production workflow. Requests stop before the configured limit.</p></div></div>
          <div className="daily-limit-control"><label className="field-label" htmlFor="daily-limit">Overall daily AI credits</label><div className="limit-input-row"><input id="daily-limit" type="number" min="0" max="10000" step="1" className="field-control" value={data.settings.dailyLimit} onChange={(event) => saveSettings({ dailyLimit: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /><span>credits / day</span></div><div className="limit-usage-preview"><div className="meter-track"><span style={{ width: `${clampPercent(usedCredits, data.settings.dailyLimit)}%` }} /></div><span>{usedCredits} used · {remainingCredits} remaining</span></div></div>
          <div className="settings-section-divider" />
          <div className="provider-limit-editor"><div className="eyebrow">PER-PROVIDER DAILY LIMITS</div>{data.providers.map((provider) => <label className="provider-limit-row" key={provider.id}><span><strong>{provider.name}</strong><small>{activeDay.providers[provider.id] ?? 0} of {provider.dailyLimit} {provider.unit} used</small></span><input type="number" min="0" max="10000" value={provider.dailyLimit} onChange={(event) => {
            const limit = Math.max(0, Math.floor(Number(event.target.value) || 0));
            commit((previous) => ({ ...previous, providers: previous.providers.map((item) => item.id === provider.id ? { ...item, dailyLimit: limit } : item) }));
          }} /></label>)}</div>
        </section>
        <section className="settings-section">
          <div className="settings-section-heading"><span className="settings-icon"><Clock3 size={18} /></span><div><h3>Reset schedule</h3><p>Usage rolls over at midnight in this timezone. Your current day is calculated from this choice.</p></div></div>
          <label className="field-label" htmlFor="timezone">Daily reset timezone<select id="timezone" className="field-control settings-select" value={data.settings.timeZone} onChange={(event) => saveSettings({ timeZone: event.target.value })}>{TIME_ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
          <div className="reset-info"><Clock3 size={15} /><span>Next reset boundary: <strong>00:00 · {data.settings.timeZone}</strong></span></div>
        </section>
        <section className="settings-section firebase-settings-section">
          <div className="settings-section-heading"><span className="settings-icon"><Cloud size={18} /></span><div><h3>Firebase workspace sync</h3><p>Optional private backup for jobs, ideas and daily usage. The studio still works when Firebase is not configured.</p></div><div className="firebase-pill">{firebaseStatus === "connected" ? <Badge tone="green" icon={Check}>Connected</Badge> : firebaseStatus === "connecting" ? <Badge tone="amber" icon={LoaderCircle}>Connecting</Badge> : firebaseStatus === "error" ? <Badge tone="red">Needs attention</Badge> : <Badge>Not configured</Badge>}</div></div>
          {firebaseMessage ? <div className={`firebase-message firebase-message-${firebaseStatus}`}><span>{firebaseStatus === "connected" ? <CheckCircle2 size={15} /> : firebaseStatus === "error" ? <CircleAlert size={15} /> : <Cloud size={15} />}</span>{firebaseMessage}</div> : null}
          <form className="firebase-config-form" onSubmit={(event) => { event.preventDefault(); void connectConfiguredFirebase(firebaseForm); }}>
            <div className="firebase-field-grid"><label className="field-label">Web API key<input className="field-control" value={firebaseForm.apiKey} onChange={(event) => setFirebaseForm((previous) => ({ ...previous, apiKey: event.target.value }))} placeholder="AIza…" autoComplete="off" /></label><label className="field-label">Auth domain<input className="field-control" value={firebaseForm.authDomain} onChange={(event) => setFirebaseForm((previous) => ({ ...previous, authDomain: event.target.value }))} placeholder="project.firebaseapp.com" /></label><label className="field-label">Project ID<input className="field-control" value={firebaseForm.projectId} onChange={(event) => setFirebaseForm((previous) => ({ ...previous, projectId: event.target.value }))} placeholder="your-project-id" /></label><label className="field-label">App ID<input className="field-control" value={firebaseForm.appId} onChange={(event) => setFirebaseForm((previous) => ({ ...previous, appId: event.target.value }))} placeholder="1:123:web:abc…" /></label><label className="field-label">Storage bucket <span>Optional</span><input className="field-control" value={firebaseForm.storageBucket} onChange={(event) => setFirebaseForm((previous) => ({ ...previous, storageBucket: event.target.value }))} placeholder="project.appspot.com" /></label><label className="field-label">Messaging sender ID <span>Optional</span><input className="field-control" value={firebaseForm.messagingSenderId} onChange={(event) => setFirebaseForm((previous) => ({ ...previous, messagingSenderId: event.target.value }))} placeholder="1234567890" /></label></div>
            <div className="firebase-form-footer"><p>Enable <strong>Anonymous</strong> sign-in in Firebase Authentication and deploy the included Firestore rules first.</p><AppButton type="submit" icon={firebaseStatus === "connecting" ? LoaderCircle : Cloud} disabled={firebaseStatus === "connecting"}>{firebaseStatus === "connected" ? "Reconnect Firebase" : "Connect & sync"}</AppButton></div>
          </form>
          {firebaseStatus === "connected" ? <button className="text-button disconnect-firebase" onClick={() => { firebaseReady.current = false; saveSettings({ firebaseConfig: null, firebaseUid: null }); setFirebaseStatus("off"); setFirebaseMessage(""); }}>Disconnect cloud sync</button> : null}
        </section>
        <section className="settings-section install-settings-section">
          <div className="settings-section-heading"><span className="settings-icon"><Smartphone size={18} /></span><div><h3>Install Money Maker AI</h3><p>Use the browser's install prompt when available, or follow the device-specific steps in Help.</p></div></div>
          <div className="install-settings-row"><div><strong>{isInstalled ? "Installed on this device" : "Ready to add to your home screen"}</strong><small>Standalone display · app shell cache · responsive production workspace</small></div><AppButton variant="secondary" icon={Smartphone} onClick={() => void installApp()}>{isInstalled ? "App installed" : "Install app"}</AppButton></div>
        </section>
      </div>
      <aside className="settings-side-column">
        {usageOverview(true)}
        <div className="settings-privacy-note"><LockKeyhole size={17} /><div><strong>Provider keys stay server-side</strong><p>Production provider secrets are stored in Firebase Functions secret storage and are never returned to the browser or Firestore. The app persists only non-secret provider configuration and connection state.</p></div></div>
        <div className="firebase-path-note"><CloudOff size={16} /><span>Without Firebase, all production data remains available in local browser storage.</span></div>
      </aside>
    </div>
  </div>;

  const helpSections = [
    { id: "install", title: "Install Money Maker AI", icon: Smartphone, content: <div className="help-content-copy"><p><strong>Desktop:</strong> In a supported browser, use the install icon in the address bar or browser menu and choose Install Money Maker AI.</p><p><strong>Android:</strong> Open the deployed site in Chrome, use the browser menu, then choose Install app or Add to Home screen.</p><p><strong>iPhone:</strong> Open the site in Safari, tap Share, then Add to Home Screen. iOS does not show the Chromium install prompt.</p><AppButton variant="secondary" icon={Smartphone} onClick={() => void installApp()}>{isInstalled ? "Installed on this device" : "Install app"}</AppButton></div> },
    { id: "workflow", title: "Run the demo production workflow", icon: Clapperboard, content: <div className="help-content-copy"><p>Choose <strong>Create today's video</strong>, enter a focused topic, then start the production. With no API keys, each stage uses explicitly labeled demo output and makes no provider request.</p><p>The job saves research mode, idea, story, script, scene plan, visual direction, voice direction, storyboard preview, QC notes and your review decision in this browser.</p><p>Demo source lists stay empty. Demo imagery is illustrative. There is no exported video or synthesized audio until an adapter is connected.</p><AppButton variant="secondary" icon={WandSparkles} onClick={() => goTo("create")}>Open Create</AppButton></div> },
    { id: "providers", title: "Configure an AI provider", icon: KeyRound, content: <div className="help-content-copy"><ol><li>Open the provider website from its card in AI Providers.</li><li>Create an account and generate an API key in the provider's dashboard.</li><li>Store the key as the matching Firebase Functions secret; never paste production keys into the browser.</li><li>Choose a model, enable the provider and set a conservative daily limit.</li><li>Test the actual server connection. A provider is labeled connected only after a successful provider response.</li><li>Read the provider's current pricing and free-credit terms; they can change.</li></ol><p>The upgraded build uses a server-side provider gateway for Gemini, Tavily, Hugging Face image/video, and ElevenLabs voice/sound. Social publishing remains intentionally OAuth-gated rather than pretending an API key is enough.</p><AppButton variant="secondary" icon={Radio} onClick={() => goTo("providers")}>Open AI Providers</AppButton></div> },
    { id: "credits", title: "Daily credits, limits and paid usage", icon: Target, content: <div className="help-content-copy"><p>The studio tracks one overall daily credit limit and separate provider quotas. A complete demo pipeline uses 11 local credits: research 2, idea/story/script/scenes/QC 1 each, visual plan 1, voice plan 1 and preview 2.</p><p>Live API requests reserve their usage before the network call. At a limit the request is blocked, the provider, usage and reset time are shown, and no next stage is sent. Provider billing/free quotas are not inferred; live use is always treated as potentially billable.</p><p>Reset time follows the selected timezone and starts at 00:00. Changing a limit takes effect immediately.</p><AppButton variant="secondary" icon={Activity} onClick={() => goTo("settings")}>Open usage settings</AppButton></div> },
    { id: "firebase", title: "Connect Firebase", icon: Cloud, content: <div className="help-content-copy"><ol><li>Create a Firebase project and register a Web app.</li><li>Enable Authentication → Sign-in method → Anonymous.</li><li>Create a Cloud Firestore database.</li><li>From the project folder, deploy the included Firestore rules and indexes.</li><li>Paste the Web app configuration into Settings and choose Connect & sync.</li></ol><p>Anonymous Authentication gives this browser a Firebase UID. Firestore data is scoped to that UID by the included rules. API provider secrets are excluded from sync.</p><AppButton variant="secondary" icon={Cloud} onClick={() => goTo("settings")}>Open Firebase settings</AppButton></div> },
    { id: "deploy", title: "GitHub and Firebase Hosting", icon: ExternalLink, content: <div className="help-content-copy"><p>The beginner walkthrough and commands are in <strong>README.md</strong>. Build the static app, commit the source to your own private or public GitHub repository, then deploy the generated <code>dist</code> folder with the Firebase CLI.</p><p>Never commit provider API keys, Firebase service-account JSON files or social passwords. The included Firebase web config is entered in the app and stored in local browser storage.</p><a className="help-external-link" href="https://firebase.google.com/docs/hosting" target="_blank" rel="noreferrer">Firebase Hosting guide <ExternalLink size={13} /></a></div> },
    { id: "troubleshoot", title: "Troubleshooting", icon: CircleHelp, content: <div className="help-content-copy"><p><strong>Provider test fails:</strong> check the key, provider account, allowed model, network access, browser CORS support and account quota. The app never logs key values.</p><p><strong>Firebase fails:</strong> verify project ID and app ID, enable anonymous sign-in, deploy Firestore rules, and check the Firebase console for the authentication or billing error.</p><p><strong>Install is unavailable:</strong> use HTTPS or localhost, verify the manifest and service worker load, then follow the browser-specific Add to Home Screen steps.</p><p><strong>Storage is full:</strong> export or remove old browser site data only after backing up; Firebase sync is optional.</p></div> },
  ];

  const helpPage = <div className="page-content">
    <PanelHeading eyebrow="HELP CENTER · BEGINNER FRIENDLY" title="Your studio is ready to configure." description="Start with Demo Mode. Connect providers only when you are ready to review their current pricing, security and usage terms." action={<Badge tone="amber" icon={Sparkles}>DEMO MODE WORKS OFFLINE</Badge>} />
    <div className="help-welcome"><div className="help-welcome-art"><BrandMark /><span>MONEY<br />MAKER AI</span></div><div><span className="eyebrow">DOWNLOAD → RUN → CONFIGURE → DEPLOY → INSTALL → USE</span><h2>Build the first story before you add more tools.</h2><p>Money Maker AI saves your workflow locally, keeps sources distinct from demo examples and puts a human between production and publishing.</p></div></div>
    <div className="help-accordion">{helpSections.map((section) => {
      const SectionIcon = section.icon;
      const open = helpExpanded === section.id;
      return <section className={`help-accordion-item ${open ? "is-open" : ""}`} key={section.id}><button onClick={() => setHelpExpanded(open ? null : section.id)} aria-expanded={open}><span className="help-section-icon"><SectionIcon size={17} /></span><strong>{section.title}</strong><ChevronDown size={16} className={open ? "rotate-icon" : ""} /></button>{open ? <div className="help-accordion-body">{section.content}</div> : null}</section>;
    })}</div>
    <section className="credit-self-test"><div><span className="eyebrow">LOCAL DIAGNOSTIC · NO NETWORK REQUESTS</span><h3>Check the daily credit guard</h3><p>Runs the 100 → 80 → 0 → blocked → reset acceptance sequence using the same consumption rule as live usage. It does not change today's balance.</p>{creditCheck ? <div className="self-test-results">{creditCheck.map((check) => <span key={check}><CheckCircle2 size={14} />{check}</span>)}</div> : null}</div><AppButton variant="secondary" icon={creditCheck ? CheckCircle2 : Activity} onClick={() => {
      try { setCreditCheck(runCreditSelfTest()); notify("Credit guard check passed. Today's usage was not changed.", "success"); }
      catch (error) { notify(cleanErrorMessage(error), "error"); }
    }}>{creditCheck ? "Run check again" : "Run credit check"}</AppButton></section>
  </div>;

  const viewContent: Record<ViewId, ReactNode> = {
    dashboard: dashboardPage,
    create: createPage,
    research: researchPage,
    ideas: ideasPage,
    production: productionPage,
    review: reviewPage,
    library: libraryPage,
    publishing: publishingPage,
    analytics: analyticsPage,
    providers: providersPage,
    settings: settingsPage,
    help: helpPage,
  };

  const renderNavGroup = (group: string, mobile = false) => <div className={`nav-group ${mobile ? "nav-group-mobile" : ""}`} key={`${mobile}-${group}`}>
    {!mobile ? <span className="nav-group-label">{group}</span> : null}
    {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
      const Icon = item.icon;
      return <button className={`nav-item ${view === item.id ? "is-active" : ""}`} key={item.id} onClick={() => goTo(item.id)}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === "review" && pendingReviews.length ? <span className="nav-count">{pendingReviews.length}</span> : null}</button>;
    })}
  </div>;

  const renderSidebarContents = (mobile = false) => <>
    <div className="sidebar-brand"><BrandMark /><span className="brand-wordmark"><strong>MONEY MAKER</strong><small>AI CONTENT STUDIO</small></span>{mobile ? <IconButton label="Close menu" onClick={() => setMobileMenuOpen(false)}><X size={19} /></IconButton> : null}</div>
    <div className="sidebar-workspace"><span className="workspace-avatar">M</span><span><strong>My studio</strong><small>Personal workspace</small></span><ChevronDown size={14} /></div>
    <nav className="sidebar-nav">{["Studio", "Workflow", "Publish", "Control room"].map((group) => renderNavGroup(group))}</nav>
    <div className="sidebar-footer">
      <div className="sidebar-credit-heading"><span>DAILY CREDITS</span><span>{remainingCredits} LEFT</span></div>
      <div className="sidebar-credit-track"><span style={{ width: `${clampPercent(usedCredits, data.settings.dailyLimit)}%` }} /></div>
      <button className="sidebar-credit-link" onClick={() => goTo("settings")}><span>{usedCredits} / {data.settings.dailyLimit} used</span><ArrowRight size={13} /></button>
      <div className="sidebar-mode"><span className={`mode-dot ${mode === "DEMO MODE" ? "mode-dot-demo" : ""}`} />{mode}<span className="sidebar-mode-small">· local-first</span></div>
    </div>
  </>;

  return <div className="app-shell">
    {mobileMenuOpen ? <div className="mobile-drawer-scrim" onClick={() => setMobileMenuOpen(false)}><aside className="sidebar mobile-drawer" onClick={(event) => event.stopPropagation()}>{renderSidebarContents(true)}</aside></div> : null}
    <aside className="sidebar desktop-sidebar">{renderSidebarContents()}</aside>
    <div className="workspace-shell">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu-trigger" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><span className="mobile-header-brand"><BrandMark small /><strong>MONEY MAKER AI</strong></span><div className="breadcrumb"><span>Studio</span><ChevronRight size={13} /><strong>{currentTitle}</strong></div></div>
        <div className="topbar-actions"><span className="topbar-date">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span><Badge tone={mode === "DEMO MODE" ? "amber" : "green"} icon={mode === "DEMO MODE" ? Sparkles : Radio}>{mode}</Badge><IconButton label="Help center" onClick={() => goTo("help")}><CircleHelp size={17} /></IconButton><AppButton variant="secondary" icon={Smartphone} className="install-top-button" onClick={() => void installApp()}>{isInstalled ? "Installed" : "Install app"}</AppButton></div>
      </header>
      <main className={`main-content main-view-${view}`} key={view}>{viewContent[view]}</main>
      <footer className="workspace-footer"><span>MADE FOR STORIES THAT MATTER</span><span>LOCAL-FIRST · HUMAN APPROVAL · NO SILENT SPEND</span></footer>
    </div>

    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {["dashboard", "create", "production", "review"].map((id) => {
        const item = NAV_ITEMS.find((entry) => entry.id === id)!;
        const Icon = item.icon;
        return <button className={view === item.id ? "is-active" : ""} key={id} onClick={() => goTo(item.id)}><Icon size={18} /><span>{id === "dashboard" ? "Home" : id === "production" ? "Jobs" : item.label}</span>{id === "review" && pendingReviews.length ? <i>{pendingReviews.length}</i> : null}</button>;
      })}
      <button className={mobileMoreOpen ? "is-active" : ""} onClick={() => setMobileMoreOpen((previous) => !previous)}><MoreHorizontal size={19} /><span>More</span></button>
    </nav>
    {mobileMoreOpen ? <><button className="mobile-more-backdrop" onClick={() => setMobileMoreOpen(false)} aria-label="Close additional navigation" /><div className="mobile-more-panel">{["Studio", "Workflow", "Publish", "Control room"].map((group) => renderNavGroup(group, true))}</div></> : null}

    {editingProvider ? (() => {
      const provider = data.providers.find((item) => item.id === editingProvider);
      if (!provider) return null;
      return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingProvider(null); }}><section className="modal-dialog provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title">
        <div className="modal-header"><div><div className="eyebrow">{provider.group.toUpperCase()}</div><h2 id="provider-modal-title">Configure {provider.name}</h2></div><IconButton label="Close provider settings" onClick={() => setEditingProvider(null)}><X size={18} /></IconButton></div>
        <p className="modal-description">{provider.description} Review the provider's own pricing and free-credit rules before connecting a key.</p>
        <form className="provider-edit-form" onSubmit={saveProvider}>
          <label className="field-label">Provider name<input className="field-control" value={providerForm.name} onChange={(event) => setProviderForm((previous) => ({ ...previous, name: event.target.value }))} required /></label>
          <label className="field-label">Model / endpoint<input className="field-control" value={providerForm.model} onChange={(event) => setProviderForm((previous) => ({ ...previous, model: event.target.value }))} /></label>
          <label className="field-label">Daily limit<div className="limit-input-row"><input className="field-control" type="number" min="0" max="10000" value={providerForm.dailyLimit} onChange={(event) => setProviderForm((previous) => ({ ...previous, dailyLimit: Number(event.target.value) }))} /><span>{provider.unit}</span></div></label>
          {provider.adapter ? <div className="adapter-server-note"><ShieldCheck size={16} /><span><strong>Server-managed secret</strong><small>This production build does not ask for provider secrets in the browser. Configure the provider key as a Firebase Functions secret, then use <strong>Test connection</strong> here. The browser only receives a success/failure result.</small></span></div> : <div className="adapter-unavailable"><CircleAlert size={16} /><span>This provider requires an official OAuth adapter before it can run.</span></div>}
          <label className="provider-enable-row"><input type="checkbox" checked={providerForm.enabled} onChange={(event) => setProviderForm((previous) => ({ ...previous, enabled: event.target.checked }))} /><span><strong>Enable provider</strong><small>Disabled providers will never receive app requests.</small></span></label>
          <div className="modal-key-warning"><LockKeyhole size={15} /><span>Provider secrets are never stored in this browser. Production keys belong in Firebase Functions secrets; only provider status is persisted locally.</span></div>
          <div className="provider-modal-footer"><a href={provider.website} target="_blank" rel="noreferrer">Open provider website <ExternalLink size={13} /></a><div><AppButton variant="ghost" onClick={() => setEditingProvider(null)}>Cancel</AppButton><AppButton type="submit" icon={Check}>Save provider</AppButton></div></div>
        </form>
      </section></div>;
    })() : null}

    {reviewRequestOpen && selectedReview ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewRequestOpen(false); }}><section className="modal-dialog request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title"><div className="modal-header"><div><div className="eyebrow">REVIEW NOTES</div><h2 id="request-modal-title">What should change?</h2></div><IconButton label="Close change request" onClick={() => setReviewRequestOpen(false)}><X size={18} /></IconButton></div><p className="modal-description">Your note will be saved with “{selectedReview.title}” and its status will return to revisions requested.</p><textarea className="field-control request-textarea" value={reviewRequestText} onChange={(event) => setReviewRequestText(event.target.value)} placeholder="Be specific: scene, pacing, wording, source or visual treatment…" autoFocus /><div className="request-modal-footer"><AppButton variant="ghost" onClick={() => setReviewRequestOpen(false)}>Cancel</AppButton><AppButton icon={Send} onClick={submitReviewRequest}>Save change request</AppButton></div></section></div> : null}

    <div className="toast-stack" aria-live="polite" aria-atomic="false">{toasts.map((toast) => <div className={`toast toast-${toast.tone}`} key={toast.id}><span>{toast.tone === "success" ? <CheckCircle2 size={17} /> : toast.tone === "error" || toast.tone === "warning" ? <CircleAlert size={17} /> : <Sparkles size={17} />}</span><p>{toast.message}</p><button aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={15} /></button></div>)}</div>
  </div>;
}