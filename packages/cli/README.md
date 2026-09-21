# @wlgewis-gmtc/apex

CLI for the hosted APEX API.

```bash
npx @wlgewis-gmtc/apex init
```

`apex init` prepares an existing Node/TypeScript project to use APEX:

- installs the published [`@wlgewis-gmtc/apex-sdk`](../sdk) with your detected package manager (npm, pnpm, yarn, or bun)
- gets `APEX_SECRET_KEY` from your environment, from an existing `.env`, or via a masked prompt
- writes it into `.env` without touching anything else already in that file
- makes sure `.env` is listed in `.gitignore`
- confirms the SDK actually resolves from your project
- verifies the credential against the real hosted APEX service

It only ever touches `.env`, `.gitignore`, and your package manager's dependency list, and it's safe to run again — an already-configured project is left as-is and just re-verified.

`APEX_SECRET_KEY` is never printed, logged, or passed as a command-line argument. Keep it out of client/browser bundles; this CLI only ever writes it to a server-side env file.
