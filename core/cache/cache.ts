import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env, isOffline } from "@/core/config/env";

/**
 * Deliberately boring: one JSON file per key, with a TTL, on disk.
 *
 * No infrastructure, no migration story to explain on stage, and it makes
 * `COMPASS_OFFLINE=1` a real guarantee rather than a best effort.
 */

interface Entry<T> {
  expiresAt: number;
  value: T;
}

export class CacheMissError extends Error {
  constructor(readonly key: string) {
    super(`Cache miss for "${key}" while offline`);
    this.name = "CacheMissError";
  }
}

function cacheDir(): string {
  const dir = env.cacheDir();
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function keyToFile(key: string): string {
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
  return path.join(cacheDir(), `${safe}--${hash}.json`);
}

export async function readCache<T>(
  key: string,
  opts: { allowExpired?: boolean } = {},
): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(keyToFile(key), "utf8");
    const entry = JSON.parse(raw) as Entry<T>;
    if (!opts.allowExpired && entry.expiresAt < Date.now()) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: Entry<T> = { expiresAt: Date.now() + ttlMs, value };
  const file = keyToFile(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(entry), "utf8");
}

/**
 * Read-through cache.
 *
 * - Online:  return a fresh hit, otherwise call `fn` and persist.
 * - Offline: return a hit regardless of expiry (a stale demo beats a blank
 *            screen), otherwise throw CacheMissError so the caller can degrade.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (isOffline()) {
    const hit = await readCache<T>(key, { allowExpired: true });
    if (hit !== undefined) return hit;
    throw new CacheMissError(key);
  }

  const hit = await readCache<T>(key);
  if (hit !== undefined) return hit;

  const value = await fn();
  await writeCache(key, value, ttlMs);
  return value;
}

export async function cacheStats(): Promise<{ dir: string; files: number; bytes: number }> {
  const dir = cacheDir();
  try {
    const names = await fs.readdir(dir);
    let bytes = 0;
    for (const n of names) {
      const st = await fs.stat(path.join(dir, n));
      bytes += st.size;
    }
    return { dir, files: names.length, bytes };
  } catch {
    return { dir, files: 0, bytes: 0 };
  }
}
