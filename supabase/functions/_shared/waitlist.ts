// Beta waitlist signup → Google Sheets.
//
// Runtime-neutral (Web Request/Response + WebCrypto only), so the same file
// runs on Node, Next.js, Nitro/h3, Bun and Deno. The request/response contract
// matches PoryGen's /api/waitlist; see docs/WAITLIST_API.md.

export const WAITLIST_CONSENT_VERSION = "2026-10-03-v1";
export const MAX_BODY_BYTES = 8 * 1024;
/** Columns A:E of the sheet, in order. Row 1 must hold these headers. */
export const SHEET_HEADERS = ["submitted_at", "email", "name", "consent_version", "status"] as const;
const NAME_MAX = 100;
// Deliberately simple: one @, no spaces, a dotted domain. Delivery is the real check.
const EMAIL = /^[^\s@"<>()[\],;:\\]+@[^\s@"<>()[\],;:\\]+\.[^\s@"<>()[\],;:\\]{2,}$/;

/** Only name and email are collected; any other field a form sends is ignored. */
export type WaitlistEntry = { email: string; name: string };

export class WaitlistError extends Error {
  code: string;
  status: number;
  field: string | undefined;
  retryable: boolean;
  headers?: Record<string, string>;
  constructor(code: string, message: string, status = 400, field?: string, retryable = false) {
    super(message);
    this.name = "WaitlistError";
    this.code = code;
    this.status = status;
    this.field = field;
    this.retryable = retryable;
  }
}

// Strip control characters and collapse whitespace; free text is single-line in the sheet.
const clean = (value: string, max: number) => value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Guard against spreadsheet formula injection if the sheet is exported to CSV/Excel. */
export const cell = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export function validateSubmission(body: unknown): WaitlistEntry {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new WaitlistError("INVALID_REQUEST", "Send a JSON object.");
  const input = body as { email?: unknown; name?: unknown; consent?: unknown };
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) throw new WaitlistError("EMAIL_REQUIRED", "Enter your email address.", 400, "email");
  if (email.length > 254 || !EMAIL.test(email)) throw new WaitlistError("INVALID_EMAIL", "Enter a valid email address.", 400, "email");
  // Legal but practically unused, and they would need the sheet's formula guard,
  // which would break exact duplicate matching. Refuse them instead.
  if (/^[=+\-@']/.test(email)) throw new WaitlistError("INVALID_EMAIL", "Enter a valid email address.", 400, "email");
  // Joining is the opt-in; a form that sends an explicit "no" is refused.
  if (input.consent === false) throw new WaitlistError("CONSENT_REQUIRED", "Agree to be contacted about the beta to join the waitlist.", 400, "consent");
  let name = "";
  if (input.name !== undefined && input.name !== null && input.name !== "") {
    if (typeof input.name !== "string") throw new WaitlistError("INVALID_FIELD", "name must be text.", 400, "name");
    name = clean(input.name, NAME_MAX);
  }
  return { email, name };
}

export const toRow = (entry: WaitlistEntry, submittedAt: string) =>
  [submittedAt, entry.email, entry.name, WAITLIST_CONSENT_VERSION, "waitlisted"].map(cell);

// --- Abuse controls ---------------------------------------------------------

export type RateLimit = (key: string) => { allowed: true } | { allowed: false; retryAfter: number };

/** Best-effort, per warm instance. A platform firewall rule is the durable layer. */
export function createRateLimiter({ limit = 10, windowMs = 10 * 60_000, maxKeys = 10_000, now = Date.now } = {}): RateLimit {
  const hits = new Map<string, number[]>();
  return key => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter(at => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { allowed: false, retryAfter: Math.ceil((windowMs - (t - (recent[0] ?? t))) / 1000) };
    }
    recent.push(t);
    hits.delete(key);
    hits.set(key, recent);
    if (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
    return { allowed: true };
  };
}

export function clientIp(request: Request) {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
}

/**
 * Same-host requests always pass; other browser origins must be listed exactly
 * (e.g. a GitHub Pages mirror). No Origin header = not a browser CSRF; allowed.
 */
export function originAllowed(request: Request, allowedOrigins: readonly string[]) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  let host: string;
  try { host = new URL(origin).host; } catch { return false; }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")];
  try { hosts.push(new URL(request.url).host); } catch { /* relative URL */ }
  return hosts.some(candidate => candidate === host);
}

// --- Handler ----------------------------------------------------------------

export interface WaitlistStore {
  hasEmail(email: string): Promise<boolean>;
  appendRow(row: string[]): Promise<void>;
}

/** Sends a "new signup" alert. Only called for emails not already on the list. */
export interface WaitlistNotifier {
  notify(entry: WaitlistEntry, submittedAt: string): Promise<void>;
}

export interface WaitlistHandlerOptions {
  store: WaitlistStore | null;
  notifier?: WaitlistNotifier | null;
  allowedOrigins?: readonly string[];
  rateLimit?: RateLimit;
  now?: () => Date;
  log?: { error?: (...args: unknown[]) => void };
}

export function createWaitlistHandler({ store, notifier = null, allowedOrigins = [], rateLimit = createRateLimiter(), now = () => new Date(), log = console }: WaitlistHandlerOptions) {
  // Same-email submissions take turns within this instance (double clicks,
  // retries), so the read-then-append below cannot interleave for one address.
  // Sheets has no unique constraint, so two instances can still race; rare.
  const inFlight = new Map<string, Promise<boolean>>();
  const saveOnce = (entry: WaitlistEntry, submittedAt: string, sheet: WaitlistStore) => {
    const previous = inFlight.get(entry.email) ?? Promise.resolve(false);
    const run = previous.catch(() => false).then(async () => {
      if (await sheet.hasEmail(entry.email)) return false;
      await sheet.appendRow(toRow(entry, submittedAt));
      return true;
    });
    inFlight.set(entry.email, run);
    const cleanup = () => { if (inFlight.get(entry.email) === run) inFlight.delete(entry.email); };
    run.then(cleanup, cleanup);
    return run;
  };

  return async function handleWaitlist(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const allowed = originAllowed(request, allowedOrigins);
    const headers: Record<string, string> = { "cache-control": "no-store", "x-content-type-options": "nosniff", vary: "Origin" };
    if (origin && allowed) headers["access-control-allow-origin"] = origin;
    const json = (status: number, payload: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(payload), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8", ...extra } });

    if (request.method === "OPTIONS") {
      if (!allowed) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers: { ...headers, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, apikey, x-client-info", "access-control-max-age": "86400" } });
    }
    try {
      if (request.method !== "POST") throw Object.assign(new WaitlistError("METHOD_NOT_ALLOWED", "Method not allowed.", 405), { headers: { allow: "POST, OPTIONS" } });
      if (!allowed) throw new WaitlistError("ORIGIN_NOT_ALLOWED", "This origin cannot submit to the waitlist.", 403);
      const type = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
      if (type !== "application/json") throw new WaitlistError("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
      const limited = rateLimit(clientIp(request));
      if (!limited.allowed) {
        throw Object.assign(new WaitlistError("RATE_LIMITED", "Too many signups from this network. Try again later.", 429, undefined, true), { headers: { "retry-after": String(limited.retryAfter) } });
      }
      const body = await readJson(request);
      // Honeypot: a hidden "website" input real visitors leave empty. Bots get a
      // normal-looking success and nothing is stored.
      if (body && typeof body === "object" && typeof (body as { website?: unknown }).website === "string" && (body as { website: string }).website.trim()) {
        return json(200, { ok: true, status: "joined" });
      }
      const entry = validateSubmission(body);
      // Success always means a durable sheet row; without the sheet, refuse.
      if (!store) throw new WaitlistError("WAITLIST_UNAVAILABLE", "The waitlist is not open yet. Try again later.", 503, undefined, true);
      const submittedAt = now().toISOString();
      let isNew: boolean;
      try {
        isNew = await saveOnce(entry, submittedAt, store);
      } catch (error) {
        log.error?.("waitlist storage failed", (error as { status?: number })?.status ?? "", (error as Error)?.message ?? error);
        throw new WaitlistError("WAITLIST_STORAGE_FAILED", "We couldn't save your signup. Try again in a moment.", 502, undefined, true);
      }
      // The alert is best-effort and only follows a saved row.
      if (notifier && isNew) {
        try {
          await notifier.notify(entry, submittedAt);
        } catch (error) {
          log.error?.("waitlist notification failed (signup saved)", (error as Error)?.message ?? error);
        }
      }
      // Identical response for new and existing emails, so the endpoint can't be
      // used to check who has signed up.
      return json(200, { ok: true, status: "joined" });
    } catch (error) {
      if (error instanceof WaitlistError) {
        return json(error.status, { error: error.message, code: error.code, retryable: error.retryable, ...(error.field ? { field: error.field } : {}) }, error.headers);
      }
      log.error?.("waitlist failed", error);
      return json(500, { error: "Something went wrong. Try again later.", code: "WAITLIST_FAILED", retryable: true });
    }
  };
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new WaitlistError("REQUEST_TOO_LARGE", "Request is too large.", 413);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new WaitlistError("REQUEST_TOO_LARGE", "Request is too large.", 413);
      }
      chunks.push(value);
    }
  }
  const raw = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
  catch { throw new WaitlistError("INVALID_JSON", "Send valid UTF-8 JSON."); }
}

// --- Google Sheets (service account, no SDK) --------------------------------
// https://developers.google.com/identity/protocols/oauth2/service-account#httprest

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
// Per call. A cold signup makes three Sheets calls, so keep the total well
// inside the function limit (30 s on PoryGen/Studigo).
const TIMEOUT_MS = 4_000;

export class SheetsError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "SheetsError"; this.status = status; }
}

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Env values usually carry the PEM with literal "\n" sequences. */
export const normalizePrivateKey = (key: string | undefined) => String(key ?? "").replace(/\\n/g, "\n").trim();

