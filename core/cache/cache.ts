import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env, isOffline } from "@/core/config/env";

/**
 * Multi-Tier Cache:
 * - L1: In-memory LRU cache (< 0.1ms read time, eliminates process-level re-reads)
 * - L2: Atomic disk cache (local dev / serverless ephemeral disk) OR Upstash Redis REST
 * - In-flight deduplication: Prevents cache stampedes under concurrent loads
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

/** In-memory LRU cache (L1) */
class LruMemoryCache<T = unknown> {
  private map = new Map<string, Entry<T>>();
  constructor(private readonly maxCapacity: number = 500) {}

  get(key: string, allowExpired = false): Entry<T> | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (!allowExpired && entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh LRU order (delete & re-insert)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  set(key: string, value: T, expiresAt: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxCapacity) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, { expiresAt, value });
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

const l1 = new LruMemoryCache(500);

/** Exported for testing and cache reset */
export function clearL1Cache(): void {
  l1.clear();
}

function cacheDir(): string {
  const dir = env.cacheDir();
  return path.isAbsolute(dir) ? dir : path.join(/*turbopackIgnore: true*/ process.cwd(), dir);
}

function keyToFile(key: string): string {
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64);
  return path.join(cacheDir(), `${safe}--${hash}.json`);
}

// Optional Upstash Redis REST L2 check
function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

async function readL2<T>(key: string): Promise<Entry<T> | undefined> {
  const redis = getRedisConfig();
  if (redis) {
    try {
      const safeKey = `cc:${encodeURIComponent(key)}`;
      const res = await fetch(`${redis.url}/get/${safeKey}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = (await res.json()) as { result: string | null };
        if (data?.result) {
          return JSON.parse(data.result) as Entry<T>;
        }
      }
    } catch {
      // Fall through to disk if Redis fails
    }
  }

  // Disk fallback
  try {
    const raw = await fs.readFile(keyToFile(key), "utf8");
    return JSON.parse(raw) as Entry<T>;
  } catch {
    return undefined;
  }
}

async function writeL2<T>(key: string, entry: Entry<T>, ttlMs: number): Promise<void> {
  const redis = getRedisConfig();
  if (redis) {
    try {
      const safeKey = `cc:${encodeURIComponent(key)}`;
      const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
      await fetch(`${redis.url}/set/${safeKey}/${encodeURIComponent(JSON.stringify(entry))}?ex=${ttlSec}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redis.token}` },
        signal: AbortSignal.timeout(3000),
      });
      return;
    } catch {
      // Fall through to disk write
    }
  }

  // Atomic disk write
  const file = keyToFile(key);
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = path.join(
    dir,
    `${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  await fs.writeFile(tmpFile, JSON.stringify(entry), "utf8");
  await fs.rename(tmpFile, file);
}

export async function readCache<T>(
  key: string,
  opts: { allowExpired?: boolean } = {},
): Promise<T | undefined> {
  // L1 Check
  const l1Hit = l1.get(key, opts.allowExpired) as Entry<T> | undefined;
  if (l1Hit) return l1Hit.value;

  // L2 Check
  const entry = await readL2<T>(key);
  if (!entry) return undefined;
  if (!opts.allowExpired && entry.expiresAt < Date.now()) return undefined;

  // Backfill L1
  l1.set(key, entry.value, entry.expiresAt);
  return entry.value;
}

export async function writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: Entry<T> = { expiresAt: Date.now() + ttlMs, value };
  l1.set(key, value, entry.expiresAt);
  await writeL2(key, entry, ttlMs);
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Read-through cache with multi-tier storage and in-flight deduplication.
 *
 * - Online:  Check L1 (memory) -> Check L2 (Redis/Disk) -> Run deduplicated fn() -> Save L1 + L2.
 * - Offline: return a hit regardless of expiry, otherwise throw CacheMissError.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (isOffline()) {
    const hit = await readCache<T>(key, { allowExpired: true });
    if (hit !== undefined) return hit;
    throw new CacheMissError(key);
  }

  const hit = await readCache<T>(key);
  if (hit !== undefined) return hit;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await fn();
      await writeCache(key, value, ttlMs);
      return value;
    } catch (err) {
      const fallback = await readCache<T>(key, { allowExpired: true });
      if (fallback !== undefined) return fallback;
      throw err;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export async function cacheStats(): Promise<{ dir: string; files: number; bytes: number; l1Size: number }> {
  const dir = cacheDir();
  try {
    const names = await fs.readdir(dir);
    let bytes = 0;
    for (const n of names) {
      const st = await fs.stat(path.join(dir, n));
      bytes += st.size;
    }
    return { dir, files: names.length, bytes, l1Size: l1.size() };
  } catch {
    return { dir, files: 0, bytes: 0, l1Size: l1.size() };
  }
}
