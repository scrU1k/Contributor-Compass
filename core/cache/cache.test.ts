import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readCache, writeCache, cached, clearL1Cache } from "./cache";

describe("Multi-Tier Cache", () => {
  beforeEach(() => {
    clearL1Cache();
  });

  it("stores and retrieves values with L1 memory hit", async () => {
    const key = `test-l1-${Date.now()}`;
    await writeCache(key, { greeting: "hello world" }, 10_000);

    const hit = await readCache<{ greeting: string }>(key);
    assert.deepEqual(hit, { greeting: "hello world" });
  });

  it("backfills L1 memory when retrieved from L2", async () => {
    const key = `test-l2-${Date.now()}`;
    await writeCache(key, { data: 42 }, 10_000);

    // Wipe L1 to force L2 disk read
    clearL1Cache();

    const hit = await readCache<{ data: number }>(key);
    assert.deepEqual(hit, { data: 42 });

    // Next read should come directly from backfilled L1
    const l1Hit = await readCache<{ data: number }>(key);
    assert.deepEqual(l1Hit, { data: 42 });
  });

  it("deduplicates concurrent in-flight requests", async () => {
    const key = `test-dedup-${Date.now()}`;
    let executions = 0;

    const slowFn = async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { result: "success" };
    };

    const [res1, res2] = await Promise.all([
      cached(key, 10_000, slowFn),
      cached(key, 10_000, slowFn),
    ]);

    assert.equal(executions, 1, "underlying function should only execute once");
    assert.deepEqual(res1, { result: "success" });
    assert.deepEqual(res2, { result: "success" });
  });

  it("respects expiration TTL", async () => {
    const key = `test-expire-${Date.now()}`;
    await writeCache(key, "will-expire", 1); // 1ms TTL

    await new Promise((resolve) => setTimeout(resolve, 10));

    const fresh = await readCache<string>(key);
    assert.equal(fresh, undefined);

    const stale = await readCache<string>(key, { allowExpired: true });
    assert.equal(stale, "will-expire");
  });
});