async function importPrivateKey(pem: string) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), char => char.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export async function signServiceAccountJwt({ clientEmail, privateKey, now = Date.now() }: { clientEmail: string; privateKey: string; now?: number }) {
  const iat = Math.floor(now / 1000);
  const header = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(encoder.encode(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 })));
  const key = await importPrivateKey(normalizePrivateKey(privateKey));
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claims}`)));
  return `${header}.${claims}.${base64url(signature)}`;
}

// A1 range; quotes in a tab name are doubled. Without a tab, Sheets uses the first tab.
const range = (tab: string, cells: string) => encodeURIComponent(tab ? `'${tab.replace(/'/g, "''")}'!${cells}` : cells);

export interface SheetsStoreOptions {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  tab?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export function createSheetsStore({ clientEmail, privateKey, spreadsheetId, tab = "", fetch: fetchImpl = (...args) => fetch(...args), now = Date.now }: SheetsStoreOptions): WaitlistStore {
  let cached: { token: string; expiresAt: number } | null = null; // per warm instance

  async function call(url: string, init: RequestInit, what: string) {
    let response: Response;
    try { response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new SheetsError(`${what} request failed.`, 0); }
    if (!response.ok) {
      if (response.status === 401) cached = null;
      throw new SheetsError(`${what} returned ${response.status}.`, response.status);
    }
    return response.json() as Promise<unknown>;
  }

