# Waitlist API

The `apex-waitlist` Supabase Edge Function collects beta-tester/interest signups (name and email). Each new signup is appended as a row in the **APEX Beta Waitlist** Google Sheet; the form then emails an alert to **graymattertechllc@gmail.com** through FormSubmit (see *Email alerts*). It stands apart from the product: it needs no account and changes no product data.

The request/response contract is identical across PoryGen, Studigo, APEX, FundMatch and Spread, so one frontend form pattern works for all five.

Implementation: `supabase/functions/apex-waitlist/index.ts` (entry), `supabase/functions/_shared/waitlist.ts` (validation, abuse controls, Google Sheets client — no SDK, WebCrypto only). Tests: `supabase/functions/_shared/waitlist_test.ts`, run by `npm test` (Node) or `deno test`.

The function does not import `_shared/core.ts`, so it never loads Stripe or the service-role client.

## Frontend contract

The APEX app is on GitHub Pages, so this is a cross-origin call to Supabase. The function answers CORS for the APEX app origin (`APEX_APP_URL`, default `https://wglewis0721.github.io`). `client.functions.invoke('apex-waitlist', { body })` from `src/lib/backend.ts` works too; no signed-in user is needed (`verify_jwt = false`).

```ts
const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apex-waitlist`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Ada Lovelace',     // optional, shown as a required field in the form
    email: 'ada@example.com', // required
    website: '',              // honeypot: render as a hidden input and leave empty
  }),
});
const result = await response.json();
```

| Field | Type | Rule |
|---|---|---|
| `name` | string | ≤100 chars; trimmed, single line. |
| `email` | string | Required. Trimmed and lowercased. ≤254 chars. |
| `website` | string | Honeypot. Hide it from people (`position:absolute; left:-9999px`, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), not with `type="hidden"`. |

**Only name and email are collected.** Any other field a form sends (`product`, `source`, `audience`, `consent`, …) is ignored and never stored, except that `consent: false` is refused. Submitting the form is the opt-in, so put a line under the button such as “We'll email you about the APEX beta. Unsubscribe anytime.”

### Responses

Success, including an email that is already on the list (deliberately identical, so the endpoint can't be used to look people up):

```json
200 { "ok": true, "status": "joined" }
```

Errors are `{ error, code, retryable, field? }`. `error` is safe to show the user; `field` names the input to highlight.

| Status | `code` | `field` | Retryable | Meaning |
|---|---|---|---|---|
| 400 | `EMAIL_REQUIRED` | `email` | no | No email. |
| 400 | `INVALID_EMAIL` | `email` | no | Not a plausible email address. |
| 400 | `CONSENT_REQUIRED` | `consent` | no | The form sent `consent: false`. |
| 400 | `INVALID_FIELD` | `name` | no | `name` isn't text. |
| 400 | `INVALID_JSON` / `INVALID_REQUEST` | — | no | Body isn't a JSON object. |
| 403 | `ORIGIN_NOT_ALLOWED` | — | no | Browser `Origin` isn't this site or the allowlist. |
| 405 | `METHOD_NOT_ALLOWED` | — | no | Use POST. |
| 413 | `REQUEST_TOO_LARGE` | — | no | Body over 8 KB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | — | no | Send `application/json`. |
| 429 | `RATE_LIMITED` | — | yes | Too many attempts from one IP; honour `Retry-After` (seconds). |
| 502 | `WAITLIST_STORAGE_FAILED` | — | yes | Saving to the Google Sheet failed. |
| 503 | `WAITLIST_UNAVAILABLE` | — | yes | The Google Sheet isn't configured on this deployment. Success is never reported without a saved row. |
| 500 | `WAITLIST_FAILED` | — | yes | Unexpected error. |

Suggested UI: disable the button while the request is in flight; on `ok` show a thank-you state; on a `field` error mark that input; on `retryable` offer a retry.

### Origins and CORS

The APEX app origin is always allowed. Add others to `WAITLIST_ALLOWED_ORIGINS`. Allowed cross-origin callers get `Access-Control-Allow-Origin` and a 204 preflight; any other browser origin gets 403. Requests with no `Origin` (curl, server-side) are accepted, since they aren't browser CSRF.

## Spreadsheet

Rows go to the **first tab** of **APEX Beta Waitlist** (in *Gray Matter LLC › 03 - Sales & Clients › Beta Waitlists*), or to the tab named by `WAITLIST_SHEET_TAB`. Row 1 is the header, columns A–E:

```
submitted_at | email | name | consent_version | status
```

- `submitted_at` is ISO-8601 UTC.
- `consent_version` is `WAITLIST_CONSENT_VERSION` in the waitlist module. Bump it when the wording under the form changes.
- `status` starts as `waitlisted`. Change it by hand (`invited`, `active`, `unsubscribed`, …) as you send beta invites; the API never rewrites rows.
- Values are written with `valueInputOption=RAW`, and text starting with `= + - @` gets a leading `'`, so submitted text can't run as a formula in Sheets or in a CSV/Excel export.
- Duplicate check: column B is read before each append (ignoring the formula-guard apostrophe), and same-email submissions take turns within a server instance, so double clicks store one row. Google Sheets has no unique constraint, so two server instances receiving the same new email at the same instant can still both append; rare and harmless.

