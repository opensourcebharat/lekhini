# AI in Lekhini

Lekhini's AI is **local-first, private, and entirely opt-in**. Nothing
AI-related runs until you turn it on, and with Local AI enabled your
snips and text never leave your machine. Cloud providers are an optional
fallback you configure with your own API key.

This document explains what the AI features do, how routing works, how to
configure each provider, where keys live, and how it's wired in code.

---

## What you can do

| Feature | Where | What it does |
| --- | --- | --- |
| **Ask AI** | Snip → **Ask AI** | Opens a chat about the captured region and **solves/answers** it (math, code, a question, an error) rather than just describing it. |
| **Follow-up chat** | Chat composer | Keeps the full conversation — the image (or its OCR text) is carried across turns — until a new snip starts a fresh conversation. |
| **Autocorrect (typed)** | Settings → AI | Cleans grammar/spelling of typed text. |
| **Autocorrect (drawn)** | Settings → AI | Cleans recognized handwriting. |
| **Handwriting recognition** | Draw, then pause | Transcribes drawn ink to a text shape via a vision model. |
| **Trader analysis** | Trader profile → Analyze | Sends your drawn levels (as numbers) for a written read. |
| **On-device learning** | automatic | Remembers accepted corrections locally (RAG) to personalize future suggestions. |

---

## How routing works (local-first)

A single resolver — `resolveProvider()` in
[`src/main/ai/ipc.ts`](../src/main/ai/ipc.ts) — decides who serves each
request:

1. **Local first.** If **Local AI** is on, the Ollama service is running,
   and a suitable model is installed, the request goes to Ollama. For an
   image request it picks a **vision** model; for text, a **text** model.
   Selection order: per-profile override → global default → the
   profile's catalogue default → any installed model of the right kind.
2. **Cloud fallback.** Otherwise, if a cloud provider is configured (has a
   saved API key and is the active provider), the request goes there.
3. **Nothing configured → no AI.** If neither is available, AI entry
   points stay hidden/disabled and the chat shows a "set something up"
   message. You must configure a provider before any AI feature works.

The renderer stays provider-agnostic: it sends a request and subscribes
to streamed chunks; the resolver picks local-vs-cloud and the concrete
model server-side.

---

## Providers

| Provider | Kind | Vision | Notes |
| --- | --- | --- | --- |
| **Ollama (Local)** | on-device | ✅ | Default. Private, free, no key. Models run via the local [Ollama](https://ollama.com) service. |
| **Anthropic Claude** | cloud | ✅ | Native vision. |
| **OpenAI** | cloud | ✅ | Native vision (`image_url`). |
| **Google Gemini** | cloud | ✅ | Native vision (`inlineData`). |
| **DeepSeek** | cloud | ❌ text-only | Strong reasoning; image snips are answered from text alone. Use a vision provider for image Q&A. |
| **Sarvam AI** | cloud | ✅ (OCR→LLM) | Runs **Sarvam Vision** document OCR on the image, then solves with Sarvam's own chat model. Excellent for Indic + dense text. |

**Sarvam's two-step pipeline** ([`src/main/ai/sarvam.ts`](../src/main/ai/sarvam.ts)):
the snip PNG is wrapped in a zip and sent to Sarvam's job-based Document
Intelligence (Vision) OCR; the extracted text is then embedded into the
chat and solved by `sarvam-m` / `sarvam-30b` / `sarvam-105b`. OCR runs
**once per conversation** (cached by session), so follow-ups are fast.

---

## Configuring it (Settings → AI)

### Local AI (recommended)

1. Toggle **Local AI (Ollama)** on. A first-run wizard checks for Ollama,
   links you to install it if missing, starts the service, and downloads
   a recommended model set (a small text model + a vision model + the
   embedding model for learning).
2. Optionally pin a **text** and **vision** model per profile, or install
   extra models from the catalogue.

Everything here stays on your device.

### Cloud provider (optional fallback)

1. Pick a provider under **Cloud fallback** and paste its API key, then
   **Save**. **Test** confirms the round-trip.
2. The provider/model you save becomes the active fallback used when
   Local AI is off or has no suitable model installed.

Get a key: Anthropic / OpenAI / Gemini / DeepSeek / Sarvam consoles are
linked from each provider's row.

### Other settings

- **Autocorrect typed / drawn** — independent toggles (default off).
- **Profile prompts** — override the built-in system prompt per profile.
- **Default text font** — for newly created text shapes.
- **Learning** — view/reset the on-device example store per profile.

---

## Privacy & where keys live

- **Local AI**: text and images stay on your machine — nothing is sent to
  a server.
- **Cloud providers**: content goes directly to the provider you chose,
  under its own data policy. Lekhini does not proxy or log it.
- **API keys** are never stored in the plaintext settings file. They're
  encrypted with the OS keychain (macOS Keychain / Windows DPAPI /
  libsecret) via [`src/main/ai/credentials.ts`](../src/main/ai/credentials.ts),
  in a sidecar `ai-credentials.json` decryptable only by your OS user.
- **Learning (RAG)** examples are stored only on this device.

---

## Code map

| Concern | File |
| --- | --- |
| Provider interface | [`src/main/ai/types.ts`](../src/main/ai/types.ts) |
| Per-provider adapters | `src/main/ai/{anthropic,openai,gemini,deepseek,sarvam,ollama}.ts` |
| Adapter registry (models, labels, key URLs) | [`src/main/ai/registry.ts`](../src/main/ai/registry.ts) |
| Resolver + IPC + session image cache | [`src/main/ai/ipc.ts`](../src/main/ai/ipc.ts) |
| Shared message assembly (history + first-turn image) | [`src/main/ai/messages.ts`](../src/main/ai/messages.ts) |
| Local Ollama service + model catalogue | `src/main/ai/ollama*.ts` |
| On-device learning (RAG) | `src/main/ai/rag.ts`, `ragIpc.ts` |
| Encrypted API key store | [`src/main/ai/credentials.ts`](../src/main/ai/credentials.ts) |
| Chat UI | [`src/renderer/toolbar/ChatPanel.tsx`](../src/renderer/toolbar/ChatPanel.tsx) |
| Settings → AI UI | [`src/renderer/toolbar/App.tsx`](../src/renderer/toolbar/App.tsx) |

**Adding a provider**: implement `ProviderAdapter.ask()` in a new
`src/main/ai/<id>.ts`, add the id to `ProviderId` in
[`src/shared/types.ts`](../src/shared/types.ts), register it in
`registry.ts` (adapter + models + label + key URL), and add it to the
cloud-provider checks in `ipc.ts`, the persistence validation in
`hub.ts`, and the Settings maps in the toolbar `App.tsx`. The renderer,
preload, and message assembly need no changes.
