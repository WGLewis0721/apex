# Waitlist API

the `apex-waitlist` Supabase Edge Function collects beta-tester/interest signups. Each new signup is appended as a row in the **APEX Beta Waitlist** Google Sheet and emailed as an alert to **graymattertechllc@gmail.com** through FormSubmit, the same relay the Gray Matter site's contact form uses. It stands apart from the product: it needs no account and changes no product data.

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
    email: 'ada@example.com',      // required
    consent: true,                 // required, must be literal true
    name: 'Ada Lovelace',          // optional
    company: 'Analytical Engines', // optional
    role: 'Engineer',              // optional, free text
    teamSize: '2-10',              // optional: "1" | "2-10" | "11-50" | "51-200" | "200+"
    useCase: 'What they want to use it for', // optional
    source: 'landing',             // optional: where the form lives, e.g. landing | pricing | utm_campaign
    website: '',                   // honeypot: render as a hidden input and leave empty
  }),
});
const result = await response.json();
```

| Field | Type | Rule |
|---|---|---|
| `email` | string | Required. Trimmed and lowercased. ≤254 chars. |
| `consent` | boolean | Required, must be `true`. Back it with an unticked checkbox, e.g. “Email me about the APEX beta. I can unsubscribe anytime.” |
| `name` | string | Optional, ≤100 chars. |
| `company` | string | Optional, ≤120 chars. |
| `role` | string | Optional, ≤80 chars. |
| `teamSize` | string | Optional, one of `1`, `2-10`, `11-50`, `51-200`, `200+`. |
| `useCase` | string | Optional, ≤1000 chars. Newlines collapse to spaces. |
| `source` | string | Optional, ≤100 chars. |
| `website` | string | Honeypot. Hide it from people (`position:absolute; left:-9999px`, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), not with `type="hidden"`. |

Longer optional text is truncated, not rejected. An email plus consent is a complete signup.

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
| 400 | `CONSENT_REQUIRED` | `consent` | no | `consent !== true`. |
| 400 | `INVALID_FIELD` | the field | no | Wrong type, or `teamSize` not in the list. |
| 400 | `INVALID_JSON` / `INVALID_REQUEST` | — | no | Body isn't a JSON object. |
| 403 | `ORIGIN_NOT_ALLOWED` | — | no | Browser `Origin` isn't this site or the allowlist. |
| 405 | `METHOD_NOT_ALLOWED` | — | no | Use POST. |
| 413 | `REQUEST_TOO_LARGE` | — | no | Body over 8 KB. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | — | no | Send `application/json`. |
| 429 | `RATE_LIMITED` | — | yes | Too many attempts from one IP; honour `Retry-After` (seconds). |
| 502 | `WAITLIST_STORAGE_FAILED` | — | yes | Saving failed: the Google Sheets call, or (with no sheet configured) the email alert. |
| 503 | `WAITLIST_UNAVAILABLE` | — | yes | Neither the sheet nor email alerts are configured (alerts turned off and no Google credentials). |
| 500 | `WAITLIST_FAILED` | — | yes | Unexpected error. |

Suggested UI: disable the button while the request is in flight; on `ok` show a thank-you state; on a `field` error mark that input; on `retryable` offer a retry.

### Origins and CORS

The APEX app origin is always allowed. Add others to `WAITLIST_ALLOWED_ORIGINS`. Allowed cross-origin callers get `Access-Control-Allow-Origin` and a 204 preflight; any other browser origin gets 403. Requests with no `Origin` (curl, server-side) are accepted, since they aren't browser CSRF.

## Spreadsheet

Rows go to the **first tab** of **APEX Beta Waitlist** (in the owner's Drive folder *Beta Waitlists*), or to the tab named by `WAITLIST_SHEET_TAB`. Row 1 is the header, columns A–J:

```
submitted_at | email | name | company | role | team_size | use_case | source | consent_version | status
```

- `submitted_at` is ISO-8601 UTC.
- `consent_version` is `WAITLIST_CONSENT_VERSION` in the waitlist module. Bump it when the consent wording changes.
- `status` starts as `waitlisted`. Change it by hand (`invited`, `active`, `unsubscribed`, …) as you send beta invites; the API never rewrites rows.
- Values are written with `valueInputOption=RAW`, and text starting with `= + - @` gets a leading `'`, so submitted text can't run as a formula in Sheets or in a CSV/Excel export.
- Duplicate check: column B is read before each append. Two simultaneous submits of the same new email can both land; rare and harmless.

