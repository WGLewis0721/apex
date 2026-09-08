# APEX — art direction and implementation brief

You are the implementation partner. Deliver a finished visual redesign of the existing APEX experience, using this kit. Read AGENTS.md and the current ROADMAP.md first. Start from the design/apex-brand-kit branch (or its merged successor), bring in current main, and retain these assets during implementation. Preserve the canonical onboarding funnel and existing functional behavior. This is a frontend design task; do not build new billing, database, SDK, or hosting infrastructure.

## Outcome

APEX helps software businesses keep customer payments, usage credits, and product access together. The current website repeats this in many text cards. Make the value immediately understandable through a distinctive visual identity and a working product demonstration. Audience: nontechnical founders first, product/support teams second, developers through optional detail.

## Visual system

Use docs/design/BRAND_SPEC.md as the exact specification and apex-brand-board.png as mood reference. The board is AI-generated artwork: do not reproduce its incidental microcopy, trademark symbol, or experimental APEX lettering. Preserve the existing APEX name/wordmark pending a separate logo decision. The board's “They pay. They play.” is a type specimen, not approved homepage copy.

Use Fraunces for short marketing headlines and Manrope for body/navigation/UI, with sensible serif/sans fallbacks. Obtain official font files and retain their OFL licenses; self-host WOFF2 with font-display: swap. Limit weight downloads. Retain the existing readable console font if replacing it causes a regression. Merge the supplied token suggestions into src/tokens.css rather than stacking another override sheet.

## Six homepage scenes, in order

1. **Invitation.** Eyebrow: “FOR APPS WITH PAID PLANS”. Headline: “They pay. Your product follows.” Body: “Keep subscriptions, credits, and customer access in sync—inside your app.” Main CTA “Try the demo” goes to #playground. Secondary CTA “Explore setup” goes to #start. Nearby disclosure: “Product preview. Payments and installation are simulated.” Use apex-access-sculpture.png as dominant artwork, with copy in real HTML on a quiet contrasting area. Desktop: asymmetrical type/art composition. Mobile: copy above the complete artwork, no text overlay on objects. Use the existing functional film prominently in this hero area, with an obvious Watch the film control and retained pause, captions, full-screen dialog, and reduced-motion behavior. Artwork must complement, not replace, the required video.

2. **One visual story.** Headline “Paid. Ready. Still in sync.” Use the three supplied SVG motifs along one open narrative scene, not three bordered text cards. Copy: “A customer buys a plan.” / “Their credits become available.” / “Your app knows what they can use.” Pair with a short accurate state animation. Use existing demo values; do not introduce conflicting balances or invented backend behavior.

3. **Try it.** Headline “Watch one purchase change everything.” Reuse the existing Forma demo and reducer. Make Buy, Generate, Upgrade, remaining credits, and the current access state immediately visible. Start with the purchase action rather than the appearance settings. Move appearance and technical events into clearly labeled expandable areas. Retain every existing action and receipt/history behavior. Demonstration labels must be comfortably readable, never miniature screenshots masquerading as usable UI.

4. **Make it yours.** An open visual gallery of three branded treatments of the existing embedded interface: creator tool, reporting app, and membership product. Label all examples fictional. Tabs may change presentation only; keep the actual demonstration logic and state consistent. Show larger crops with generous colored space around them rather than more nested containers. Heading “Your app. Your look.” One sentence: “Plans, balances, and upgrades can feel like part of your product.”

5. **Understand the connection.** A navy section with the short statement “Stripe takes the payment. APEX connects it to access.” Show a legible, accurate Stripe → APEX → Your app graphic in HTML/SVG. Put SDK snippets, event identifiers, limitations, and implementation detail behind “For developers”. Keep design-preview labels. Do not imply support for payment providers that are not implemented or approved.

6. **Next step.** Headline “See how it fits your product.” Actions “Explore setup” and “Try the demo”. Keep the existing canonical funnel, FAQ access, footer links, and truthful production status. Remove redundant paragraphs across the old “how it works”, audiences, benefits, explanation, and final CTA sections while preserving their essential meaning here.

## Carry the design through

Restyle onboarding with the same colors/type, a clear progress indicator, one main action per step, and visible simulation labels. Preserve authentication behavior and its real-versus-preview distinction. In the console, use restrained brand accents and precise tables. Display “Customer access” for Entitlements and “Payments & access” for Billing Sync, keeping internal route IDs unchanged. Use “Try a successful payment” and “Try a failed payment” as primary simulator labels; put raw event names in secondary text. Rename the reset control “Reset console demo” and clearly state that homepage/onboarding data are separate. Preserve confirmation, cancellation, seed restoration, selected-state reset, and toast feedback.

## Fix known defects while implementing

Inspect and correct the .ap-house-card 300px minimum track plus padding overflow; use minmax(0, 1fr) or a shrink-safe minimum at narrow widths. Put the mobile drawer and scrim above the console banner, ensure its close control remains visible, and implement focus return/Escape correctly. Normalize Billing Sync paragraph and control insets. Remove later panel-title overrides that defeat tokens. Fix the underlying rules, not overflow:hidden bandages.

## Acceptance and delivery

No consecutive rows of text-only cards. Target at least 40% less always-visible explanatory homepage copy than the current baseline (exclude nav, demo data, disclosures, and optional developer content). Keep one dominant visual per section; no invented testimonials, adoption statistics, integrations, or live-production claims.

Verify at 320, 375, 390, 768, 1024, and 1440px and 200% zoom. Check keyboard navigation, visible focus, reduced motion, modal closing, and contrast (4.5:1 normal text; 3:1 large text). All primary touch controls at least 44px high. Run existing npm test and npm run build. Exercise purchase → usage limit → denied action → upgrade with preserved usage → top-up → failed renewal/recovery, and all three reset scopes separately. Confirm cancellation changes nothing. Check auth flow without real charges or exposing credentials.

Optimize production artwork into responsive WebP/AVIF versions, retaining the supplied original. Aim for a hero image under 350KB if quality permits, explicit image dimensions, lazy loading below-fold imagery, and poster-based video loading. Do not introduce a heavy 3D runtime for static artwork. Use existing React/CSS and approved dependencies.

Open a reviewable PR with desktop/mobile screenshots, exact before/after copy count, test results, accessibility checks, and remaining limitations. Update ROADMAP.md only for the completed design work; do not advance backend phases. Do not merge/deploy until the requested review process permits it. Finish the implementation rather than returning another design proposal.
