# APEX / Good things, in sync

Read `../../ROADMAP.md` and `../PRODUCT_CONTRACT.md` for production scope/status. This file governs visual and messaging direction only.

## Position and voice

APEX is the payment-and-access layer for SaaS products that already use Stripe.

**Stripe moves the money. APEX knows what the money unlocks.**

The audience sells software subscriptions, paid features, credits, tokens, coins, usage allowance, or add-ons. APEX connects what an end customer buys to what that customer can actually use.

Voice: welcoming, capable, expressive, precise. Use common verbs and short sentences. Emotional territory: relief, momentum, confidence. Show the customer outcome before the mechanism.

Preferred explanation order:

1. customer pays / wants more
2. product value appears or stays correct
3. Stripe + APEX split of responsibility
4. credits/usage/access detail
5. developer mechanics

Avoid leading with “commercial control plane,” “entitlement engine,” “metering infrastructure,” or other internal architecture terms. Never position APEX as a Stripe replacement, cryptocurrency system, or financial wallet.

## Exact palette
| Role | Color | Use |
|---|---|---|
| Canvas | #F7F2E8 | Warm primary background |
| Ink | #16243A | Text, dark section, key outlines |
| Cobalt | #315BFF | Main action and recurring ribbon |
| Tangerine | #F27649 | Decorative credits and highlights |
| Lilac | #C8BCF6 | Supporting illustration and quiet panels |

Use ink on orange/lilac. Do not assume white on orange passes contrast. Test every actual text/background combination. Meaning must never depend on color alone.

## Typography
- Display: Fraunces, 500–600; expressive serif; short headlines only.
- Interface/body: Manrope, 400–700; familiar, open, readable.
- Desktop hero 64–88px; phone hero 40–48px; balanced wrapping with no forced desktop line breaks on phones.
- Section headings 32–52px; body 16–18px, line-height 1.55–1.7; labels 14px; secondary metadata never below 12px.
- Paragraphs generally 45–65 characters wide. Prefer one sentence under a heading. Use 4/8px spacing rhythm with responsive section spacing.
- Font sources: https://fonts.google.com/specimen/Fraunces and https://fonts.google.com/specimen/Manrope . Fonts are not bundled; acquire official files and licenses before implementation.

## Graphics and composition

Recurring motifs: a cobalt ribbon (connection), orange discs (product credits/usage units, not money or cryptocurrency), and a checked ticket (access). The arch is decorative, not a literal infrastructure component.

The visual story should reinforce:

```text
Customer pays → Product value appears → Customer uses it → APEX keeps access correct
```

When showing a purchase-more moment, use examples such as credits/tokens/gold only as configurable product units. Make Stripe's role and APEX's role clear when technical explanation is present.

Mix tactile art with exact interactive product UI; neither substitutes for the other. Never use the brand-board image as the homepage.

Composition rhythm: open editorial hero → visual sequence → usable demo → branded examples → dark technical explanation → simple invitation. Use asymmetry, overlapping decorative art, large visual crops, and deliberate color-field transitions. Cards belong to real UI and grouped data; paragraphs do not each need a border.

## Motion

Use 160–240ms feedback and 400–700ms illustrative transitions. Animate one cause/effect at a time: payment activates a grant; generation consumes credits; upgrade expands allowance; refund/reversal changes balance/access. Do not continuously spin coins or float every element. Respect reduced motion, preserve static explanations, and provide pause for prolonged autoplay.

Demo numeric states may come from demo state. Production-status messaging must never imply those animations prove the production ledger/API exists.

## Product-state language

Use these labels consistently:

- **Demo / simulated** — local reducer/localStorage/product model only.
- **Implemented but not accepted** — code exists, but required external/end-to-end acceptance has not passed.
- **Production-accepted** — roadmap acceptance condition has passed.

Do not visually blur those states.

## Research lineage
- Mailchimp's friendly serif: https://commercialtype.com/news/means_for_mailchimp
- Dropbox cohesive visual language: https://brand.dropbox.com/iconography
- Purposeful motion: https://brand.dropbox.com/motion
- Product examples: https://pitch.com/
- Conversational framing: https://www.typeform.com/
- Needs-first entry points: https://www.headspace.com/
- Typography composition: https://www.awwwards.com/awwwards/collections/typography-in-web-design/
- Optional depth: https://www.nngroup.com/articles/progressive-disclosure/

These are inspiration references, not licensed third-party artwork included in this kit.

## Review boundary

This kit defines visual/message direction. It does not override `ROADMAP.md`, prove production backend functionality, or authorize claims that planned API/SDK/credits/refunds/customer-balance infrastructure is live. The brand board includes generated incidental text and an experimental wordmark; this document, `CLAUDE_HANDOFF.md`, `../PRODUCT_CONTRACT.md`, and the roadmap define approved implementation meaning.
