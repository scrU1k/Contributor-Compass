import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped configuration.
 *
 * Judges paste their own Gemma and GitHub credentials into the UI. Those
 * credentials must reach the server for the duration of one request and then
 * disappear — they are never written to disk or to process.env.
 *
 * AsyncLocalStorage is the least invasive way to do that: the GitHub client and
 * the LLM adapter keep reading `env.githubToken()` / `env.llmApiKey()`, and the
 * value they see becomes request-scoped instead of process-wide.
 */

export interface RequestConfig {
  githubToken?: string;
  llmApiKey?: string;
  llmModel?: string;
}

const storage = new AsyncLocalStorage<RequestConfig>();

export function withRequestConfig<T>(config: RequestConfig, fn: () => Promise<T>): Promise<T> {
  return storage.run(config, fn);
}

export function requestConfig(): RequestConfig | undefined {
  return storage.getStore();
}

/** Extract user-supplied credentials from the request headers. */
export function configFromRequest(request: Request): RequestConfig {
  const read = (name: string): string | undefined => {
    const value = request.headers.get(name)?.trim();
    return value ? value : undefined;
  };

  return {
    githubToken: read("x-compass-github-token"),
    llmApiKey: read("x-compass-llm-key"),
    llmModel: read("x-compass-llm-model"),
  };
}
