# @apex/sdk

Thin, server-only TypeScript client for the hosted APEX balance, entitlements, and atomic credit-consumption API.

```ts
import { ApexClient } from "@apex/sdk";

const apex = new ApexClient({ apiKey: process.env.APEX_API_KEY! });
const before = await apex.balance(customerId);
const result = await apex.consume(customerId, 25, `document:${documentId}`);
```

Keep `apex_sk_*` credentials on your server. `consume` requires a stable idempotency key so retrying the same operation cannot spend twice. Reads and transient failures are retried twice by default; configure `timeoutMs` and `maxRetries` when constructing the client.
