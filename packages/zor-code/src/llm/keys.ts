import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { getAllProviders, ProviderConfig, resolveApiKey } from './providers';
import { encrypt, tryDecrypt } from '../utils/encrypt';
import { getToken as getAuthToken } from './auth';

export interface KeyEntry {
  provider: string;
  key: string;
  setAt: string;
}

const CONFIG_DIR = join(homedir(), '.zor');
const KEYS_FILE = join(CONFIG_DIR, 'keys.json');

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function ensureKeyFilePermissions() {
  try {
    if (existsSync(CONFIG_DIR)) chmodSync(CONFIG_DIR, 0o700);
    if (existsSync(KEYS_FILE)) chmodSync(KEYS_FILE, 0o600);
  } catch (e: any) { /* ponytail: chmod is best-effort on Windows, not critical */ }
}

export function loadKeys(): KeyEntry[] {
  ensureDir();
  ensureKeyFilePermissions();
  if (!existsSync(KEYS_FILE)) return [];
  try {
    return JSON.parse(tryDecrypt(readFileSync(KEYS_FILE, 'utf8')));
  } catch {
    return [];
  }
}

export function saveKeys(keys: KeyEntry[]) {
  ensureDir();
  writeFileSync(KEYS_FILE, encrypt(JSON.stringify(keys, null, 2)), { mode: 0o600 });
}

export function setKey(providerId: string, key: string) {
  const keys = loadKeys().filter(k => k.provider !== providerId);
  keys.push({ provider: providerId, key, setAt: new Date().toISOString() });
  saveKeys(keys);
}

export function getKey(providerId: string): string | null {
  const authToken = getAuthToken(providerId);
  if (authToken) return authToken;
  const keys = loadKeys();
  const entry = keys.find(k => k.provider === providerId);
  return entry?.key || null;
}

export function removeKey(providerId: string) {
  saveKeys(loadKeys().filter(k => k.provider !== providerId));
}

export function listKeys(): { provider: string; masked: string; setAt: string }[] {
  return loadKeys().map(k => {
    const auth = getAuthToken(k.provider);
    const key = auth || k.key;
    return {
      provider: k.provider,
      masked: key.slice(0, 6) + '...' + key.slice(-4),
      setAt: k.setAt,
    };
  });
}

export function resolveKey(provider: ProviderConfig): string | null {
  if (provider.api === 'ollama') return 'ollama';
  const envKey = resolveApiKey(provider);
  if (envKey) return envKey;
  const authToken = getAuthToken(provider.id);
  if (authToken) return authToken;
  return getKey(provider.id);
}

export function getKeySource(provider: ProviderConfig): 'env' | 'auth' | 'saved' | 'none' {
  if (provider.api === 'ollama') return 'env';
  if (resolveApiKey(provider)) return 'env';
  if (getAuthToken(provider.id)) return 'auth';
  if (getKey(provider.id)) return 'saved';
  return 'none';
}

export function getKeyStatuses(): { provider: string; name: string; hasKey: boolean }[] {
  return getAllProviders().map(p => ({
    provider: p.id,
    name: p.name,
    hasKey: p.api === 'ollama' ? true : !!resolveKey(p),
  }));
}