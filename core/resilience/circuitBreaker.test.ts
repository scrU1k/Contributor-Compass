import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, CircuitBreakerError } from "./circuitBreaker";

describe("Upstream Circuit Breaker", () => {
  it("allows successful operations in CLOSED state", async () => {
    const cb = new CircuitBreaker("test-service", { failureThreshold: 2 });
    assert.equal(cb.getState(), "CLOSED");

    const result = await cb.execute(async () => "ok");
    assert.equal(result, "ok");
    assert.equal(cb.getState(), "CLOSED");
  });

  it("trips to OPEN state after consecutive failures", async () => {
    const cb = new CircuitBreaker("failing-service", { failureThreshold: 2, cooldownMs: 5000 });

    try {
      await cb.execute(async () => {
        throw new Error("fail 1");
      });
    } catch {
      // Expected
    }
    assert.equal(cb.getState(), "CLOSED");

    try {
      await cb.execute(async () => {
        throw new Error("fail 2");
      });
    } catch {
      // Expected
    }
    assert.equal(cb.getState(), "OPEN");

    // Next call should fail fast without executing fn
    let fnExecuted = false;
    await assert.rejects(
      async () => {
        await cb.execute(async () => {
          fnExecuted = true;
          return "won't run";
        });
      },
      (err: Error) => {
        assert.ok(err instanceof CircuitBreakerError);
        assert.match(err.message, /Circuit is OPEN/);
        return true;
      },
    );
    assert.equal(fnExecuted, false);
  });

  it("trips when latency exceeds threshold", async () => {
    const cb = new CircuitBreaker("slow-service", { failureThreshold: 1, latencyThresholdMs: 20 });

    await cb.execute(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return "slow response";
    });

    assert.equal(cb.getState(), "OPEN", "Latency spike should trip breaker");
  });

  it("respects shouldTrip predicate", async () => {
    const cb = new CircuitBreaker("filtered-service", { failureThreshold: 1 });

    // An error that should NOT trip (e.g., 404)
    try {
      await cb.execute(
        async () => {
          const err = new Error("Not found");
          (err as any).status = 404;
          throw err;
        },
        (err: any) => err.status !== 404,
      );
    } catch {
      // Expected
    }

    assert.equal(cb.getState(), "CLOSED", "404 should not trip breaker");
  });
});
