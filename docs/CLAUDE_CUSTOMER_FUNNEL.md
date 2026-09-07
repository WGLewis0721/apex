# Claude Code build brief — APEX signup → purchase → install funnel

## Mission

Update the existing APEX web experience so a customer can understand, purchase, and begin installing APEX with the same clarity and momentum as buying a World of Warcraft subscription: choose what you want, create the account, pay, install the client, verify it works, and enter the product.

Do **not** redesign APEX from scratch. Preserve the current visual language, plain-English product story, Forma demo, advanced sandbox, green/blue/rust brand system, GitHub Pages deployment, and existing working tests.

The target feeling is **premium self-service infrastructure with consumer-grade onboarding**.

## Core analogy to implement

World of Warcraft:

1. See the game.
2. Choose subscription / edition.
3. Sign into or create Battle.net account.
4. Pay.
5. Download launcher.
6. Install.
7. Sign in.
8. Play.

APEX equivalent:

1. Understand what APEX removes from the engineering backlog.
2. Choose APEX plan / founding-partner offer.
3. Create APEX account/workspace.
4. Purchase subscription.
5. Receive workspace + sandbox API key.
6. Connect payment provider.
7. Install `@apex/sdk` and optional components.
8. Run verification request.
9. See “APEX connected.”
10. Enter dashboard / go live.

The user should always know **where they are, what happens next, and what they get when they complete the step**.

## Current repository context

Work with the existing architecture rather than replacing it:

- `src/ProductSite.tsx` — public product/marketing experience and hash routing.
- `src/components/FormaPage.tsx` — separate sample SaaS app showing APEX in use.
- `src/App.tsx` — advanced sandbox / behind-the-scenes controls.
- `src/product.css`, `src/plain-language.css`, `src/forma.css` — current styling.
- GitHub Pages uses `/apex/` base path.
- Existing public routes include `#forma` and `#console`.

Add a new route such as `#start` for the commercial onboarding funnel. Do not break the existing hash routes.

## Homepage changes

The primary CTA should become **Start with APEX** or **Get APEX**. Keep “Try the demo” / “Open Forma” as secondary proof-oriented actions.

Add a short purchase-path preview using `public/assets/launch/apex-customer-funnel.svg`.

Near the CTA, use plain English:

> Choose your plan. Create your workspace. Connect Stripe. Install APEX. Go live.

Avoid fintech language in the first screen. Do not lead with “commercial control plane,” “entitlements,” “metering,” or “webhooks.” Those concepts can appear later and in developer sections.

## Onboarding funnel UX

Build a dedicated full-screen onboarding experience with a persistent progress rail. On desktop it can sit at the left; on mobile it becomes a compact step indicator.

### Step 1 — Choose APEX

Show one dominant early-access offer first so decision friction stays low.

Current launch placeholder:

**APEX Founding Partner**
- $2,000 guided implementation
- $299/month early-access infrastructure
- direct integration help
- sandbox + production workspace when available

Keep these values in a single config object so pricing can change without editing multiple components.

Optionally show a smaller “Developer sandbox — free” route for people who only want to test the product.

CTA: **Continue**.

### Step 2 — Create account

Collect only what is required for the UI demo:

- name
- work email
- company / product name

Show Google/GitHub SSO buttons only if they are real. Do not create dead OAuth buttons. Until authentication is implemented, clearly label the step as a product preview and persist the onboarding state locally.

CTA: **Create workspace**.

### Step 3 — Purchase

This should feel like a real SaaS checkout summary:

- selected APEX offer
- setup fee
- recurring price
- what is included
- total due today
- renewal amount

Until real APEX billing is wired, render a **Simulated checkout** state and do not collect card details. Architect the component so a real Stripe Checkout redirect/session can replace the simulation later.

Provide a single `billingProvider` interface or adapter boundary rather than hardcoding payment behavior throughout the UI.

Successful simulated purchase should create an onboarding state equivalent to:

`purchaseStatus = 'paid'`

and unlock installation steps.

### Step 4 — Workspace created

Celebrate completion briefly, then move immediately into setup.

Display:

- workspace name
- environment: Sandbox
- generated demo publishable/secret API key placeholders
- copy buttons

Never present fake keys as real credentials. Use obvious preview values such as `apex_test_...` and label them **demo key**.

CTA: **Connect my payment provider**.

### Step 5 — Connect payments

Show Stripe as the first provider because that is the launch path.

Explain in one sentence:

> Stripe moves the money. APEX uses those payment events to update what the customer gets inside your product.

