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

export class ApexError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class ApexClient {
  private readonly baseUrl: string;
  constructor(options: { apiKey: string; baseUrl?: string; fetch?: typeof globalThis.fetch }) {
    if (!/^apex_sk_(test|live)_/.test(options.apiKey)) {
      throw new Error("APEX requires a server-side apex_sk_* API key; never use this client in a browser.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-api").replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  private readonly apiKey: string;
  private readonly fetcher: typeof globalThis.fetch;
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", ...init?.headers },
    });
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new ApexError(body.error ?? "APEX request failed", response.status);
    return body;
  }
  balance(customerId: string) { return this.request<Balance>(`/v1/customers/${encodeURIComponent(customerId)}/balance`); }
  entitlements(customerId: string) { return this.request<Entitlements>(`/v1/customers/${encodeURIComponent(customerId)}/entitlements`); }
  consume(customerId: string, amount: number, idempotencyKey: string) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive finite number");
    if (!idempotencyKey.trim()) throw new Error("idempotencyKey is required");
    return this.request<ConsumeResult>(`/v1/customers/${encodeURIComponent(customerId)}/consume`, {
      method: "POST", body: JSON.stringify({ amount, idempotency_key: idempotencyKey }),
    });
  }
}
