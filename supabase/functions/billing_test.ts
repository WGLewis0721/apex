import Stripe from "npm:stripe@22.4.0";
import { handler as webhook } from "./apex-stripe-webhook/index.ts";
import { handler as checkout } from "./apex-checkout/index.ts";
import { handler as workspace } from "./apex-workspace/index.ts";
import { MONTHLY, SETUP } from "./_shared/prices.ts";
function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
const stripe = new Stripe("sk_test_fixture");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_fixture");
Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
Deno.env.set("APEX_APP_URL", "https://wglewis0721.github.io/apex/");
Deno.env.set("SUPABASE_URL", "https://apex-test.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
Deno.env.set("APEX_CREDENTIAL_ENCRYPTION_KEY", btoa("a".repeat(32)));
async function signed(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: "evt_fixture",
    type,
    created: 100,
    livemode: false,
    data: { object },
  });
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: "whsec_fixture",
  });
  return new Request("https://apex-test.invalid/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature },
  });
}
Deno.test("unsigned webhooks and unauthenticated requests cannot activate or reveal", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    throw new Error("No network expected");
  };
  try {
    assert(
      (await webhook(
        new Request("https://apex-test.invalid", {
          method: "POST",
          body: "{}",
        }),
      )).status === 400,
      "signature required",
    );
    assert(
      (await checkout(
        new Request("https://apex-test.invalid", {
          method: "POST",
          body: "{}",
        }),
      )).status === 401,
      "checkout auth required",
    );
    assert(
      (await workspace(
        new Request("https://apex-test.invalid", {
          method: "POST",
          body: '{"reveal":true}',
        }),
      )).status === 401,
      "reveal auth required",
    );
    assert(calls === 0, "unauthenticated operation reached storage");
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("signed but unpaid checkout never reaches activation; paid checkout validates line items", async () => {
  const original = globalThis.fetch;
  let writes = 0;
  let paid = false;
  let correctPrice = true;
  let failDb = false;
  const session = {
    id: "cs_fixture",
    metadata: {
      apex_offer: "founding",
      apex_user_id: "user-fixture",
      apex_attempt_id: "attempt-fixture",
    },
    client_reference_id: "user-fixture",
    livemode: false,
    mode: "subscription",
    status: "complete",
    amount_total: 229900,
    currency: "usd",
    customer: "cus_fixture",
    invoice: "in_fixture",
    subscription: {
      id: "sub_fixture",
      status: "active",
      items: { data: [{ current_period_end: 1900000000 }] },
    },
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/v1/checkout/sessions/")) {
      return Response.json({
        ...session,
        payment_status: paid ? "paid" : "unpaid",
        line_items: {
          data: [
            {
              price: { id: correctPrice ? SETUP : "price_wrong" },
              quantity: 1,
            },
            { price: { id: MONTHLY }, quantity: 1 },
          ],
        },
      });
    }
    if (url.includes("/rpc/apex_activate_purchase")) {
      writes++;
      const body = JSON.parse(String(init?.body));
      assert(body.p_secret_hash.length === 64, "secret hash missing");
      assert(body.p_ciphertext.startsWith("v1."), "encryption missing");
      assert(
        !JSON.stringify(body).includes("apex_sk_test_"),
        "plaintext sent to database",
      );
      return failDb
        ? Response.json({ message: "failure" }, { status: 500 })
        : Response.json("workspace-fixture");
    }
    throw new Error(`Unexpected network request ${url}`);
  };
  try {
    assert(
      (await webhook(await signed("checkout.session.completed", session)))
        .status === 200,
      "unpaid delivery not acknowledged",
    );
    assert(writes === 0, "unpaid checkout activated");
    paid = true;
    correctPrice = false;
    assert(
      (await webhook(await signed("checkout.session.completed", session)))
        .status === 500,
      "wrong price accepted",
    );
    assert(writes === 0, "wrong price reached activation");
    correctPrice = true;
    failDb = true;
    assert(
      (await webhook(
        await signed("checkout.session.async_payment_succeeded", session),
      )).status === 500,
      "failed write not retried",
    );
    failDb = false;
    assert(
      (await webhook(await signed("checkout.session.completed", session)))
        .status === 200,
      "valid payment not processed",
    );
    assert(writes === 2, "unexpected activation calls");
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("a different authenticated account cannot reveal owner credentials", async () => {
  const original = globalThis.fetch;
  let secretRead = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Response.json({
        id: "other-user",
        email_confirmed_at: "2026-09-08",
        email: "other@example.invalid",
      });
    }
    if (url.includes("/apex_billing_accounts")) {
      return Response.json({
        workspace_id: "workspace-fixture",
        payment_status: "paid",
      });
    }
    if (url.includes("/workspace_members")) {
      return new Response("null", {
        headers: { "Content-Type": "application/json" },
      });
    }
    secretRead = true;
    throw new Error("Must not read credentials");
  };
  try {
    const result = await workspace(
      new Request("https://apex-test.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer fixture" },
        body: '{"reveal":true}',
      }),
    );
    assert(result.status === 403, "non-owner reveal permitted");
    assert(!secretRead, "credentials accessed before owner check");
  } finally {
    globalThis.fetch = original;
  }
});
