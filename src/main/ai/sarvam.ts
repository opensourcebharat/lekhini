import OpenAI from 'openai';
import JSZip from 'jszip';
import { SarvamAIClient } from 'sarvamai';
import type { AskInput } from '../../shared/types';
import type { ProviderAdapter } from './types';
import { assembleTurns } from './messages';

// Sarvam AI is integrated as a self-contained vision provider: when a
// snip image rides the request we first run it through Sarvam's
// Document Intelligence (Vision) OCR to extract the text, then hand
// that text to Sarvam's chat model to actually SOLVE the problem. With
// no image it's a plain chat call.
//
// Two transports:
//   • OCR   — the official `sarvamai` SDK orchestrates the async,
//             job-based Document Intelligence flow (createJob → upload
//             → start → poll → download). Upload accepts only PDF/ZIP,
//             so the PNG snip is wrapped in a single-entry ZIP; output
//             comes back as a ZIP we unpack in memory with JSZip.
//   • solve — Sarvam's chat endpoint is OpenAI-compatible, so we reuse
//             the `openai` SDK with a baseURL override (same trick as
//             deepseek.ts) to stream the answer.

const MAX_TOKENS = 2048;
const CHAT_BASE_URL = 'https://api.sarvam.ai/v1';

// Keep the interactive snip flow snappy: poll a bit faster than the
// SDK default (2s) and cap total wait so a stuck job surfaces an error
// instead of hanging the chat. ~1.5s × 30 ≈ 45s ceiling.
const OCR_POLL_INTERVAL_MS = 1500;
const OCR_MAX_POLLS = 30;

type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

// Per-session OCR cache. The snip is transcribed exactly once per
// conversation; follow-up turns reuse the text instead of re-running
// the (slow, job-based) Vision job. Bounded to the active session —
// any new sessionId evicts the rest.
const ocrCache = new Map<string, string>();

// Build the chat message list. The OCR'd image text is embedded into
// the FIRST user turn (not the latest follow-up) so every replayed turn
// carries the original problem; the model solves from the transcription.
function buildMessages(input: AskInput, ocrText: string | null): Message[] {
  const out: Message[] = [{ role: 'system', content: input.systemPrompt }];
  const { turns, firstUserIdx } = assembleTurns(input);
  turns.forEach((t, i) => {
    if (ocrText && ocrText.trim().length > 0 && i === firstUserIdx) {
      out.push({
        role: 'user',
        content: `Text extracted from the image:\n\n${ocrText.trim()}\n\n${t.content}`,
      });
    } else {
      out.push({ role: t.role, content: t.content });
    }
  });
  return out;
}

// PK\x03\x04 — local file header magic that starts every ZIP archive.
function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// Very small HTML→text fallback for when the only output is .html.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Pull human-readable text out of one downloaded output payload. The
// Document Intelligence output is delivered as a ZIP of per-page files;
// we prefer Markdown, then plain text, then HTML, then JSON.
async function textFromPayload(bytes: Uint8Array): Promise<string> {
  if (!isZip(bytes)) {
    return new TextDecoder().decode(bytes);
  }
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.values(zip.files).filter((f) => !f.dir);
  const pick = (exts: string[]): typeof files =>
    files
      .filter((f) => exts.some((e) => f.name.toLowerCase().endsWith(e)))
      .sort((a, b) => a.name.localeCompare(b.name));

  const md = pick(['.md', '.markdown', '.txt']);
  if (md.length) return (await Promise.all(md.map((f) => f.async('string')))).join('\n\n');

  const html = pick(['.html', '.htm']);
  if (html.length) {
    return (await Promise.all(html.map((f) => f.async('string').then(stripHtml)))).join('\n\n');
  }

  const json = pick(['.json']);
  if (json.length) {
    // Structured page data — flatten any string leaves into text.
    const texts: string[] = [];
    for (const f of json) {
      try {
        collectStrings(JSON.parse(await f.async('string')), texts);
      } catch {
        /* skip unparseable */
      }
    }
    return texts.join('\n');
  }
  return '';
}

// Recursively gather string values from the structured JSON output.
function collectStrings(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    if (node.trim().length > 0) out.push(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectStrings(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectStrings(v, out);
  }
}

// Run the snip PNG through Sarvam Document Intelligence and return the
// extracted text. Throws with a clear message on failure so the chat
// panel surfaces it.
async function runOcr(
  image: { mime: string; base64: string },
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });

  // Upload requires PDF or ZIP. Wrap the PNG in a flat single-entry ZIP
  // and hand it over as a File so the SDK keeps the .zip name (a bare
  // Blob would be uploaded as "document.pdf" and rejected).
  const zip = new JSZip();
  zip.file('snip.png', Buffer.from(image.base64, 'base64'));
  const zipBuf = await zip.generateAsync({ type: 'arraybuffer' });
  const zipFile = new File([zipBuf], 'snip.zip', { type: 'application/zip' });

  const job = await client.documentIntelligence.createJob({
    language: 'en-IN',
    outputFormat: 'md',
    pollingIntervalMs: OCR_POLL_INTERVAL_MS,
    maxPollingAttempts: OCR_MAX_POLLS,
  });
  if (signal.aborted) throw new Error('aborted');

  await job.uploadFile(zipFile);
  await job.start();
  const status = await job.waitUntilComplete();
  if (signal.aborted) throw new Error('aborted');
  // 'Completed' and 'PartiallyCompleted' both yield usable output; only
  // a hard failure (or a still-running job that hit the poll ceiling)
  // is an error.
  if (status.job_state !== 'Completed' && status.job_state !== 'PartiallyCompleted') {
    throw new Error(`Sarvam OCR ${status.job_state}: ${status.error_message ?? 'failed'}`);
  }

  const links = await job.getDownloadLinks();
  const urls = Object.values(links.download_urls ?? {})
    .map((d) => d.file_url)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) throw new Error('Sarvam OCR returned no output files');

  const parts: string[] = [];
  for (const url of urls) {
    const res = await fetch(url, { signal });
    if (!res.ok) continue;
    const text = await textFromPayload(new Uint8Array(await res.arrayBuffer()));
    if (text.trim().length > 0) parts.push(text);
  }
  return parts.join('\n\n');
}

export const sarvam: ProviderAdapter = {
  id: 'sarvam',
  async *ask(input, apiKey, signal) {
    // Main re-injects the cached snip on every turn of an image
    // conversation, so OCR once and reuse the text on follow-ups rather
    // than re-running the slow job each time.
    let ocrText: string | null = null;
    if (input.image) {
      const sid = input.sessionId;
      if (sid && ocrCache.has(sid)) {
        ocrText = ocrCache.get(sid) ?? null;
      } else {
        ocrText = await runOcr(input.image, apiKey, signal);
        if (sid) {
          ocrCache.clear(); // bound the cache to the active conversation
          ocrCache.set(sid, ocrText);
        }
      }
    }

    const client = new OpenAI({ apiKey, baseURL: CHAT_BASE_URL });
    const stream = await client.chat.completions.create(
      {
        model: input.model,
        max_tokens: MAX_TOKENS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: buildMessages(input, ocrText) as any,
        stream: true,
      },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        yield delta;
      }
    }
  },
};
