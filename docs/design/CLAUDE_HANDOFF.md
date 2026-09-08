# APEX visual redesign — four phases

Work from `design/apex-brand-kit` or its merged successor. Read the repository instructions and ROADMAP.md. Build the redesign using the supplied assets and existing React components. Keep the working demos, account flow, routes, and required hero video. This is frontend design work; use the existing stack.

## Phase 1 — Establish the look

Review `docs/design/apex-brand-board.png` and BRAND_SPEC.md. Apply warm ivory, ink navy, cobalt blue, orange accents, and lilac. Use Fraunces for expressive headlines and Manrope for readable text, with licensed font files and sensible fallbacks.

Keep the existing APEX wordmark. Treat the board as visual inspiration; ignore its incidental text and trademark symbol. Use the original artwork and SVGs in `public/assets/brand-v1/`. Optimize images for the web. Establish the palette and typography in the existing tokens.

## Phase 2 — Build the visual homepage

Create a welcoming hero with a large headline beside the sculpture, stacked above it on phones.

Example: “They pay. Your product follows.”
Supporting sentence: “Keep subscriptions, credits, and customer access in sync—inside your app.”
Buttons: “Try the demo” and “Explore setup.”

Keep the film prominent and playable. Replace repetitive text cards with an open visual story: “Customer pays → Credits appear → Your app is ready.” Use the supplied graphics, generous space, and restrained motion.

Add “Your app. Your look.” showing the same billing interface styled for a creator tool, reporting app, and membership product. Label these fictional examples; do not build three applications.

## Phase 3 — Make the experience intuitive

Enlarge the existing Forma demo and prioritize buying, generating, upgrading, and remaining credits. Example: buying activates 1,000 credits; one generation uses 250 and leaves 750. Use actual demo state.

Move appearance settings and technical events into optional controls. Add a navy explanation section: “Stripe takes the payment. APEX connects it to access.” Put code under “For developers.” Carry the visual style into onboarding and the console, using straightforward labels and clear preview disclosures.

## Phase 4 — Polish and deliver

Fix mobile overflow, drawer layering, uneven Billing Sync padding, and reset wording. Check phone, tablet, and desktop layouts, keyboard access, contrast, reduced motion, video controls, and demo/reset behavior. Run existing tests and the build.

Deliver a PR with desktop/mobile screenshots and a short verification summary. Update the roadmap accurately. Use design judgment, keep reading light, and finish the implementation without introducing unnecessary infrastructure.