## Email alerts

Every **new** signup (not repeats, honeypot hits or invalid submissions) sends one email to `graymattertechllc@gmail.com`:

- Subject: `[APEX] New beta waitlist signup: <email>`, with every field in a table.
- Reply-To is the person's address, so replying from Gmail reaches them directly.
- Sent server-side to `https://formsubmit.co/ajax/<address>`, identified by the stable site URL `https://wglewis0721.github.io/apex/` (`APEX_APP_URL` overrides it).
- With the sheet configured, the sheet is the record and a failed alert is only logged. Without the sheet, the email is the record and a failed alert returns 502.
- `WAITLIST_NOTIFY_EMAIL` overrides the address (or takes FormSubmit's random alias after activation); `off` disables alerts.

**One-time activation:** FormSubmit holds the first message for a new form and emails an **Activate Form** link to the inbox. Click it once for APEX; that first signup is still saved in the sheet, but its alert is not re-sent. After activating, FormSubmit offers a random alias you can put in `WAITLIST_NOTIFY_EMAIL` so the address isn't in requests.

## Setup

Email alerts need no setup beyond the activation click above. The sheet needs a Google service account; one serves all five products.

1. **Google Cloud project** → APIs & Services → enable **Google Sheets API**.
2. IAM & Admin → Service Accounts → **Create service account** (no roles) → Keys → **Add key → JSON**. Keep the file private; never commit it.
3. In Google Drive, **share the *Beta Waitlists* folder** with the service account's `client_email` as **Editor**. Every sheet inside inherits access, and the account can see nothing else in your Drive.
4. Set these server-side variables in **Supabase function secrets**: `supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL=... WAITLIST_SPREADSHEET_ID=...` and `supabase secrets set --env-file` for the private key, then `supabase functions deploy apex-waitlist`:

   | Variable | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
   | `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key, as-is with its `\n` sequences |
   | `WAITLIST_SPREADSHEET_ID` | the ID between `/d/` and `/edit` in the **APEX Beta Waitlist** URL |
   | `WAITLIST_SHEET_TAB` | optional; empty = first tab |
   | `WAITLIST_ALLOWED_ORIGINS` | optional, comma-separated extra browser origins |
   | `WAITLIST_NOTIFY_EMAIL` | optional; defaults to `graymattertechllc@gmail.com`; a FormSubmit alias; or `off` |

5. Check it:

```sh
curl -sS -X POST https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","consent":true,"source":"setup-check"}'
```

Expect `{"ok":true,"status":"joined"}`, a new row, and an alert email (or, the very first time, FormSubmit's activation email). `503 WAITLIST_UNAVAILABLE` means alerts are off and a Google variable is missing; `502` usually means the folder/sheet isn't shared with the service account, `WAITLIST_SHEET_TAB` names a missing tab, or the Sheets API isn't enabled (the server log shows Google's HTTP status, never the key).

## Abuse controls

- Origin check with an explicit allowlist (above).
- 8 KB body cap, JSON only, strict types, enum `teamSize`.
- Honeypot `website` field: filled → fake success, nothing stored.
- In-memory limit of 10 attempts per IP per 10 minutes, per warm instance — best-effort only. For a durable limit use Supabase's platform limits; the function's limit is per isolate.
- Error responses never include Google responses or credentials.

## Privacy

Waitlist contact details are **deliberately stored** in Google Sheets and sent by email through FormSubmit to the Gray Matter Gmail inbox (Google and FormSubmit are subprocessors). No IP address, user agent or product data goes into the row. Name the waitlist in the privacy policy, and honour removal requests by deleting the row.