  async function accessToken() {
    if (cached && cached.expiresAt > now() + 60_000) return cached.token;
    const assertion = await signServiceAccountJwt({ clientEmail, privateKey, now: now() });
    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
    const json = (await call(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, "Google token")) as { access_token?: unknown; expires_in?: unknown };
    if (typeof json.access_token !== "string") throw new SheetsError("Google token response had no access_token.", 502);
    cached = { token: json.access_token, expiresAt: now() + (Number(json.expires_in) || 3600) * 1000 };
    return cached.token;
  }

  const authed = async (init: RequestInit): Promise<RequestInit> => ({ ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${await accessToken()}` } });
  const base = `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values`;

  return {
    // Column B holds the normalized email; row 1 is the header.
    async hasEmail(email) {
      const json = (await call(`${base}/${range(tab, "B2:B")}?majorDimension=COLUMNS`, await authed({ method: "GET" }), "Sheets read")) as { values?: unknown[][] };
      const column = json.values?.[0] ?? [];
      // Accepted emails never start with a formula character, so they are stored verbatim.
      return column.some(value => String(value).trim().toLowerCase() === email);
    },
    async appendRow(row) {
      // RAW stores every value as typed text, so nothing is evaluated as a formula.
      const url = `${base}/${range(tab, "A:E")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await call(url, await authed({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [row] }) }), "Sheets append");
    },
  };
}

