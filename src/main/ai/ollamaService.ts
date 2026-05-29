import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import type {
  LocalModelInfo,
  OllamaPullProgress,
  OllamaServiceStatus,
} from '../../shared/types';
import { DEFAULT_PULL_SET, MODEL_CATALOG } from './ollamaModels';

const execFileP = promisify(execFile);

// Ollama's local HTTP endpoint. Honour OLLAMA_HOST if the user has
// pointed their daemon elsewhere, else the documented default.
export const OLLAMA_HOST =
  process.env.OLLAMA_HOST && /^https?:\/\//.test(process.env.OLLAMA_HOST)
    ? process.env.OLLAMA_HOST
    : 'http://127.0.0.1:11434';

export const OLLAMA_INSTALL_URL = 'https://ollama.com/download';

// The daemon we spawned (if any). We only kill what we started — a
// pre-existing user daemon is left running on quit.
let spawned: ChildProcess | null = null;

// In-flight pulls keyed by model tag, so a pull can be cancelled.
const pulls = new Map<string, AbortController>();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function probeVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: unknown };
    return typeof j.version === 'string' ? j.version : 'unknown';
  } catch {
    return null;
  }
}

function candidatePaths(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/usr/local/bin/ollama',
      '/opt/homebrew/bin/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
    ];
  }
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA ?? '';
    return [`${la}\\Programs\\Ollama\\ollama.exe`];
  }
  return ['/usr/local/bin/ollama', '/usr/bin/ollama', '/bin/ollama'];
}

async function findBinary(): Promise<string | null> {
  for (const p of candidatePaths()) {
    if (existsSync(p)) return p;
  }
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileP(cmd, ['ollama']);
    const line = stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (line && existsSync(line.trim())) return line.trim();
  } catch {
    /* not on PATH */
  }
  return null;
}

export async function getStatus(): Promise<OllamaServiceStatus> {
  const version = await probeVersion();
  if (version) return { installed: true, running: true, version };
  const bin = await findBinary();
  return { installed: bin != null, running: false };
}

async function waitForReady(timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  let delay = 200;
  while (Date.now() - started < timeoutMs) {
    if (await probeVersion()) return true;
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.5), 1500);
  }
  return false;
}

export async function start(): Promise<OllamaServiceStatus> {
  // Already serving (possibly a daemon the user started themselves) —
  // attach, never double-spawn.
  if (await probeVersion()) return getStatus();
  const bin = await findBinary();
  if (!bin) return { installed: false, running: false, error: 'Ollama is not installed' };
  try {
    spawned = spawn(bin, ['serve'], { stdio: 'ignore' });
    spawned.on('exit', () => {
      spawned = null;
    });
  } catch (err) {
    return { installed: true, running: false, error: (err as Error).message };
  }
  const ready = await waitForReady(15000);
  return ready
    ? getStatus()
    : { installed: true, running: false, error: 'Ollama did not become ready' };
}

export async function listInstalled(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return [];
    const j = (await res.json()) as { models?: Array<{ name?: unknown }> };
    return Array.isArray(j.models)
      ? j.models.map((m) => m.name).filter((n): n is string => typeof n === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function listCatalog(): Promise<LocalModelInfo[]> {
  const installed = new Set(await listInstalled());
  // Ollama records bare tags as ':latest'; match both forms.
  const isInstalled = (tag: string): boolean =>
    installed.has(tag) || installed.has(tag.includes(':') ? tag : `${tag}:latest`);
  return MODEL_CATALOG.map((e) => ({
    tag: e.tag,
    label: e.label,
    kind: e.kind,
    approxBytes: e.approxBytes,
    installed: isInstalled(e.tag),
    defaultPull: DEFAULT_PULL_SET.includes(e.tag),
  }));
}

export async function pull(
  model: string,
  onProgress: (p: OllamaPullProgress) => void,
): Promise<void> {
  if (pulls.has(model)) return; // already pulling
  const ctrl = new AbortController();
  pulls.set(model, ctrl);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      onProgress({ model, status: 'error', error: `HTTP ${res.status}`, done: true });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const o = JSON.parse(line) as {
            status?: unknown;
            completed?: number;
            total?: number;
            error?: unknown;
          };
          if (o.error) {
            onProgress({ model, status: 'error', error: String(o.error), done: true });
            return;
          }
          onProgress({
            model,
            status: String(o.status ?? ''),
            completed: o.completed,
            total: o.total,
          });
        } catch {
          /* ignore non-JSON keepalive lines */
        }
      }
    }
    onProgress({ model, status: 'success', done: true });
  } catch (err) {
    const aborted = ctrl.signal.aborted;
    onProgress({
      model,
      status: aborted ? 'cancelled' : 'error',
      error: aborted ? undefined : (err as Error).message,
      done: true,
    });
  } finally {
    pulls.delete(model);
  }
}

export function cancelPull(model: string): void {
  pulls.get(model)?.abort();
  pulls.delete(model);
}

export async function deleteModel(model: string): Promise<void> {
  await fetch(`${OLLAMA_HOST}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
  });
}

// Free bytes on the volume where models are stored (~ user home). -1
// when it can't be determined, so callers can skip the pre-check
// rather than block on a bad reading.
export async function freeDiskBytes(): Promise<number> {
  try {
    const s = await statfs(os.homedir());
    return s.bavail * s.bsize;
  } catch {
    return -1;
  }
}

// Kill only a daemon WE spawned; abort any in-flight pulls. Wired to
// app 'before-quit'.
export function shutdown(): void {
  for (const c of pulls.values()) c.abort();
  pulls.clear();
  if (spawned && !spawned.killed) {
    try {
      spawned.kill();
    } catch {
      /* already gone */
    }
    spawned = null;
  }
}
