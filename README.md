# Money Maker AI

Money Maker AI is a local-first AI digital content production studio. It is built to take a brief through research, idea selection, story structure, script, scene direction, usage-controlled production, quality checks and human review.

The application is a real working Vite/React project, not a static mockup. It can be explored without API keys or Firebase. Demo output is always marked as demo; the application does not invent research links, create fake analytics, claim to have rendered a video, or publish to a social account.

## What Works In Version 1

- Dashboard, create brief, research desk, idea room, production jobs, review queue, library, publishing copy, analytics architecture, provider setup, settings and help.
- A saved end-to-end demo production pipeline. It creates a brief, research-mode record, idea, story, script, five scene plans, visual and voice direction, storyboard preview and QC notes.
- A daily credit guard: 100 shared credits by default, provider-specific usage, configurable limits, timezone-aware calendar-day reset and a preflight check before a full production starts.
- Local storage persistence and optional per-user Firestore synchronization using Firebase anonymous authentication.
- Tested-provider state and direct browser adapters for OpenAI chat completions and Tavily Search. Provider status only changes to Connected after an actual response succeeds.
- Manifest, app-shell service worker, install button, offline page and responsive mobile navigation.
- Platform copy preparation for YouTube, TikTok, Instagram and Facebook. The app does not request social passwords or publish in V1.

## Honest V1 Boundaries

- OpenAI and Tavily are direct browser integrations. A live account may be billed even if its provider calls a balance free credits. Review the provider's current pricing, quotas and terms before connecting a key.
- API keys for those direct integrations are stored in this browser's local storage. They are not written into source files or synchronized to Firestore, but browser storage is not a secure secret vault. This is for a private, personal V1 setup only. Do not enter paid keys on a shared device or deploy a public multi-user service with client-side keys. Use a server-side proxy and Secret Manager before that.
- The LLM and search adapters are real. Image generation, generated voice/audio, video rendering, social OAuth/publishing and platform analytics need provider-specific adapters and are not falsely marked connected. Their workflow sections show the honest demo/not-connected state.
- The review player is an animated illustrative storyboard still, not a video file. A storyboard package can be approved, but it is not a finished, publishable video.
- The default app does not include a Firebase project configuration. Firebase is optional; Demo Mode works without it.
- No provider permanently guarantees free credits. Daily quotas in this app are local safety ceilings, not the provider's bill, entitlement or quota system.

## Project Structure

```text
money-maker-ai/
├── assets/
│   ├── demo/                  # Demo-mode honesty and example notes
│   ├── icons/                 # Icon documentation; live icon is in public/
│   └── images/                # Image documentation; live art is in public/
├── public/
│   ├── assets/icons/          # Installable SVG icon
│   ├── assets/images/         # Illustrative cinematic artwork
│   ├── manifest.json          # PWA manifest
│   ├── offline.html           # Offline fallback page
│   └── sw.js                  # Service worker
├── src/
│   ├── lib/firebase.ts        # Optional Firebase Auth + Firestore adapter
│   ├── lib/studio.ts          # Studio data model, defaults and credit rules
│   ├── App.tsx                # Application UI and workflow controller
│   ├── index.css              # Tailwind entry + global styles import
│   └── main.tsx               # React entry point
├── app.js                     # Service worker registration, bundled by Vite
├── firebase.json             # Hosting + Firestore deployment config
├── firestore.indexes.json
├── firestore.rules
├── index.html
├── manifest.json              # Root copy of the served public manifest
├── README.md
├── START-MONEY-MAKER-AI.bat
├── styles.css                 # Complete responsive UI system
├── sw.js                      # Root copy of the served public service worker
├── package.json
└── vite.config.ts
```

## Run Locally

### Windows double-click

