# Money Maker AI — Engineering Test Report

## Scope

The existing UI/workflow architecture was preserved. The provider layer and production stages were upgraded instead of replacing the application with a new UI.

## Completed checks in the build environment

- All TypeScript/TSX source files parse successfully.
- A lightweight TypeScript semantic check with project dependencies stubbed completed without source-level type errors.
- Firebase Functions backend JavaScript passes `node --check`.
- `package.json`, `functions/package.json` and `firebase.json` parse as valid JSON.
- Provider secrets are no longer required in the React bundle.
- Existing Firestore sync continues to strip provider secrets.
- Provider connection state is now derived from the server gateway when available.
- Production output distinguishes storyboard-only from actual generated image/audio/video media.
- The original UI, navigation, local persistence, Firebase workspace sync and review workflow remain in place.

## Provider integration matrix

| Stage | Provider | Adapter | Output |
|---|---|---|---|
| Language/reasoning | Google Gemini | Server gateway | Structured JSON story/idea/script/scenes/QC |
| Research | Tavily | Server gateway | Source-linked web research |
| Images | Hugging Face / FLUX.1-schnell | Server gateway | Actual image data URL |
| Video | Hugging Face / LTX-Video | Server gateway | Actual short video data URL |
| Voice | ElevenLabs | Server gateway | Actual MP3 narration |
| Sound | ElevenLabs Sound Generation | Server gateway | Actual MP3 SFX |
| Social publishing | Official OAuth | Not enabled | Deliberately gated until platform OAuth is configured |

## Important limitation before production deployment

This sandbox did not complete a full `npm ci` because external package installation timed out. Therefore a real Vite production build was not falsely marked as passed here. Run `npm install` and `npm run build` on the target machine before deployment.

Likewise, provider APIs cannot be truthfully marked live without the user's own provider credentials. The project includes the server-side secret setup and real connection tests; after secrets are configured, the **Test connection** controls perform actual provider calls.

No provider secret is included in this archive.
