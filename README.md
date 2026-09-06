# APEX — Embedded payments & usage infrastructure

**Live app: https://wglewis0721.github.io/apex/**

Payments, subscriptions, credits, and token tracking. One service, built into your app.

APEX's product direction is a configurable service that connects a payment provider to product plans, customer access, and usage, with components developers can style to match their SaaS. The provider processes money; APEX tracks payment state and connects it to the product experience.

## Version 0.3 experience

- A new product homepage with restrained typography, generous spacing, and an actual 36-second hero video.
- A silent MP4 walkthrough with pause/play, chapter seeking, a large viewing dialog, native playback controls, captions, a poster, and reduced-motion handling.
- An interactive embedded billing demo for the fictional Forma application.
- Editable app name, four accent themes, light/dark appearance, rounded/sharp corners, and copyable theme configuration.
- Subscribe, generate content in 250-token increments, reach a hard usage limit, upgrade while preserving consumption, and buy token top-ups.
- Payment receipts and an activity feed backed by the same session state as the customer preview.
- Simulated renewal failure/grace and payment recovery.
- Illustrative frontend and backend integration code, explicitly marked as an API design preview.
- The existing advanced customer/plan/usage/billing sandbox remains accessible at `#console`; assurance and agent workflows are no longer the main product navigation.

## Try it

1. Watch the film in the homepage hero, or select a chapter.
2. Scroll to **Make it yours** and change Forma's name, color, or appearance.
3. Choose **Subscribe**. A $29 **simulated** payment activates 1,000 tokens.
4. Generate four times. Try again at the limit; the balance stays unchanged.
5. Upgrade to Pro. The allowance becomes 5,000, with previously consumed tokens preserved.
6. Open **Billing** for receipts and **Activity** for corresponding events.
7. Try a token top-up, failed renewal, recovery, and reset.

All payments, accounts, generated content, integrations, and film scenes are simulated. No payment details or credentials are collected. The homepage playground stores only in-session state. The retained advanced sandbox uses browser localStorage.

## Implementation boundary

This deployment is a **functional product preview**, not a hosted payment or metering backend. There is no production Stripe connection, published npm SDK, real AI execution, real charge, or server-side enforcement. Production payment connections and SDKs remain to be built. Illustrative prices are for the fictional customer application, not an APEX service price list. The upgrade demo uses the $50 plan-price difference and intentionally omits production proration calculations.

## Development and verification

```bash
npm ci
npm run dev
npm test
npm run build
```

Vite serves the existing `/apex/` base path. The GitHub Pages workflow tests and builds on pushes to `main` before deploying `dist/`.

Domain tests cover the full subscription → consumption → denial → upgrade lifecycle, repeated subscription/upgrade protection, credit purchases, renewal grace and recovery, receipt retention, and earlier sandbox policy/reservation behavior. These tests validate a serial local model, not production distributed concurrency.

## Product film

- `public/assets/apex-product-film.mp4` — 36 seconds, 1440 × 810, H.264, 24 fps, silent, optimized for progressive playback.
- `public/assets/apex-film-poster.jpg` — a frame from the walkthrough.
- `public/assets/apex-film.vtt` — English explanatory captions.
- `scripts/render_product_film.py` — reproducible UI animation renderer; requires Python Pillow, DejaVu Sans fonts, and ffmpeg.

The film is an authored motion walkthrough with exact UI text and fictional state transitions, not a recording of a live payment integration. No third-party footage, music, or Apple assets are used. The visual direction takes inspiration from restrained product launches without copying Apple branding.

The older `public/assets/control-prism.webp` remains available for legacy sandbox components. It was generated through Higgsfield for the previous version (job `e8024cb1-3972-4908-a0d8-3c77822c3631`, returned model `nano_banana_2`).
