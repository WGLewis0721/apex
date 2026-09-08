// Verified Stripe webhook handler. This is the ONLY place a subscription
// is ever marked active and a workspace provisioned from a paid plan --
// the browser is never trusted to report its own payment status.
//
// Pattern follows Supabase's official example:
// https://supabase.com/docs/guides/functions/examples/stripe-webhooks
// (Stripe.createSubtleCryptoProvider() + constructEventAsync, since Deno's
// Web Crypto API needs the async/subtle-crypto variant.)
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Deploy with verify_jwt = false (see supabase/config.toml): Stripe signs
// requests itself, so a Supabase-issued JWT is neither present nor needed.
Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !webhookSecret) return new Response('missing signature', { status: 400 });

  // Verification relies on the raw body, not parsed JSON.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error('stripe signature verification failed', err);
    return new Response(`signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Exact-redelivery idempotency: if we've already logged this event id,
  // there is nothing left to do.
  const { data: seen } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle();
  if (seen) return Response.json({ ok: true, duplicate: true });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const planId = session.metadata?.plan_id;
    const companyName = session.metadata?.company_name ?? '';

    if (!userId || !planId) {
      console.error('checkout.session.completed missing metadata', session.id);
      return Response.json({ ok: false, reason: 'missing_metadata' }, { status: 200 });
    }

    const { error } = await admin.rpc('provision_workspace', {
      p_user_id: userId,
      p_plan_id: planId,
      p_company_name: companyName,
      p_stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
      p_stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
      p_checkout_session_id: session.id,
    });

    if (error) {
      // 23505 = unique_violation. A retried/duplicate Stripe delivery
      // under a *different* event id racing the same checkout session is
      // treated as already handled, not a failure worth retrying.
      if (error.code !== '23505') {
        console.error('provision_workspace failed', error);
        // Do not log this event id as seen: let Stripe retry.
        return new Response('provisioning failed', { status: 500 });
      }
    }
  }

  // Record every event we successfully reached this point for, whether
  // or not its type required action, so redelivery is always a no-op.
  await admin.from('stripe_events').insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });

  return Response.json({ ok: true });
});
