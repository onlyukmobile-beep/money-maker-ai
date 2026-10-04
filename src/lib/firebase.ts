import { deleteApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { CreditDay, FirebaseConfigInput, Production, ProviderConfig, SavedIdea, StudioData } from "./studio";

const APP_NAME = "money-maker-ai";
let activeApp: FirebaseApp | null = null;
let activeAuth: Auth | null = null;
let activeDb: Firestore | null = null;

export interface FirebaseSnapshot {
  productions: Production[];
  creditsByDay: StudioData["creditsByDay"];
  researchHistory: StudioData["researchHistory"];
  ideas: SavedIdea[];
  settings?: Pick<StudioData["settings"], "dailyLimit" | "timeZone">;
  providers?: Array<Omit<ProviderConfig, "apiKey">>;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, stripUndefined(child)]),
    );
  }
  return value;
}

function waitForAuth(auth: Auth): Promise<import("firebase/auth").User | null> {
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void = () => {};
    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      },
    );
  });
}

export async function connectFirebase(config: FirebaseConfigInput): Promise<string> {
  const existing = getApps().find((candidate) => candidate.name === APP_NAME);
  if (existing && existing.options.projectId !== config.projectId) {
    await deleteApp(existing);
    activeApp = null;
    activeAuth = null;
    activeDb = null;
  }

  activeApp = getApps().find((candidate) => candidate.name === APP_NAME) ?? initializeApp(config, APP_NAME);
  activeAuth = getAuth(activeApp);
  activeDb = getFirestore(activeApp);

  let user = await waitForAuth(activeAuth);
  if (!user) user = (await signInAnonymously(activeAuth)).user;
  return user.uid;
}

function requireDatabase(): Firestore {
  if (!activeDb) throw new Error("Connect Firebase before syncing studio data.");
  return activeDb;
}

export async function readFirebaseSnapshot(uid: string): Promise<FirebaseSnapshot> {
  const db = requireDatabase();
  const [productionSnapshot, creditSnapshot, researchSnapshot, ideaSnapshot, workspaceSnapshot] = await Promise.all([
    getDocs(collection(db, "users", uid, "productions")),
    getDocs(collection(db, "users", uid, "dailyCredits")),
    getDocs(collection(db, "users", uid, "research")),
    getDocs(collection(db, "users", uid, "ideas")),
    getDoc(doc(db, "users", uid, "settings", "main")),
  ]);
  const productions = productionSnapshot.docs.map((entry) => entry.data() as Production);
  const creditsByDay = Object.fromEntries(
    creditSnapshot.docs.map((entry) => [entry.id, entry.data() as CreditDay]),
  );
  const researchHistory = researchSnapshot.docs.map((entry) => entry.data() as StudioData["researchHistory"][number]);
  const ideas = ideaSnapshot.docs.map((entry) => entry.data() as StudioData["ideas"][number]);
  const workspace = workspaceSnapshot.data() as { settings?: FirebaseSnapshot["settings"]; providers?: FirebaseSnapshot["providers"] } | undefined;
  return { productions, creditsByDay, researchHistory, ideas, settings: workspace?.settings, providers: workspace?.providers };
}

export async function syncFirebaseSnapshot(uid: string, data: StudioData): Promise<void> {
  const db = requireDatabase();
  const safeProviders = data.providers.map((provider) => {
    const { apiKey, ...safeProvider } = provider;
    void apiKey;
    return stripUndefined(safeProvider) as Omit<ProviderConfig, "apiKey">;
  });

  const writes: Promise<unknown>[] = [
    setDoc(doc(db, "users", uid, "settings", "main"), {
      version: data.version,
      settings: { dailyLimit: data.settings.dailyLimit, timeZone: data.settings.timeZone },
      providers: safeProviders,
      syncedAt: new Date().toISOString(),
    }, { merge: true }),
    ...data.productions.map((production) =>
      setDoc(doc(db, "users", uid, "productions", production.id), stripUndefined(production) as Production, { merge: true }),
    ),
    ...Object.entries(data.creditsByDay).map(([key, credits]) =>
      setDoc(doc(db, "users", uid, "dailyCredits", key), credits, { merge: true }),
    ),
    ...data.researchHistory.map((entry) =>
      setDoc(doc(db, "users", uid, "research", entry.id), entry, { merge: true }),
    ),
    ...data.ideas.map((idea) =>
      setDoc(doc(db, "users", uid, "ideas", idea.id), idea, { merge: true }),
    ),
  ];
  await Promise.all(writes);
}