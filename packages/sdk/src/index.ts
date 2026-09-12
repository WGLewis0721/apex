export type Balance = { remaining: number; version: number; as_of: string };
export type Entitlements = Balance & {
  customer_id: string;
  customer_status: string;
  subscription_status: string | null;
  plan: { key: string; name: string } | null;
  features: Array<{ key: string; name: string; limit: number | null }>;
};
export type ConsumeResult = Balance & {
  allowed: boolean;
  consumed?: number;
  reason?: "INSUFFICIENT_CREDITS";
  replayed: boolean;
};

export type ApexClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRetries?: number;
};

export class ApexError extends Error {
  readonly name = "ApexError";
  constructor(message: string, readonly status: number, readonly requestId?: string) {
    super(message);
  }
}

const retryable = (status: number) => status === 429 || status >= 500;
const delay = (attempt: number) => new Promise((resolve) => setTimeout(resolve, Math.min(1000, 100 * 2 ** attempt)));

export class ApexClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: ApexClientOptions) {
    if (!/^apex_sk_(test|live)_[A-Za-z0-9_]+$/.test(options.apiKey)) {
      throw new Error("APEX requires a server-side apex_sk_* API key; never use this client in a browser.");
    }
    if (options.fetch === undefined && typeof globalThis.fetch !== "function") {
      throw new Error("A fetch implementation is required on this Node.js runtime.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-api").replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 5) throw new Error("maxRetries must be between 0 and 5");
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("timeoutMs must be positive");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            accept: "application/json",
            ...(init?.body ? { "content-type": "application/json" } : {}),
            ...init?.headers,
          },
        });
        const body = await response.json().catch(() => ({})) as T & { error?: string };
        if (response.ok) return body;
        if (attempt < this.maxRetries && retryable(response.status)) {
          await delay(attempt);
          continue;
        }
        throw new ApexError(body.error ?? "APEX request failed", response.status, response.headers.get("x-request-id") ?? undefined);
      } catch (error) {
        if (error instanceof ApexError) throw error;
        if (attempt < this.maxRetries) {
          await delay(attempt);
          continue;
        }
        throw new ApexError(error instanceof Error && error.name === "AbortError" ? "APEX request timed out" : "Could not reach APEX", 0);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  balance(customerId: string): Promise<Balance> {
    return this.request(`/v1/customers/${encodeURIComponent(customerId)}/balance`);
  }

  entitlements(customerId: string): Promise<Entitlements> {
    return this.request(`/v1/customers/${encodeURIComponent(customerId)}/entitlements`);
  }

  consume(customerId: string, amount: number, idempotencyKey: string): Promise<ConsumeResult> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");
    if (!idempotencyKey.trim() || idempotencyKey.length > 200) throw new Error("idempotencyKey must contain 1-200 characters");
    return this.request(`/v1/customers/${encodeURIComponent(customerId)}/consume`, {
      method: "POST",
      body: JSON.stringify({ amount, idempotency_key: idempotencyKey }),
    });
  }
}
