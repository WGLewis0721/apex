import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRateLimiter, createSheetsStore, createWaitlistHandler, cell, normalizePrivateKey, signServiceAccountJwt,
  SHEET_HEADERS, toRow, validateSubmission, WAITLIST_CONSENT_VERSION, waitlistHandlerFromEnv, type WaitlistStore,
} from "./waitlist.ts";

const valid = { email: "  Ada@Example.COM ", name: "Ada", company: "Analytical", role: "Engineer", teamSize: "2-10", useCase: "Check the beta", source: "landing", consent: true };
const quiet = { error() {} };

function memoryStore() {
  const rows: string[][] = [];
  const store: WaitlistStore = { hasEmail: async email => rows.some(row => row[1] === email), appendRow: async row => { rows.push(row); } };
  return { rows, store };
}

type CallOptions = { method?: string; type?: string; headers?: Record<string, string>; raw?: string };
function call(handler: (request: Request) => Promise<Response>, body: unknown, { method = "POST", type = "application/json", headers = {}, raw }: CallOptions = {}) {
  return handler(new Request("https://app.example.com/api/waitlist", {
    method,
    headers: { "content-type": type, "x-forwarded-for": "203.0.113.7", ...headers },
    body: method === "POST" ? raw ?? JSON.stringify(body) : undefined,
  }));
}

function make(options: Partial<Parameters<typeof createWaitlistHandler>[0]> = {}) {
  const memory = memoryStore();
  const handler = createWaitlistHandler({ store: memory.store, now: () => new Date("2026-10-03T12:00:00Z"), log: quiet, ...options });
  return { ...memory, handler };
}

test("valid signup appends one normalized row in header order", async () => {
  const { rows, handler } = make();
  const res = await call(handler, valid);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "joined" });
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, SHEET_HEADERS.length);
  assert.deepEqual(rows[0], ["2026-10-03T12:00:00.000Z", "ada@example.com", "Ada", "Analytical", "Engineer", "2-10", "Check the beta", "landing", WAITLIST_CONSENT_VERSION, "waitlisted"]);
});

test("email plus consent is a complete signup", async () => {
  const { rows, handler } = make();
  assert.equal((await call(handler, { email: "solo@example.dev", consent: true })).status, 200);
  assert.deepEqual(rows[0].slice(1, 8), ["solo@example.dev", "", "", "", "", "", ""]);
});

test("duplicate email is stored once and the response does not reveal it", async () => {
  const { rows, handler } = make();
  const first = await call(handler, valid);
  const second = await call(handler, { ...valid, email: "ADA@example.com" });
  assert.equal(second.status, first.status);
  assert.deepEqual(await second.json(), await first.json());
  assert.equal(rows.length, 1);
});

test("validation errors name the field", async () => {
  const { rows, handler } = make();
  const cases: [unknown, string, string][] = [
    [{ consent: true }, "EMAIL_REQUIRED", "email"],
    [{ email: "not-an-email", consent: true }, "INVALID_EMAIL", "email"],
    [{ email: "a@b", consent: true }, "INVALID_EMAIL", "email"],
    [{ email: `${"a".repeat(250)}@x.io`, consent: true }, "INVALID_EMAIL", "email"],
    [{ email: "a@b.co" }, "CONSENT_REQUIRED", "consent"],
    [{ email: "a@b.co", consent: "yes" }, "CONSENT_REQUIRED", "consent"],
    [{ email: "a@b.co", consent: true, teamSize: "7" }, "INVALID_FIELD", "teamSize"],
    [{ email: "a@b.co", consent: true, name: 42 }, "INVALID_FIELD", "name"],
  ];
  for (const [body, code, field] of cases) {
    const res = await call(handler, body);
    const payload = await res.json();
    assert.equal(res.status, 400, code);
    assert.equal(payload.code, code);
    assert.equal(payload.field, field);
    assert.equal(payload.retryable, false);
  }
  assert.equal(rows.length, 0);
});