If there is no real Stripe OAuth connection yet, provide an interactive preview of the connection state rather than claiming it is connected.

States:
- Not connected
- Connecting / preview
- Connected in demo

Structure this so a real Stripe Connect/OAuth implementation can replace the demo later.

CTA: **Continue to install**.

### Step 6 — Install APEX

This is the equivalent of downloading the WoW launcher. It should be the most satisfying technical step.

Ask the customer to choose stack:
- JavaScript / TypeScript first
- Python and others may display as “coming next” unless actually supported

Show:

```bash
npm install @apex/sdk
```

Then show a minimal server-side quickstart. Keep it under 10–15 lines.

Provide large copy buttons.

Then show optional embedded components separately:

```tsx
<ApexUsage />
<ApexBilling />
<ApexUpgrade />
```

Mark all SDK/component contracts that are not actually published as **API design preview**.

### Step 7 — Verify connection

Create a guided “Test APEX” moment.

Visually demonstrate:

1. sample customer = Pro
2. allowance = 1,000 credits
3. request arrives
4. APEX returns ALLOW
5. remaining credits update

Use the rusty-red accent for usage/credits/limits.

The final state should read:

**APEX is connected.**

Supporting copy:

> Your app can now ask APEX what a customer paid for, how much they have left, and whether an action should be allowed.

CTA: **Open APEX dashboard**.

## Post-purchase dashboard

When a new buyer enters the dashboard, do not drop them into a dense admin console.

Show a launch checklist first:

- ✓ APEX account created
- ✓ subscription active
- ✓ workspace created
- ○ payment provider connected
- ○ SDK installed
- ○ first customer identified
- ○ first usage event received
- ○ first access decision verified
- ○ production environment requested/enabled

Each incomplete item should deep-link to the relevant setup step.

Include a progress indicator such as **3 of 8 complete**.

Once setup is complete, the existing advanced dashboard can become primary.

## Use the new visual assets

Use these where they improve comprehension; do not dump all four on one page:

- `/assets/launch/apex-customer-funnel.svg` — near purchase / onboarding explanation
- `/assets/launch/apex-how-it-ships.svg` — install/developer explanation
- `/assets/launch/apex-payment-to-access.svg` — simple “why APEX” explanation
- `/assets/launch/apex-first-five-customers.svg` — founder/internal material; do not place on the customer-facing product unless there is an explicit founder/about section

## Interaction principles

1. One primary action per screen.
2. Use plain English before technical vocabulary.
3. Every technical term gets a short human translation nearby.
4. Show progress persistently.
5. Never make the user wonder whether something succeeded.
6. Never fake a production integration.
7. Keep demo/sandbox labels visible but unobtrusive.
8. Preserve brand customization and existing Forma demonstration.
9. Mobile must remain fully usable.
10. Keyboard navigation and visible focus states are required.

## State model

Prefer a small onboarding reducer/state machine rather than many unrelated booleans.

Suggested state:

```ts
type OnboardingStep =
  | 'plan'
  | 'account'
  | 'purchase'
  | 'workspace'
  | 'payments'
  | 'install'
  | 'verify'
  | 'complete';

interface OnboardingState {
  step: OnboardingStep;
  selectedPlan: string;
  accountCreated: boolean;
  purchaseStatus: 'unpaid' | 'paid';
  workspaceCreated: boolean;
  paymentProviderStatus: 'not_connected' | 'demo_connected' | 'connected';
  sdkInstalled: boolean;
  verificationPassed: boolean;
}
```

Persist demo state in localStorage with a versioned key and provide **Reset onboarding demo**.

## Testing / acceptance criteria

Before finishing:

- `npm test` passes.
- `npm run build` passes.
- Existing `#forma` and `#console` routes still work.
- Homepage CTA opens the new funnel.
- A fresh user can complete the entire simulated flow without dead ends.
- State survives refresh.
- Reset works.
- Purchase cannot silently claim a real charge occurred.
- Install/verify states cannot claim a real hosted SDK/API exists if they are still previews.
- Copy buttons work.
- Mobile layout works around 375px wide.
- Focus states and keyboard navigation are usable.
- No button exists without a working action or explicit disabled/coming-soon state.

## Finish condition

The experience should make a non-fintech founder say:

> “Oh — I buy APEX, connect my payment system, install it in my app, and then APEX handles the paid-access/credit/usage part for me.”

And it should make a developer immediately understand exactly what they would install next.

Do not stop at mockups. Implement the funnel in the existing React app, run the tests/build, inspect the full user path, and fix obvious UX regressions before considering the task complete.