// --- Email alert via FormSubmit ----------------------------------------------
// Same relay the Gray Matter site's contact form uses: https://formsubmit.co
// The first message to a new address/site triggers a one-time activation email.

/** Every product's signups alert this inbox unless WAITLIST_NOTIFY_EMAIL overrides it. */
export const DEFAULT_NOTIFY_EMAIL = "graymattertechllc@gmail.com";

export class NotifyError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "NotifyError"; this.status = status; }
}

export interface FormSubmitOptions {
  /** Inbox address, or the random alias FormSubmit gives after activation. */
  to: string;
  /** Product name for the subject line, e.g. "Spread". */
  product: string;
  /** Stable public URL of the product; FormSubmit identifies the form by it. */
  siteUrl: string;
  fetch?: typeof fetch;
}

export function createFormSubmitNotifier({ to, product, siteUrl, fetch: fetchImpl = (...args) => fetch(...args) }: FormSubmitOptions): WaitlistNotifier {
  const url = `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;
  return {
    async notify(entry, submittedAt) {
      const body = {
        _subject: `[${product}] New beta waitlist signup: ${entry.email}`,
        _template: "table",
        _captcha: "false",
        _replyto: entry.email,
        product,
        name: entry.name,
        email: entry.email,
        submitted_at: submittedAt,
        consent_version: WAITLIST_CONSENT_VERSION,
      };
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", referer: siteUrl, origin: new URL(siteUrl).origin },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new NotifyError("FormSubmit request failed.", 0);
      }
      const result = (await response.json().catch(() => ({}))) as { success?: unknown; message?: unknown };
      if (!response.ok || !(result.success === true || result.success === "true")) {
        // Includes the one-time "This form needs Activation" reply.
        throw new NotifyError(`FormSubmit did not confirm delivery (${response.status}): ${String(result.message ?? "no message")}`, response.status);
      }
    },
  };
}

// --- Wiring from environment variables --------------------------------------

/**
 * Reads GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, WAITLIST_SPREADSHEET_ID,
 * WAITLIST_SHEET_TAB, WAITLIST_ALLOWED_ORIGINS and WAITLIST_NOTIFY_EMAIL.
 */
export type WaitlistEnv = Record<string, string | undefined>;

export interface WaitlistProduct {
  /** Product name used in alert subjects, e.g. "Spread". */
  product: string;
  /** Stable production URL, e.g. "https://spread-app-teal.vercel.app/". */
  siteUrl: string;
  /** Browser origins allowed besides the app's own host. */
  allowedOrigins?: readonly string[];
}

/**
 * Builds the handler from server-side env vars. The sheet needs the three Google
 * vars (without them every POST answers 503); the optional server-side alert
 * goes to DEFAULT_NOTIFY_EMAIL unless WAITLIST_NOTIFY_EMAIL names another
 * address or is "off".
 */
export function waitlistHandlerFromEnv(env: WaitlistEnv, { product, siteUrl, allowedOrigins: extraOrigins = [] }: WaitlistProduct) {
  const store = env["GOOGLE_SERVICE_ACCOUNT_EMAIL"] && env["GOOGLE_PRIVATE_KEY"] && env["WAITLIST_SPREADSHEET_ID"]
    ? createSheetsStore({ clientEmail: env["GOOGLE_SERVICE_ACCOUNT_EMAIL"], privateKey: env["GOOGLE_PRIVATE_KEY"], spreadsheetId: env["WAITLIST_SPREADSHEET_ID"], tab: env["WAITLIST_SHEET_TAB"] ?? "" })
    : null;
  const notifyTo = (env["WAITLIST_NOTIFY_EMAIL"] ?? "").trim() || DEFAULT_NOTIFY_EMAIL;
  const notifier = notifyTo.toLowerCase() === "off" ? null : createFormSubmitNotifier({ to: notifyTo, product, siteUrl });
  const allowedOrigins = [...extraOrigins, ...String(env["WAITLIST_ALLOWED_ORIGINS"] ?? "").split(",").map(origin => origin.trim()).filter(Boolean)];
  return createWaitlistHandler({ store, notifier, allowedOrigins });
}