test("request shape boundaries", async () => {
  const { handler } = make();
  const get = await call(handler, undefined, { method: "GET" });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST, OPTIONS");
  assert.equal((await call(handler, valid, { type: "text/plain" })).status, 415);
  assert.equal((await (await call(handler, null, { raw: "{oops" })).json()).code, "INVALID_JSON");
  assert.equal((await (await call(handler, null, { raw: "[]" })).json()).code, "INVALID_REQUEST");
  assert.equal((await call(handler, { ...valid, useCase: "x".repeat(9000) })).status, 413);
});

test("free text is trimmed, single-lined, length-capped and formula-safe", () => {
  const entry = validateSubmission({ ...valid, name: '  =HYPERLINK("http://evil")  ', useCase: "line one\n\nline\ttwo", company: "x".repeat(500) });
  assert.equal(entry.useCase, "line one line two");
  assert.equal(entry.company.length, 120);
  assert.equal(toRow(entry, "t")[2], `'=HYPERLINK("http://evil")`);
  for (const prefix of ["=", "+", "-", "@"]) assert.equal(cell(`${prefix}1`), `'${prefix}1`);
  assert.equal(cell("plain"), "plain");
});

test("honeypot submissions look successful but store nothing", async () => {
  const { rows, handler } = make();
  const res = await call(handler, { ...valid, website: "http://spam.example" });
  assert.deepEqual(await res.json(), { ok: true, status: "joined" });
  assert.equal(rows.length, 0);
});

test("origins: same host and allowlist pass with CORS headers; others are refused", async () => {
  const { handler } = make({ allowedOrigins: ["https://owner.github.io"] });
  const evil = await call(handler, valid, { headers: { origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const same = await call(handler, valid, { headers: { origin: "https://app.example.com" } });
  assert.equal(same.status, 200);
  const listed = await call(handler, valid, { headers: { origin: "https://owner.github.io" } });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("access-control-allow-origin"), "https://owner.github.io");
  const preflight = await call(handler, undefined, { method: "OPTIONS", headers: { origin: "https://owner.github.io" } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /content-type/);
  assert.equal((await call(handler, undefined, { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
});

test("rate limit returns 429 with Retry-After per client IP", async () => {
  let t = 0;
  const { handler } = make({ rateLimit: createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t }) });
  assert.equal((await call(handler, valid)).status, 200);
  assert.equal((await call(handler, valid)).status, 200);
  const limited = await call(handler, valid);
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).retryable, true);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal((await call(handler, valid, { headers: { "x-forwarded-for": "198.51.100.1" } })).status, 200);
  t = 61_000;
  assert.equal((await call(handler, valid)).status, 200);
});

test("unconfigured storage is a retryable 503, storage failure a retryable 502", async () => {
  const off = await call(waitlistHandlerFromEnv({}), valid);
  assert.equal(off.status, 503);
  const offPayload = await off.json();
  assert.equal(offPayload.code, "WAITLIST_UNAVAILABLE");
  assert.equal(offPayload.retryable, true);
  const { handler } = make({ store: { hasEmail: async () => false, appendRow: async () => { throw new Error("boom"); } } });
  const failed = await call(handler, valid);
  assert.equal(failed.status, 502);
  const text = await failed.text();
  assert.match(text, /WAITLIST_STORAGE_FAILED/);
  assert.doesNotMatch(text, /boom/);
});

// --- Google Sheets client ---------------------------------------------------

// Generated lazily (no top-level await, so CJS-transpiling runners work too).
let keyPair: Promise<{ keys: CryptoKeyPair; pem: string }> | undefined;
const testKey = () => (keyPair ??= (async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keys.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { keys, pem };
})());
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

test("service-account JWT is RS256-signed with the Sheets scope", async () => {
  const { keys, pem } = await testKey();
  const jwt = await signServiceAccountJwt({ clientEmail: "bot@proj.iam.gserviceaccount.com", privateKey: pem.replace(/\n/g, "\\n"), now: 1_700_000_000_000 });
  const [header, claims, signature] = jwt.split(".");
  assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", keys.publicKey, fromBase64url(signature), new TextEncoder().encode(`${header}.${claims}`)));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromBase64url(claims))), {
    iss: "bot@proj.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: 1_700_000_000, exp: 1_700_003_600,
  });
  assert.equal(normalizePrivateKey(pem.replace(/\n/g, "\\n")), pem.trim());
});

