import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProfileId } from '../../shared/types';
import { OLLAMA_HOST } from './ollamaService';
import { EMBED_MODEL } from './ollamaModels';

// Local, privacy-preserving "self-learning" via RAG. Accepted
// corrections + bundled per-profile intent examples are embedded with
// a local model and stored on disk; the closest ones are retrieved as
// few-shot context for future corrections. No data leaves the device.
//
// The store is a single JSON file with brute-force cosine search. At
// the realistic scale (hundreds–few thousand examples) this is fast
// and dependency-free; swapping in sqlite-vec later is a drop-in for
// the same retrieve()/capture() surface.

export type RagKind = 'typed' | 'drawn' | 'analysis' | 'chat';

interface RagEntry {
  id: number;
  profile: ProfileId;
  kind: RagKind;
  original: string;
  corrected: string;
  accepted: boolean;
  source: 'user' | 'seed';
  createdAt: number;
  embedding: number[];
}

export interface CaptureInput {
  profile: ProfileId;
  kind: RagKind;
  original: string;
  corrected: string;
  accepted?: boolean;
  source?: 'user' | 'seed';
}

const PROFILES: ProfileId[] = ['general', 'teacher', 'trader'];
// Keep brute-force search snappy: cap stored user examples per profile
// (seeds are exempt). Oldest user entries are evicted first.
const MAX_USER_PER_PROFILE = 500;
const SIM_FLOOR = 0.55; // ignore weak matches

let entries: RagEntry[] = [];
let nextId = 1;
let loaded = false;
let dbPath = '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function file(): string {
  if (!dbPath) dbPath = path.join(app.getPath('userData'), 'lekhini-rag.json');
  return dbPath;
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(file(), 'utf8');
    const data = JSON.parse(raw) as { entries?: RagEntry[] };
    entries = Array.isArray(data.entries) ? data.entries : [];
    nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  } catch {
    entries = [];
  }
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persist();
  }, 500);
}

async function persist(): Promise<void> {
  try {
    await fs.writeFile(file(), JSON.stringify({ entries }), 'utf8');
  } catch {
    /* best-effort */
  }
}

// Embed text with the local embedding model. Returns null whenever the
// model/service isn't available — callers treat that as "RAG off".
async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { embedding?: number[] };
    return Array.isArray(j.embedding) && j.embedding.length > 0 ? j.embedding : null;
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function evictIfNeeded(profile: ProfileId): void {
  const userEntries = entries.filter((e) => e.profile === profile && e.source === 'user');
  if (userEntries.length <= MAX_USER_PER_PROFILE) return;
  const excess = userEntries.length - MAX_USER_PER_PROFILE;
  const evictIds = new Set(
    userEntries
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, excess)
      .map((e) => e.id),
  );
  entries = entries.filter((e) => !evictIds.has(e.id));
}

export async function capture(input: CaptureInput): Promise<void> {
  await load();
  const original = input.original.trim();
  const corrected = input.corrected.trim();
  if (!original || !corrected || original === corrected) return;
  // De-dupe identical originals within a profile.
  if (entries.some((e) => e.profile === input.profile && e.original === original)) return;
  const embedding = await embed(original);
  if (!embedding) return; // embeddings unavailable → silently skip
  entries.push({
    id: nextId++,
    profile: input.profile,
    kind: input.kind,
    original,
    corrected,
    accepted: input.accepted ?? true,
    source: input.source ?? 'user',
    createdAt: Date.now(),
    embedding,
  });
  evictIfNeeded(input.profile);
  scheduleSave();
}

export async function retrieve(
  profile: ProfileId,
  query: string,
  k = 3,
): Promise<{ original: string; corrected: string }[]> {
  await load();
  const q = query.trim();
  if (!q || entries.length === 0) return [];
  const emb = await embed(q);
  if (!emb) return [];
  return entries
    .filter((e) => e.profile === profile && e.accepted)
    .map((e) => ({ e, s: cosine(emb, e.embedding) }))
    .filter((x) => x.s >= SIM_FLOOR)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => ({ original: x.e.original, corrected: x.e.corrected }));
}

export async function stats(): Promise<Record<ProfileId, number>> {
  await load();
  const out: Record<ProfileId, number> = { general: 0, teacher: 0, trader: 0 };
  for (const e of entries) out[e.profile] = (out[e.profile] ?? 0) + 1;
  return out;
}

export async function resetProfile(profile: ProfileId): Promise<void> {
  await load();
  entries = entries.filter((e) => e.profile !== profile);
  await persist();
}

// ── Intent-file seeding ─────────────────────────────────────────────

function intentDirs(): string[] {
  const dirs: string[] = [];
  if (process.resourcesPath) dirs.push(path.join(process.resourcesPath, 'intent'));
  dirs.push(path.join(app.getAppPath(), 'resources', 'intent'));
  dirs.push(path.join(app.getAppPath(), '..', 'resources', 'intent'));
  return dirs;
}

async function loadIntentFile(profile: ProfileId): Promise<{ original: string; corrected: string }[]> {
  for (const base of intentDirs()) {
    try {
      const raw = await fs.readFile(path.join(base, `${profile}.jsonl`), 'utf8');
      return raw
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => {
          try {
            return JSON.parse(l) as { original?: string; corrected?: string };
          } catch {
            return {};
          }
        })
        .filter((o): o is { original: string; corrected: string } => !!o.original && !!o.corrected);
    } catch {
      /* try next dir */
    }
  }
  return [];
}

let seeding = false;
// Ingest the bundled per-profile examples once embeddings are available.
// Self-healing: if Ollama/the embed model isn't up yet, nothing is
// recorded and a later call retries. Fire-and-forget.
export async function maybeSeed(): Promise<void> {
  if (seeding) return;
  seeding = true;
  try {
    await load();
    for (const profile of PROFILES) {
      if (entries.some((e) => e.profile === profile && e.source === 'seed')) continue;
      const pairs = await loadIntentFile(profile);
      for (const p of pairs) {
        await capture({
          profile,
          kind: 'typed',
          original: p.original,
          corrected: p.corrected,
          source: 'seed',
        });
      }
    }
  } finally {
    seeding = false;
  }
}
