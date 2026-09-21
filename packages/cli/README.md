# @wlgewis-gmtc/apex

CLI for the hosted APEX API.

```bash
npx @wlgewis-gmtc/apex init
```

`apex init` prepares an existing Node/TypeScript project to use APEX:

- installs the published [`@wlgewis-gmtc/apex-sdk`](../sdk) with your detected package manager (npm, pnpm, yarn, or bun)
- gets `APEX_SECRET_KEY` from your environment, from an existing env file, or via a masked prompt
- writes it into `.env.local` for Next.js and Vite projects, or `.env` for generic Node — without touching anything else already in that file, and consolidating any duplicate entries down to one
- makes sure that env file is listed in `.gitignore`
- generates `apex-example.mjs`, a small runnable example of `entitlements()`/`consume()` using the real SDK, if one doesn't already exist
- confirms the SDK actually resolves from your project
- verifies the credential against the real hosted APEX service via `GET /v1/whoami` — success only on an authenticated `200`; `401` means invalid/inactive; anything else (network, 5xx) is reported separately as unverified, not as invalid

It only ever touches your env file, `.gitignore`, `apex-example.mjs`, and your package manager's dependency list, and it's safe to run again — an already-configured project is left as-is and just re-verified.

`APEX_SECRET_KEY` is never printed, logged, or passed as a command-line argument. Never prefix it `NEXT_PUBLIC_` or `VITE_` — `ApexClient` is server-side only, and this CLI warns about that on Next.js/Vite projects.

## Advanced: pointing at a different APEX endpoint

Normal use never needs this. For development or testing against a different hosted environment:

```bash
npx @wlgewis-gmtc/apex init --base-url https://your-dev-endpoint
```
