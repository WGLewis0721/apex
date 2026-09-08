# APEX — build a warmer, more visual website

Work on `design/apex-brand-kit` or its merged successor. Read the repository instructions and ROADMAP.md. Use the supplied assets and existing React components to finish the redesign.

## The goal

Make APEX welcoming to someone who owns a software business but does not write code. Explain payments, credits, and access through pictures and a working example. Replace repetitive paragraphs and white text cards with a few memorable scenes.

This is a visual redesign of the existing product. Keep the working demo, account flow, routes, and required hero video. No new backend services, frameworks, or animation libraries are needed.

## The look

Use the brand board as inspiration: warm ivory, ink navy, cobalt blue, orange accents, and lilac. Try Fraunces for short headlines and Manrope for readable body text. BRAND_SPEC.md provides supporting guidance, not a checklist requiring every decorative detail. Keep the existing APEX wordmark; ignore incidental text and the trademark symbol in the generated board.

Use `public/assets/brand-v1/apex-access-sculpture.png` and the three SVG graphics. Compress the large PNG for web delivery. Keep actual headings, buttons, and numbers as HTML.

## What to build — concrete examples

**1. A welcoming hero.** On desktop, a large headline on the left and the sculpture on the right, without a surrounding card. On phones, stack the headline above the artwork.

Example copy:
- “For apps with paid plans”
- “They pay. Your product follows.”
- “Keep subscriptions, credits, and customer access in sync—inside your app.”
- Buttons: “Try the demo” and “Explore setup”

Keep the product film prominent and playable. Clearly label payments and installation as previews.

**2. A simple visual explanation.** Let the ticket, credits, and connection graphics tell a short story across an open colored background:
“Customer pays.” → “Credits appear.” → “Your app is ready.”
A small transition can connect these steps. Avoid another three-card feature grid.

**3. A demo people can actually use.** Enlarge the existing Forma demo. Put its purchase button and remaining credits first; tuck appearance settings and technical events behind optional controls.

Example: buying Starter activates 1,000 credits. Generating once uses 250, leaving 750. Reaching zero shows the limit; upgrading preserves usage. Drive these displays from the existing demo state.

**4. A ‘Your app. Your look.’ section.** Show the same billing interface in three fictional visual treatments: a colorful creator app, a restrained reporting app, and a warm membership app. Use lightweight previews or the existing theme controls; do not build three new products.

**5. A clear finish.** A navy section explains “Stripe takes the payment. APEX connects it to access.” Put code under “For developers.” Finish with the setup/demo buttons.

Carry the colors and readable type into onboarding and the console. Favor labels such as “Customer access” and “Try a failed payment.” Keep tables practical.

## Finish well

Use your design judgment on composition and spacing. Aim for noticeably less reading; no exact word-count report is needed. Preserve truthful simulation labels and existing behavior.

Fix phone overflow, the drawer hidden beneath the banner, uneven Billing Sync padding, and the reset label’s scope. Check phone, tablet, and desktop layouts, keyboard access, readable contrast, reduced motion, and the existing demo/reset flows. Run the existing tests and build.

Deliver a PR with desktop/mobile screenshots and a short verification summary. Update the roadmap to reflect what actually shipped. Complete the design, not another proposal.
