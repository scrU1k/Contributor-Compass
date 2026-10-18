/**
 * Upstream Provider Circuit Breaker.
 *
 * Protects user experience against slow or failing external APIs
 * (Google AI Studio Gemma 4 & GitHub Core REST).
 *
 * States:
 *   - CLOSED: Normal operation; requests pass through.
 *   - OPEN: Upstream failing or latency spiking; fails fast to deterministic fallback.
 *   - HALF_OPEN: Cooldown expired; testing upstream with a probe request.
 */

export interface CircuitBreakerOptions {
  /** Consecutive failures before tripping to OPEN. Default: 3 */
  failureThreshold?: number;
  /** Cooldown time in ms before transitioning to HALF_OPEN. Default: 30,000ms */
  cooldownMs?: number;
  /** Latency threshold in ms. Responses slower than this count as failures. Default: 8,000ms */
  latencyThresholdMs?: number;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreakerError extends Error {
  constructor(readonly serviceName: string, message: string) {
    super(`[CircuitBreaker:${serviceName}] ${message}`);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly latencyThresholdMs: number;
  readonly name: string;

  constructor(name: string, opts: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.latencyThresholdMs = opts.latencyThresholdMs ?? 8_000;
  }

  getState(): CircuitState {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.state = "HALF_OPEN";
      }
    }
    return this.state;
  }

  isOpen(): boolean {
    return this.getState() === "OPEN";
  }

  recordSuccess(durationMs?: number): void {
    if (durationMs !== undefined && durationMs > this.latencyThresholdMs) {
      // Latency spike: treat slow response as failure
      this.recordFailure(new Error(`Latency spike (${durationMs}ms > ${this.latencyThresholdMs}ms)`));
      return;
    }
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  recordFailure(err?: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
    }
  }

  async execute<T>(fn: () => Promise<T>, shouldTrip?: (err: unknown) => boolean): Promise<T> {
    if (this.isOpen()) {
      throw new CircuitBreakerError(
        this.name,
        `Circuit is OPEN (tripped after consecutive failures/latency spikes). Failing fast to deterministic fallback.`,
      );
    }

    const start = Date.now();
    try {
      const result = await fn();
      const elapsed = Date.now() - start;
      this.recordSuccess(elapsed);
      return result;
    } catch (err) {
      if (!shouldTrip || shouldTrip(err)) {
        this.recordFailure(err);
      }
      throw err;
    }
  }
}

/** Pre-configured circuit breakers for the two external services. */
export const llmCircuitBreaker = new CircuitBreaker("Google-AI-Studio-Gemma4", {
  failureThreshold: 2,
  latencyThresholdMs: 8_000,
  cooldownMs: 30_000,
});

export const ghCircuitBreaker = new CircuitBreaker("GitHub-REST-API", {
  failureThreshold: 3,
  latencyThresholdMs: 8_000,
  cooldownMs: 30_000,
});