## Email alerts

Each signup is also emailed to **graymattertechllc@gmail.com** through FormSubmit, the relay the Gray Matter site's contact form already uses. **The browser sends the alert, not the server:** FormSubmit's Cloudflare protection rejects requests from Vercel's servers (HTTP 403), while browser requests go through, exactly as on the Gray Matter site. After `/api/waitlist` answers `ok`, the form fires this and never waits on it:

```ts
if (result.ok) {
  fetch('https://formsubmit.co/ajax/graymattertechllc@gmail.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      _subject: `[APEX] New beta waitlist signup: ${email}`,
      _template: 'table',
      _captcha: 'false',
      _replyto: email, // replying from Gmail reaches the person
      product: 'APEX',
      name,
      email,
    }),
  }).catch(() => {}); // the signup is already saved; never block or fail the form on the alert
}
```

- The sheet is the record; the alert is a convenience. A blocked or failed alert loses nothing.
- **One-time activation:** FormSubmit holds the first message from a new site and emails an **Activate Form** link to the inbox. Click it once per site (`wglewis0721.github.io`, shared with the FundMatch and Spread Pages copies).
- The server-side alert in the waitlist module stays available but is switched off with `WAITLIST_NOTIFY_EMAIL=off` by default in `apex-waitlist/index.ts` (a `WAITLIST_NOTIFY_EMAIL` function secret overrides it).

## Setup

One Google service account (`waitlist@waitlist-graymattertechllc.iam.gserviceaccount.com`) serves all five products; it has Editor access to the *Beta Waitlists* folder only.

1. **Google Cloud project** → APIs & Services → enable **Google Sheets API**.
2. IAM & Admin → Service Accounts → **Create service account** (no roles) → Keys → **Add key → JSON**. Keep the file private; never commit it.
3. In Google Drive, **share the *Beta Waitlists* folder** with the service account's `client_email` as **Editor**. Every sheet inside inherits access, and the account can see nothing else in your Drive.
4. Set these server-side variables in **Supabase Vault** under the names `apex_waitlist_google_service_account_email`, `apex_waitlist_google_private_key` and `apex_waitlist_spreadsheet_id` (already stored; read through the service-role-only `public.apex_waitlist_config()` from migration `20261003170000_apex_waitlist_config.sql`). Edge function secrets with the names below override Vault if you ever set them:

   | Variable | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
   | `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key, as-is with its `\n` sequences |
   | `WAITLIST_SPREADSHEET_ID` | the ID between `/d/` and `/edit` in the **APEX Beta Waitlist** URL |
   | `WAITLIST_SHEET_TAB` | optional; empty = first tab |
   | `WAITLIST_ALLOWED_ORIGINS` | optional, comma-separated extra browser origins |
   | `WAITLIST_NOTIFY_EMAIL` | `off` (set) — the browser sends alerts; an address re-enables the server-side alert |

5. Check it:

```sh
curl -sS -X POST https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","consent":true,"source":"setup-check"}'
```

Expect `{"ok":true,"status":"joined"}` and a new row. `503 WAITLIST_UNAVAILABLE` means a Google variable is missing; `502` usually means the folder/sheet isn't shared with the service account, `WAITLIST_SHEET_TAB` names a missing tab, or the Sheets API isn't enabled (the server log shows Google's HTTP status, never the key).

## Abuse controls

- Origin check with an explicit allowlist (above).
- 8 KB body cap, JSON only, strict types; unknown fields are dropped.
- Honeypot `website` field: filled → fake success, nothing stored.
- In-memory limit of 10 attempts per IP per 10 minutes, per warm instance — best-effort only. For a durable limit use Supabase's platform limits; the function's limit is per isolate.
- Error responses never include Google responses or credentials.

## Privacy

Waitlist contact details are **deliberately stored** in Google Sheets and emailed from the visitor's browser through FormSubmit to the Gray Matter Gmail inbox (Google and FormSubmit are subprocessors). Only the name, email and signup time are stored; no IP address, user agent or other form fields. Name the waitlist in the privacy policy, and honour removal requests by deleting the row.
