// Creates a real Stripe Checkout Session for purchasing APEX itself (not
// to be confused with a future customer-facing "connect your own Stripe"
// feature, which is a separate, unbuilt integration).
//
// Free plans (setup fee + monthly price both $0) skip Stripe entirely and
// provision the workspace immediately, since there is nothing to charge.
//
// Docs consulted: https://supabase.com/docs/guides/functions/examples/stripe-webhooks
// and https://docs.stripe.com/api/checkout/sessions/create
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Body = { planId: string; companyName: string; origin: string; basePath?: string };

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    // Scoped to the caller's own JWT: only reads what RLS already allows,
    // and .auth.getUser() below tells us who is actually asking.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
    const user = userData.user;

    const body: Body = await req.json();
    if (!body.planId || !body.origin) return json({ error: 'planId and origin are required' }, 400);
    const basePath = body.basePath ?? '/';

    const { data: plan, error: planError } = await userClient
      .from('plans')
      .select('*')
      .eq('id', body.planId)
      .eq('is_active', true)
      .maybeSingle();
    if (planError || !plan) return json({ error: 'unknown_plan' }, 404);

    // Service-role client: bypasses RLS, holds EXECUTE on provision_workspace().
    // Used only after the request has already been authenticated above.
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const isFree = plan.setup_fee_cents === 0 && plan.monthly_price_cents === 0;
    if (isFree) {
      const { data, error } = await adminClient.rpc('provision_workspace', {
        p_user_id: user.id,
        p_plan_id: plan.id,
        p_company_name: body.companyName ?? '',
      });
      if (error) return json({ error: 'provisioning_failed', message: error.message }, 500);
      const row = data?.[0];
      return json({ mode: 'provisioned', workspaceId: row?.workspace_id });
    }

    if (!plan.stripe_price_id_recurring) {
      return json({
        error: 'stripe_not_configured',
        message: `No Stripe price is configured for the "${plan.id}" plan yet. Run scripts/stripe-setup.mjs and set stripe_price_id_recurring on the plans row.`,
      }, 503);
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: plan.stripe_price_id_recurring, quantity: 1 },
    ];
    if (plan.stripe_price_id_setup) {
      lineItems.push({ price: plan.stripe_price_id_setup, quantity: 1 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        company_name: body.companyName ?? '',
      },
      success_url: `${body.origin}${basePath}#start?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${body.origin}${basePath}#start?checkout=cancel`,
    });

    return json({ mode: 'checkout', url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    return json({ error: 'internal_error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
