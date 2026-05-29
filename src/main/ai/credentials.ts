import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderId } from '../../shared/types';

// API keys live OUTSIDE PersistedState (which is plaintext electron-store
// JSON). Each key is encrypted with Electron's safeStorage and stashed
// in a tiny sidecar file in userData/. safeStorage uses the platform
// keychain underneath: macOS Keychain, Windows DPAPI, libsecret on
// Linux. Decryption only succeeds for the same OS user account — so a
// stolen config.json doesn't yield the keys.
//
// File format on disk:
//   <userData>/ai-credentials.json
//   {
//     "anthropic": "<base64 ciphertext>",
//     "openai":    "<base64 ciphertext>",
//     "gemini":    "<base64 ciphertext>"
//   }
//
// In-memory fallback: if safeStorage.isEncryptionAvailable() returns
// false (rare — would happen on a freshly-installed Linux without
// libsecret), keys live in process memory only and are LOST when the
// app quits. We log a clear warning and the renderer surfaces that
// state in the AI settings UI.

const FILE_NAME = 'ai-credentials.json';

let memoryFallback: Partial<Record<ProviderId, string>> | null = null;

function filePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(store), { mode: 0o600 });
  } catch (err) {
    console.warn('[pen] failed to persist AI credentials store', err);
  }
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function setKey(provider: ProviderId, key: string): void {
  const trimmed = key.trim();
  if (!encryptionAvailable()) {
    if (!memoryFallback) memoryFallback = {};
    memoryFallback[provider] = trimmed;
    console.warn(
      '[pen] safeStorage unavailable; AI key for',
      provider,
      'held in process memory only (will be lost on quit)',
    );
    return;
  }
  const cipher = safeStorage.encryptString(trimmed).toString('base64');
  const store = readStore();
  store[provider] = cipher;
  writeStore(store);
}

export function getKey(provider: ProviderId): string | null {
  if (!encryptionAvailable()) {
    return memoryFallback?.[provider] ?? null;
  }
  const store = readStore();
  const cipher = store[provider];
  if (!cipher) return null;
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch (err) {
    console.warn('[pen] failed to decrypt AI key for', provider, err);
    return null;
  }
}

export function hasKey(provider: ProviderId): boolean {
  if (!encryptionAvailable()) {
    return Boolean(memoryFallback?.[provider]);
  }
  const store = readStore();
  return typeof store[provider] === 'string' && store[provider].length > 0;
}

export function deleteKey(provider: ProviderId): void {
  if (!encryptionAvailable()) {
    if (memoryFallback) delete memoryFallback[provider];
    return;
  }
  const store = readStore();
  delete store[provider];
  writeStore(store);
}
