import type { ProfileId } from '../../shared/types';

// The local model catalogue surfaced in the installer. Sizes are the
// approximate on-disk footprint of the Q4_K_M quant Ollama pulls for
// each tag — used only for the disk-space pre-check and the UI, so a
// rough estimate is fine. All tags below are official Ollama library
// tags (no Modelfile needed) at time of writing; `qwen2.5vl` should be
// re-verified against the user's Ollama version (fallback: moondream).
const GB = 1024 * 1024 * 1024;

export interface CatalogEntry {
  tag: string;
  label: string;
  kind: 'text' | 'vision' | 'embed';
  approxBytes: number;
  // A short "why pick this" note for the installer row.
  note?: string;
}

export const MODEL_CATALOG: CatalogEntry[] = [
  // ── Text ──
  { tag: 'llama3.2:1b', label: 'Llama 3.2 1B', kind: 'text', approxBytes: 1.3 * GB, note: 'Tiny, fast — grammar / formatting' },
  { tag: 'qwen2.5:1.5b', label: 'Qwen 2.5 1.5B', kind: 'text', approxBytes: 1.0 * GB, note: 'Great text cleanup' },
  { tag: 'qwen2.5:3b', label: 'Qwen 2.5 3B', kind: 'text', approxBytes: 2.0 * GB, note: 'Stronger reasoning / analysis' },
  { tag: 'smollm2:1.7b', label: 'SmolLM2 1.7B', kind: 'text', approxBytes: 1.0 * GB, note: 'Lite on-device utility' },
  // ── Vision ──
  { tag: 'moondream', label: 'Moondream 2 (2B)', kind: 'vision', approxBytes: 1.7 * GB, note: 'Fast OCR / screenshot Q&A' },
  { tag: 'qwen2.5vl:3b', label: 'Qwen 2.5-VL 3B', kind: 'vision', approxBytes: 3.2 * GB, note: 'Best small vision (verify tag)' },
  // ── Embeddings (RAG, Phase 4) ──
  { tag: 'nomic-embed-text', label: 'Nomic Embed Text', kind: 'embed', approxBytes: 0.27 * GB, note: 'Embeddings for learning' },
];

export function catalogEntry(tag: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.tag === tag);
}

// Per-profile, per-task default model tags. The resolver uses these
// when the user hasn't set an explicit override and falls back to the
// first installed model of the right kind if the default isn't pulled.
export interface ProfileModels {
  text: string;
  vision: string;
}

export const PROFILE_MODELS: Record<ProfileId, ProfileModels> = {
  // Qwen2.5-VL is the vision default everywhere — it's far better at
  // reading handwriting / dense text than moondream, which matters most
  // for the drawn-ink recognition path. moondream stays in the catalogue
  // as a lighter option for low-RAM machines.
  general: { text: 'llama3.2:1b', vision: 'qwen2.5vl:3b' },
  teacher: { text: 'qwen2.5:3b', vision: 'qwen2.5vl:3b' },
  trader: { text: 'qwen2.5:3b', vision: 'qwen2.5vl:3b' },
};

// Default set pulled on first run: a fast tiny text model for autocorrect,
// a capable vision model for screenshot Q&A + handwriting OCR, and the
// embedding model for the learning loop. Heavier per-profile text models
// (e.g. qwen2.5:3b) are opt-in. Low-RAM users can swap the vision model
// to the lighter `moondream` from the catalogue.
export const DEFAULT_PULL_SET: string[] = ['llama3.2:1b', 'qwen2.5vl:3b', 'nomic-embed-text'];

// Embedding model tag used by the RAG layer (Phase 4).
export const EMBED_MODEL = 'nomic-embed-text';