function fakeGoogle({ emails = [] as string[], fail }: { emails?: string[]; fail?: { match: string; status: number } } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (fail && url.includes(fail.match)) return new Response("{}", { status: fail.status });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return ok({ access_token: `token-${calls.length}`, expires_in: 3600 });
    if (init.method === "GET") return ok(emails.length ? { values: [emails] } : {});
    return ok({ updates: { updatedRows: 1 } });
  }) as typeof fetch;
  return { calls, fetch: fetchImpl };
}

test("Sheets store reads emails, appends RAW rows and reuses its token", async () => {
  const { pem } = await testKey();
  const google = fakeGoogle({ emails: ["Taken@Example.com"] });
  const store = createSheetsStore({ clientEmail: "bot@x", privateKey: pem, spreadsheetId: "sheet123", tab: "Beta's list", fetch: google.fetch });
  assert.equal(await store.hasEmail("taken@example.com"), true);
  assert.equal(await store.hasEmail("new@example.com"), false);
  await store.appendRow(["a", "b"]);
  const tokenCalls = google.calls.filter(c => c.url.includes("oauth2"));
  assert.equal(tokenCalls.length, 1);
  assert.match(String(tokenCalls[0].init.body), /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
  const read = google.calls[1];
  assert.equal(read.url, `https://sheets.googleapis.com/v4/spreadsheets/sheet123/values/${encodeURIComponent("'Beta''s list'!B2:B")}?majorDimension=COLUMNS`);
  assert.equal((read.init.headers as Record<string, string>).authorization, "Bearer token-1");
  const append = google.calls.at(-1)!;
  assert.match(append.url, /:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS$/);
  assert.deepEqual(JSON.parse(String(append.init.body)), { values: [["a", "b"]] });
});

test("Sheets store without a tab name targets the first tab", async () => {
  const { pem } = await testKey();
  const google = fakeGoogle();
  const store = createSheetsStore({ clientEmail: "bot@x", privateKey: pem, spreadsheetId: "s", fetch: google.fetch });
  await store.hasEmail("a@b.co");
  await store.appendRow(["x"]);
  assert.match(google.calls[1].url, /\/values\/B2%3AB\?/);
  assert.match(google.calls[2].url, /\/values\/A%3AJ:append\?/);
});

test("Sheets store refreshes an expired token and surfaces HTTP failures", async () => {
  const { pem } = await testKey();
  let t = 0;
  const google = fakeGoogle();
  const store = createSheetsStore({ clientEmail: "bot@x", privateKey: pem, spreadsheetId: "s", fetch: google.fetch, now: () => t });
  await store.hasEmail("a@b.co");
  t = 3_600_000;
  await store.hasEmail("a@b.co");
  assert.equal(google.calls.filter(c => c.url.includes("oauth2")).length, 2);
  const broken = createSheetsStore({ clientEmail: "bot@x", privateKey: pem, spreadsheetId: "s", fetch: fakeGoogle({ fail: { match: ":append", status: 403 } }).fetch });
  await assert.rejects(broken.appendRow(["x"]), (error: { name: string; status: number }) => error.name === "SheetsError" && error.status === 403);
});

test("end to end: handler + Sheets store against a fake Google", async () => {
  const { pem } = await testKey();
  const google = fakeGoogle();
  const store = createSheetsStore({ clientEmail: "bot@x", privateKey: pem, spreadsheetId: "s", fetch: google.fetch });
  const handler = createWaitlistHandler({ store, now: () => new Date("2026-10-03T12:00:00Z"), log: quiet });
  assert.equal((await call(handler, valid)).status, 200);
  assert.equal(JSON.parse(String(google.calls.at(-1)!.init.body)).values[0][1], "ada@example.com");
});
