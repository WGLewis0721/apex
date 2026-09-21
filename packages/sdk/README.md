# @wlgewis-gmtc/apex-sdk

Published server-only TypeScript client for the hosted APEX balance, entitlements, atomic credit-consumption, support-timeline, and reconciliation API.

Install:

```bash
npm install @wlgewis-gmtc/apex-sdk
```

```ts
import { ApexClient } from "@wlgewis-gmtc/apex-sdk";

const apex = new ApexClient({ apiKey: process.env.APEX_API_KEY! });
const before = await apex.balance(customerId);
const result = await apex.consume(customerId, 25, `document:${documentId}`);
```

`timeline(customerId, limit)` and `reconciliation(customerId)` are read-only support/audit reads. Like `entitlements`, they never authorize a spend.

Keep `apex_sk_*` credentials on your server. `consume` requires a stable idempotency key so retrying the same operation cannot spend twice. Reads and transient failures are retried twice by default; configure `timeoutMs` and `maxRetries` when constructing the client.