1. Install Node.js LTS from [nodejs.org](https://nodejs.org/) if it is not already installed. npm is included with Node.js.
2. Extract the complete project folder somewhere writable.
3. Double-click `START-MONEY-MAKER-AI.bat`.
4. On the first run, the script installs dependencies. It opens `http://localhost:5173` and keeps the terminal window running.
5. Keep that window open while using the local studio. Press Ctrl+C to stop it.

If Windows says Node/npm is missing, install Node.js LTS, close existing terminals, and double-click the batch file again.

### Terminal (Windows, macOS or Linux)

From the project folder:

```bash
npm install
npm run dev
```

Open the Local URL shown by Vite, normally `http://localhost:5173`.

Create a production build with:

```bash
npm run build
```

Vite writes the Firebase Hosting build to `dist/`. The Vite single-file plugin places the application bundle in the HTML shell; the PWA manifest, artwork, icon, offline page and service worker are copied from `public/`.

## First Use And Demo Mode

1. Open the Dashboard and choose **Create today's video**.
2. Keep or edit the example topic, platform, format and duration.
3. Start the production. With no connected providers, every stage uses the local demo workflow; no provider API call is made.
4. Watch the job advance through research, idea, story, script, scenes, visual direction, voice direction, storyboard preview and QC.
5. Review the source list, script, scene plan and QC notes. Demo research has no real sources.
6. Approve, request changes, regenerate as a new job, or reject the package.
7. Find saved jobs in Production and Library. Approval records a human decision only; it does not create a video or publish it.

Refresh-safe job data and settings use browser local storage. When a tab reload interrupts an active run, completed work stays saved and the in-flight job is clearly paused for retry.

## Configure AI Providers

Go to **AI Providers** and configure a supported provider. The same setup flow is available from the Help Center.

### OpenAI text generation

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Configure the Language / reasoning provider, paste the key, select a model available to your account, enable it and choose a conservative request limit.
3. Save the provider and choose Test connection. The test calls the models endpoint, consumes one local usage unit and checks the actual API response.
4. A successful connection enables real OpenAI text generation in the idea, story, script, scene and QC stages.

### Tavily web research

1. Create an account at [app.tavily.com](https://app.tavily.com/home) and create an API key.
2. Configure the Research / search provider, paste the key, set a daily search limit and enable it.
3. Save the provider. Test connection performs a real basic search and may consume provider quota.
4. A successful connection enables live search results with original source URLs. Review original pages and verify factual claims yourself.

Provider free credits, free trials and pricing can change. Money Maker AI cannot inspect your contract or know whether a call is free. Before a live production, it shows a **POSSIBLE PAID USAGE** confirmation. The configured local limits block excess requests, but they do not replace provider-side spending limits.

Image, video, voice, music and publishing provider forms explain their role, but no live adapter is enabled for those stages in V1. They remain clearly marked demo/not connected until a real integration is added. Social accounts use official OAuth in a future version; never paste social passwords into this application.

## Daily Credits And Quotas

- Default shared daily allowance: **100 credits**.
- A full demo production pipeline uses **11 credits**: research 2, idea/story/script/scenes/QC 1 each, visual plan 1, voice plan 1 and storyboard preview 2.
- Each provider has a separate configurable quota and usage counter (for example, 50 LLM requests, 20 searches, 5 video generations or 20 voice minutes).
- The shared ceiling and each provider ceiling are checked before the next operation. The full production also checks that its configured demo/provider quotas can complete before it creates a job.
- When the overall or provider quota is exhausted, the next operation is blocked with provider, used amount, limit and midnight reset timezone. No next API call is sent.
- Default reset timezone: `Asia/Karachi`. Choose another timezone in Settings. Usage rolls over at midnight in the selected timezone.
- The Help Center's **Run credit check** verifies `100 → 80 → 0 → blocked → 100` without altering your real daily usage or making a network request.
- Increasing a local limit only changes the app guard. It does not increase a provider's free quota or billing cap.

## Firebase Setup

Firebase is optional. The first run works without a Firebase config. To enable private Firestore sync:

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Add a Web app and copy its Firebase web configuration.
3. In **Authentication → Sign-in method**, enable **Anonymous** sign-in.
4. Create a Cloud Firestore database.
5. Install the Firebase CLI if needed: `npm install -g firebase-tools`.
6. From this project folder, sign in and select your Firebase project:

```bash
firebase login
firebase use --add
```

7. The included `firebase.json`, `firestore.rules` and `firestore.indexes.json` already describe Hosting and Firestore. If you run `firebase init`, select the existing config files rather than replacing them. Alternatively, copy `.firebaserc.example` to `.firebaserc` and replace the example project ID.
8. Deploy the scoped Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

9. In Money Maker AI, open **Settings → Firebase workspace sync**, paste the Web app's `apiKey`, `authDomain`, `projectId` and `appId` (the remaining two fields are optional), then choose **Connect & sync**.
10. The app signs in anonymously, reads the UID-scoped workspace and syncs production jobs, research, ideas, daily credits and non-secret settings/provider metadata.

The Firebase Web API key is public client configuration, not a service-account secret. Do not paste a service-account JSON file into the app or commit it. Provider API keys are excluded from Firestore writes. The included rules scope documents to the current Firebase UID; use stronger account identity, server-side APIs, audit controls and abuse limits before a public multi-user deployment.

If the initial Firebase Auth request fails, enable Anonymous sign-in and confirm the Firebase project has Authentication and Firestore enabled. Pressing **Connect & sync** saves the entered Firebase web config locally so the connection can be retried; the app only reports Connected after authentication and Firestore reads succeed. The application remains usable if this step is skipped.

## GitHub

Create an empty repository on GitHub, then run these commands from the extracted project folder. Replace the URL with your repository URL:

```bash
git init
git add .
git commit -m "Build Money Maker AI studio"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git push -u origin main
```

The `.gitignore` excludes `node_modules`, `dist`, `.firebaserc` and Firebase logs. Keep provider keys in the app's local settings, not in source code, `.env` files, screenshots, GitHub Actions logs or commits. For a public repository or public deployment, use a secured server-side API before adding paid provider keys.

## Firebase Hosting Deployment

Install the Firebase CLI if it is not already installed:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
npm install
npm run build
firebase deploy --only hosting
```

The supplied `firebase.json` deploys `dist/` and routes application paths to `index.html`. To deploy Hosting together with Firestore rules and indexes after Firebase Auth and Firestore are configured:

```bash
firebase deploy
```

Open the Hosting URL reported by the CLI. PWA installation requires a secure context (HTTPS in production; localhost is allowed for development).

## Install As A PWA

- **Desktop:** use the install icon in the supported browser's address bar or menu.
- **Android:** open the HTTPS URL in Chrome, open the browser menu and choose **Install app** or **Add to Home screen**.
- **iPhone:** open the URL in Safari, tap **Share**, then **Add to Home Screen**. iOS uses the Safari share-sheet flow instead of the Chromium install prompt.

If the browser does not offer installation, confirm that `manifest.json`, the SVG icon and `/sw.js` load over HTTPS, then use the browser's manual Add to Home Screen option. The service worker caches the application shell and local visual assets; external provider and Firebase requests still need a connection.

## Testing Checklist

1. `npm install` completes without a project error.
2. `npm run dev` opens the local Dashboard in Demo Mode.
3. Create a production with no API keys and follow it into the Review queue.
4. Approve the package and confirm it appears in the Library with **Approved** status.
5. Open Settings and confirm overall/provider usage increased and remains after a refresh.
6. Open Help and run the local credit self-test. It confirms 20 used → 80 remaining, 80 more → 0, next request blocked and reset → 100.
7. Open AI Providers. Without credentials both supported slots stay Demo. A real provider reports Connected only after a live test succeeds.
8. Check Settings for optional Firebase and use the install button on a supported HTTPS deployment.
9. Test the mobile layout in browser device emulation at 390 px and confirm navigation remains usable.
10. Run `npm run build` before Firebase deployment.

## Troubleshooting

- **`node` or `npm` missing:** install Node.js LTS, restart the terminal, and rerun the startup script.
- **Port 5173 is busy:** stop the other development server or use the URL printed by Vite if it selects another port.
- **OpenAI/Tavily test fails:** verify the key, account, selected model, current quota, network and provider's browser/CORS support. Provider limits are local application limits, not account billing guarantees.
- **Firebase shows `auth/operation-not-allowed`:** enable Anonymous authentication in the Firebase console.
- **Firestore permission denied:** deploy the included rules and confirm the browser is connected using its anonymous UID.
- **Production stops:** open the failed job for provider, stage and sanitized error details. Retry uses today's quota again.
- **App seems out of date offline:** reopen while online so the versioned service worker can refresh its shell cache.
- **A PWA install button is absent:** use HTTPS (or localhost), confirm the manifest, icon and service worker are accessible, and follow the manual install steps above.

## Future Work

Version 2 can add server-side secret storage, Firebase account linking, stricter quota/abuse controls, audited provider adapters for image/video/voice/music, generated video assembly, official social OAuth, analytics imports and an evidence-aware learning loop. None of these are simulated as live in this first version.
## Provider Gateway (Professional / Server-Side Secrets)

The upgraded build keeps provider secrets out of the React bundle. The browser calls the Firebase Functions `providerGateway`, and the function calls the provider APIs with server-side secrets.

### Recommended free-first provider stack

- **Google Gemini** — language/reasoning. `gemini-2.5-flash-lite` is a free-tier model suitable for the studio's structured text workflow. Google documents free input/output for eligible Gemini models. Current limits can change.
- **Tavily** — live research. The current Researcher plan includes 1,000 API credits/month without a credit card.
- **Hugging Face Inference Providers** — image and short video. Free accounts currently receive a small monthly inference credit allowance; this is experimentation capacity, not unlimited free generation.
- **ElevenLabs** — narration and sound effects. The current Free plan includes 10,000 credits/month; API keys are secrets and should stay server-side. Full Music API access is paid, so Money Maker AI labels its free adapter as sound effects rather than pretending free music exists.
- **Social publishing** — intentionally OAuth-based and not enabled by an API-key field. Official platform app credentials and review requirements differ by platform.

### Configure production secrets

From the project root:

```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set TAVILY_API_KEY
firebase functions:secrets:set HF_TOKEN
firebase functions:secrets:set ELEVENLABS_API_KEY
firebase functions:secrets:set ELEVENLABS_VOICE_ID
```

Then deploy:

```bash
npm run build
firebase deploy --only functions,hosting
```

The application itself never needs the provider secrets. **Do not put these values in `VITE_*` variables, React source files, GitHub, screenshots or Firestore.**

For local Firebase Functions emulator work, copy `functions/.env.example` to a local secret file supported by your Firebase CLI workflow and keep that file untracked. The production deployment should use Firebase Secret Manager.

### Important free-tier reality

"Free" does not mean unlimited. Hugging Face currently provides $0.10/month in Inference Provider credits for free users, while Tavily provides 1,000 API credits/month and ElevenLabs Free provides 10,000 credits/month. Video generation is the most resource-heavy stage; the app therefore uses strict local quotas and does not silently fall back to a paid provider.

### Completion semantics

The upgraded pipeline distinguishes:

1. **Workflow complete** — the content package and QC checks exist.
2. **Media generated** — provider-generated image/audio/video assets are attached.
3. **Rendered** — an actual video clip exists, not a storyboard placeholder.
4. **Published** — an official platform OAuth flow confirms publication.

A job must never be marked as having rendered media merely because a storyboard plan exists.
