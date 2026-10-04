# APEX — Waitlist Promo Video Storyboard

Replaces the current 4s silent Higgsfield loop in the homepage waitlist section (`src/components/WaitlistSection.tsx`). Target: dev-infrastructure trust and precision — the same register as the companies APEX explicitly measures itself against.

## The one thing this video proves

**Stripe handles the money. APEX handles what it unlocks.** The emotional arc: a payment event happens → it's momentarily just a number in a ledger → APEX turns it into something a real product actually grants (credits, access, a feature). The reward is the exact instant a payment becomes usable product value — a balance ticking up and a lock turning into an unlock, nothing more theatrical than that.

Tone: infra-grade trust. Precise, slightly cold, confident — closer to a terminal/ledger than a consumer app. This is the one video in the set that should feel the *most* like enterprise dev tooling.

## Production note (read first)

Generative video cannot render legible ledgers, balances, API responses, or dashboard numbers accurately. **Split the work:**

- **Real screen capture** for the balance API response, the ledger entry, the consume/deny flow, and the operator console — these are APEX's actual proof points (per the README's own "hosted concurrency proof" — 750/750 against 1000, one ALLOW one DENY) and must be shown accurately, not dramatized into something false.
- **Higgsfield-generated b-roll** only for the abstract "payment event flowing into structured state" visual and the closing brand card background.
- Never show APEX doing something the README marks as not-yet-production (e.g., do not depict self-serve OAuth connection as effortless/instant if that acceptance is still pending) — the video must stay inside what's actually shipped, matching the project's own "honesty boundary."

## Reference videos

1. **Stripe brand/product films** — the direct north star, named in APEX's own README. Clean gradient mesh backgrounds, a single data object (a card, a number) moving with total precision, zero wasted motion. Borrow: the overall visual register wholesale — APEX should look like it belongs next to Stripe, not like a knockoff of it.
2. **Plaid brand videos** — abstract "data flowing between systems" visuals rendered as clean geometric motion rather than literal diagrams. Borrow: the abstract flow visual for "event → verified → persisted" in this video's Scene 2.
3. **Twilio product films** — infrastructure-as-invisible-plumbing messaging, confident and slightly technical, aimed at developers not consumers. Borrow: the tone — talk to the SaaS founder watching this, not an end consumer.
4. **Vercel brand films** — black background, one glowing UI element, extremely confident negative space, developer-grade typography. Borrow: the restrained dark palette and typographic confidence for the ledger/API shots.
5. **Clerk (auth infra) brand videos** — a newer dev-infra company selling "the boring but critical plumbing" with surprisingly premium visual polish. Borrow: proof that infra-plumbing products can look this good — APEX should aim for the same bar, since it's selling the same category of "invisible but essential" story.

## Spec sheet

- Length: 18–22s hero cut; seamless 4–6s loop cutdown for the homepage slot.
- Resolution: 1920×1080 min, H.264 mp4 + webp poster matching `public/assets/waitlist/apex-*` naming.
- No voiceover; captions/on-screen text only.
- Palette/type: pull from existing `src/components/waitlist.css` and site theme — dark, Stripe-adjacent gradient mesh is appropriate given the explicit brand reference in APEX's own README.
- Loop seam: end on the same dark gradient-mesh title composition the video opens toward.

## Storyboard

| # | Time | Visual | Motion / camera | On-screen text | Why |
|---|---|---|---|---|---|
| 1 | 0:00–0:03 | Higgsfield b-roll: a single glowing point of light (standing for one Stripe payment event) drifting in dark space against a soft gradient mesh | Slow, precise dolly, minimal camera movement | — | Cold open on the single unit of value this whole product is about — one payment |
| 2 | 0:03–0:07 | Higgsfield b-roll continues: that point of light travels along a clean geometric path and resolves into a small structured shape (standing for "verified event, persisted once") | Camera tracks the light's path; the path itself should look deliberate/engineered, not chaotic | small label: "Payment verified. Persisted once." | Visualizes the real architecture claim (dedup/idempotent persistence) without literal diagram clutter |
| 3 | 0:07–0:11 | Real screen capture: the actual ledger/timeline view — a credit grant entry appears, source-attributed, clean and legible | Camera holds on the real UI; entry animates in with the product's own real transition | — | This must be real and accurate — it's APEX's actual proof-of-work, not a mockup |
| 4 | 0:11–0:15 | Real screen capture: a balance number ticks up cleanly (e.g., 0 → 1000), following the structured grant from Scene 3 | Number-tick animation at a confident, controlled pace — not a slot-machine spin | — | The literal "payment becomes product value" moment stated as a number |
| 5 | 0:15–0:18 | Real screen capture: a consume action fires (API call or console action), balance ticks down by a specific amount, then a second consume attempt is shown correctly denied (the real 750/750-against-1000 proof, simplified) | Two quick, precise beats: ALLOW then DENY, each with a clean, minimal status chip | small labels: "750 allowed." / "Second request: denied." | This is APEX's actual hosted concurrency proof from the README — showing it, even simplified, is more credible than any generic security claim |
| 6 | 0:18–0:20 (**the reward**) | Real screen capture: cut to the product-side result — a feature/credit indicator in a hypothetical customer app flips from locked/greyed to unlocked/available, tied directly to the balance from Scene 4 | Clean lock-to-unlock state change, a single confident snap, subtle glow on the unlocked state | **"Payment → product value. Automatically."** | The reward is the thing APEX actually sells: the gap between "customer paid" and "customer can use it" disappearing in one clean beat |
| 7 | 0:20–0:22 | Settle on APEX wordmark over the dark gradient mesh from Scene 1 | Static hold | **"Stripe handles the money. APEX handles what it unlocks. Join the beta."** | Direct lift of the README's own tagline as the CTA; echoes Scene 1's gradient for the loop seam |

## Reward design note

Every other app in this set can afford a warm or celebratory reward beat. APEX cannot — its entire pitch is *correctness and precision under concurrency*, and the README is explicit that the wallet "does not double-spend." The reward in Scene 6 should feel like watching a well-engineered system do exactly what it promised, not like a slot machine paying out. If in doubt, make it quieter and more exact, never more exciting.

## Higgsfield production guidance

- Use **generate_video** for Scenes 1–2's light-point/gradient-mesh sequence — prompt for "a single glowing point of light drifting through dark space with a soft Stripe-style gradient mesh background, moving along a precise geometric path, deep navy and violet palette, no text, no logos, minimal and exact."
- Do not attempt to generate the ledger entries, balance numbers, API responses, or the lock/unlock product UI — these are the product's actual evidence and must be real captures to stay honest and legible.
- Avoid any preset that reads as "explosive" or "celebratory" (confetti, bursts, fireworks) — pull toward Vercel/Clerk-style restrained dark-UI presets if browsing Higgsfield's marketing-studio catalog.
