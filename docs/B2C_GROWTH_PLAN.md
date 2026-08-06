# Helmies Studio — B2C Growth Plan

**Written:** 2026-08-06. Grounded in the shipped codebase, not aspiration —
every "build" item names the files it touches and the primitives it reuses.

---

## 1. The positioning problem

The product is a 136-model creative studio. The landing page sells it as
"One models. / One studio." with a subhead listing vendors. That is a
supplier manifest, not a promise.

**The one differentiator that actually converts B2C is buried in four words
at the end of a paragraph: "One subscription, zero filters."**

Every competitor a consumer is choosing between (Midjourney, Runway, Kling's
own app, Sora) is either single-model, waitlisted, filtered hard, or priced
per-vendor. Helmies is the only one where €24 buys *all of them* through one
balance. That is the pitch.

### Recommended hero

> **Every AI model. One subscription.**
> Flux, Veo 3, Kling, Sora, Seedream, ElevenLabs — 136 models, one credit
> balance, no per-vendor subscriptions and no waitlists.
> `[Start free — 100 credits]`

Three reasons this beats the current hero: it names a number a consumer can
verify, it lists the models they already searched for, and the CTA states
the free grant instead of hiding it.

### Audience order (do not try to serve all three at once)

1. **Short-form creators** — TikTok/Reels/Shorts, want volume and speed.
   Largest, most viral, lowest willingness-to-pay per head. **Lead with this.**
2. **Short-drama producers** — the fastest-growing vertical video category
   globally (ReelShort/DramaBox economics). Small audience, very high intent,
   pays for Studio/Pro tiers. **The Short Drama Suite is built for them.**
3. **Small-business owners** — product shots, ads. Highest LTV, but they
   convert on outcome ("ad that sells"), not on model count. Later.

---

## 2. What is already built and under-exploited

| Asset | State | Growth use |
|---|---|---|
| 16 published workflow templates | Live, quoted, runnable | The entire content-marketing engine — see §4 |
| `/gallery` with `isPublic` on generations | Schema supports it | Public showcase + SEO surface |
| `PromoCode` (`type: "credits"`, `eligibility: "new"`) + `PromoRedemption` | Fully built, enforced by compound unique | **Referral loop with no new schema** |
| `PromoField` on `/pricing` | Live | Redemption surface already exists |
| Short Drama Suite (4 new templates) | Published today | The wedge for audience #2 |

The referral point is the important one: a working credits-grant system with
per-user redemption enforcement already exists. A referral programme is a
code generator and a landing route on top of it, not a new subsystem.

---

## 3. Conversion fixes (shipped in this pass)

These were bugs, not strategy:

- **Free tier was advertised as "10 credits/mo" on the landing page. It is
  100.** The highest-traffic page understated the entire free offer by 10×.
  Now imported from `SUBSCRIPTION_CREDITS` so it cannot drift again.
- Studio (1500→3000) and Pro (5000→10000) credits were also wrong.
- Invented feature gating ("HD resolution", "4K downloads", "API access" as
  tier differentiators) removed — `/pricing` and the FAQ both state every
  tier gets the whole catalog, and the landing page contradicted them.
- Hero "Start free" pointed at `/login` (sign-**in** mode) → now
  `/login?new=1`.
- Templates were unreachable from inside `/studio` → added to the rail, the
  mobile sheet, and the command palette.
- Template application into a studio was silent, including on failure → now
  toasts success and failure.
- 7 of 13 rows in the public price table linked to retired tool slugs.

---

## 4. The growth engine: templates as content

**This is the highest-leverage channel and it is nearly free, because the
templates are already built and each one is already a landing page.**

Every published template at `/templates/[slug]` is a page describing a
specific, searchable outcome. The strategy is to make each one rank and each
one shareable:

1. **One template = one short-form video.** Run the template, screen-record
   the run panel, post the output. The video *is* the ad and the proof.
   16 templates = 16 pieces of content before writing anything new.
2. **Title templates as search queries, not as product names.** "Short Drama
   Episode" is a product name. "How to make a TikTok short drama with AI" is
   the query. Add an SEO `<h2>` and description to each template page in that
   phrasing.
3. **Result-first template cards.** The `thumbnailUrl` field exists on every
   Template row and is `null` for all 16. Populate them with real outputs —
   a template grid with no images cannot sell.

### Priority: fill in template thumbnails

`Template.thumbnailUrl` is null on all 16 seeds (`src/lib/template-seeds.js`).
Run each template once on the house account, pick the best frame, set the
field. This is the single biggest visual improvement available to
`/templates` and costs only credits.

---

## 5. The viral loop (build this next)

**Referral, using the existing promo system — no schema migration.**

Mechanism:
- Each user gets a stable code (`HELM-<8 chars>` derived from user id).
- Backing row: `PromoCode { type: "credits", value: 100, eligibility: "new",
  maxUsesPerUser: 1 }`.
- Referred signup redeems it → +100 credits (doubling their starting grant
  to 200 — a real reason to use the link rather than signing up directly).
- Referrer is credited +100 when the referred account completes its first
  *paid* generation, not at signup — this is the anti-abuse gate. Without it
  the loop pays out for throwaway emails.

Why this works for this product specifically: credits are the currency the
user already wants, the cost of a referral payout is provider cost (cents),
and the redemption surface (`PromoField`) is already on `/pricing`.

**Second loop — attribution on shared outputs.** Generations already have
`isPublic`. A shared public generation page with a "Made with Helmies Studio
— make yours" footer turns every proud user into a distribution channel. The
short-drama and talking-avatar outputs are inherently shareable in a way a
product photo is not.

---

## 6. Onboarding: the biggest single conversion leak

A new user today lands on `/studio` → `OrchestratorStudio`, an empty agent
chat. Their first screen is a blank text box and 12 unfamiliar instrument
names, holding 100 credits whose value they cannot estimate.

**Fix: first-run routes to a template, not to the agent.**

Three steps, after registration:
1. "What do you want to make?" — Video / Image / Talking character.
2. Show 3 curated templates for that answer, with real thumbnails.
3. Run the chosen one **on the house** (the run is already credit-quoted;
   just grant a matching promo).

The user's first experience becomes a finished artifact instead of a blank
prompt. This converts the abstract 100-credit grant into a demonstrated
outcome, which is what makes the second session happen.

---

## 7. Pricing psychology

`/pricing` is strong and honest but sells in credits, which is an abstraction
consumers cannot price. Add an outcome line per tier:

| Tier | Current | Add |
|---|---|---|
| Free | 100 credits | "~50 images, or one video to try it" |
| Starter €24 | 1,000 credits | "~500 images or ~13 videos a month" |
| Studio €49 | 3,000 credits | "~40 videos or a short drama a week" |
| Pro €99 | 10,000 credits | "Daily production, or a small team" |

Derived from `CREDIT_COSTS` (image 2, video 10, i2v 12) so it stays honest.

The Short Drama Suite gives Studio a concrete anchor it currently lacks:
one full drama episode is roughly 4 steps ≈ 200+ credits, so "a drama a week"
is a genuine Studio-tier reason to upgrade from Starter.

---

## 8. Trust — the largest gap on the page

There is **no social proof anywhere**: no testimonials, no user count, no
"X videos generated", no ratings, no press. `LogoTicker` shows *model vendor*
logos, which a consumer reads as "these are the suppliers", not "these people
endorse it".

Cheapest credible substitutes, in order:
1. **A live counter.** `Generation` rows are already counted — "N renders
   made this week" is true, verifiable, and free to compute.
2. **The public gallery as proof.** Real outputs from real accounts beat any
   testimonial for a creative tool.
3. **Founder-led content.** For a Lahti agency selling to creators, the
   founder building in public is more credible than manufactured testimonials
   and costs nothing but time.

Do not fabricate testimonials. For this audience they are transparent and the
downside is permanent.

---

## 9. Ranked execution order

| # | Action | Effort | Why first |
|---|---|---|---|
| 1 | ✅ Fix landing credit numbers + CTA + template discoverability | Done | Was actively costing signups |
| 2 | Template thumbnails (run each once, set `thumbnailUrl`) | Low | `/templates` cannot sell without images |
| 3 | Rewrite hero to "Every AI model. One subscription." | Low | The pitch is currently unstated |
| 4 | Outcome lines on pricing tiers | Low | Credits are unpriceable to consumers |
| 5 | Live render counter on landing | Low | Only honest social proof available now |
| 6 | Referral loop on `PromoCode` | Medium | Reuses a built system; compounding |
| 7 | First-run template onboarding | Medium | Fixes the blank-chat cold start |
| 8 | Public share pages with attribution | Medium | Turns outputs into distribution |
| 9 | One short-form video per template | Ongoing | The actual acquisition channel |

---

## 10. What not to do

- **Do not build a mobile app yet.** The web studio is responsive and the
  audience is on the web; an app is a distribution fantasy at this stage.
- **Do not add more models.** 136 is already past the point where more helps.
  The constraint is that users cannot find the good ones — that is a curation
  and template problem, not a catalog problem.
- **Do not discount the subscription.** Discount *credits* via promo codes
  instead: it protects the price anchor and the marginal cost is provider
  cost, not margin on a recurring plan.
- **Do not chase B2B yet.** The B2B motion (agencies, teams, API) has better
  unit economics but needs seats, shared balances, and support — none of which
  exist. B2C first, and let the API demand pull it.
