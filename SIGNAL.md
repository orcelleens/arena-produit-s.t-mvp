# SIGNAL.md — Listing Preflight

Status: **Signal phase complete; validation test not yet run.** The app in this repo implements the concierge/fake-door test described below. Nothing here has been validated with real users yet.

## Hook (1 sentence, visceral)

Your bulk listing upload just failed on row 214 because one tag was 21 characters, and you'll only find out after you've re-uploaded it three times, so drop your CSV in first and see every problem row before Etsy does.

## Pattern Origin

This reproduces the **"glue-work chore inside a platform your buyers already live in, sold as a thin v1 where they already search"** mechanism seen across the verified StarterStory entries (Appendix A). Concretely:

- The user does a recurring, annoying data-moving or setup task by hand inside one platform (Notion, Airtable, Shopify, Stripe, Google Sheets).
- The first version is thin: a browser tool, a landing page plus manual service, or a Fiverr gig, not a full product.
- Distribution happens where those users already search: a marketplace listing, a subreddit, or a freelance marketplace.

Why this idea rather than the nearest winners: Sync2Sheets (Notion → Sheets, $9K MRR self-reported) and Data Fetcher (API → Airtable) already own the Notion and Airtable integration niches. Building a clone of either would make us a late, weaker copy, and this sandbox cannot reach their APIs anyway. We picked the same mechanism applied to a **different chore in a different platform**: pre-flight validation of bulk listing CSVs for Etsy sellers.

## ICP

- **Who:** Etsy sellers who create or update listings in bulk by CSV, usually handmade or print-on-demand shops with 25+ listings to upload or edit.
- **Narrower cut for first outreach:** sellers who have already hit a CSV upload error or who use a spreadsheet to write titles and tags.
- **Where they congregate (real, nameable):** r/EtsySellers and r/Etsy on Reddit. A 2018 r/EtsySellers thread titled "bulk upload help?" shows sellers asking for bulk-upload tooling (see Problem Evidence). Verify each subreddit's self-promotion rules before posting.
- **Size of the niche:** unknown. We have not sized it, and this is the first thing the test should estimate.

## Problem Evidence

Real signal only. Items are labelled by strength.

**Verified platform constraints (strong: these are what the checker enforces):**
- Etsy titles are limited to 140 characters, and tags to 13 per listing with 20 characters each, with spaces counted. Sources: [listing-forge.com/blog/etsy-character-limits](https://www.listing-forge.com/blog/etsy-character-limits) (dated 2026-03-03) and [shopfoundry.app/etsy-listing-limits](https://www.shopfoundry.app/etsy-listing-limits). Several independent vendor guides agree. **Confirm against Etsy's own help pages before launch; this app should not be trusted over Etsy's current rules.**

**Recurring CSV failure modes (medium: vendor guides, not seller interviews):**
- A guide to Etsy bulk upload lists the errors sellers hit: "Tag exceeds 20 characters", "Invalid price format" (a dollar sign in the price cell), "Photo URL not accessible", and "Duplicate SKU". It also advises testing in batches of 5, then 20, 50, and 100 because one bad column can break the entire upload. Source: [insightagent.app/guides/bulk-upload-edit-etsy-listings](https://www.insightagent.app/guides/bulk-upload-edit-etsy-listings) (dated 2026-02-11).
- Another guide says that "one wrong column breaks the entire upload" and that tags must be comma-separated within the cell. Source: [mydesigns.io/blog/how-to-bulk-upload-products-to-etsy](https://mydesigns.io/blog/how-to-bulk-upload-products-to-etsy/) (dated 2026-07-25).

**Seller demand signal (weak: one thread, 2018):**
- r/EtsySellers, "bulk upload help?" (2018): a seller waited 3–4 weeks for a CSV helper service to respond and asked for the best tool. Source: [reddit.com/r/EtsySellers/comments/8qkdjp/bulk_upload_help/](https://www.reddit.com/r/EtsySellers/comments/8qkdjp/bulk_upload_help/). This is old and a single data point.

**Competitor signal (what already exists):**
- Free title and tag generators already target this market: Listing Forge, Outfy, InsightAgent, and MyDesigns. They help *write* listings. None of the pages we found does a row-by-row validation of an uploaded file, though we have not exhaustively checked. This is the gap we are testing.

**Gaps we have not closed:**
- No founder or seller interview has confirmed that the CSV-error loop is painful enough to pay to remove. The Trigger row below is a partial match for this reason.
- The Etsy CSV column names are not verified. The app maps columns by header name and lets the user correct the mapping, so it does not depend on them.

## Monetization Hypothesis

**Tiers**
- **Free: 25 rows per check.** Why 25: the batching advice above (5 → 20) totals 25, so the free tier is "test one trial batch end-to-end, fix it, download it." Free checks and downloads are also what create the demand signal we need.
- **Pro: $9/month (hypothesis, not live).** Unlimited rows per file, saved column mappings, and priority support. Nothing is charged; the button records a waitlist email and says so.
- **Concierge (manual, beta): free for the first 10 listings**, then a price to be tested. We fix the file by hand and reply. This is the highest-value test because it shows whether sellers will hand over work, not just a checkbox.

**Price justification (honest):** we found no verified price for a comparable Etsy-specific validator. The StarterStory comparables we verified use freemium or flat subscriptions (Data Fetcher, Speedy Squirrel), but their prices in the text we read were not stated in a way we can cite for this category. $9/month is a starting hypothesis to test, not a benchmark.

**Path to $1k MRR (illustrative, to be replaced by measured numbers)**
- Direct: 112 Pro subscribers at $9 = ~$1,008 MRR.
- Via freemium conversion: Data Fetcher reports that about 10% of its free users convert to paid (self-reported on its StarterStory page). At that rate, ~1,120 active free users would yield ~112 subscribers.
- Via concierge: ~17 concierge customers at $60 each (hypothetical price) would produce ~$1,000 one-time, but concierge does not scale and is a validation tool, not the business.

## Validation Plan

**Build (already in this repo):** a browser-based checker (no upload of the CSV: it is read locally), a landing page with the Pro fake door and the concierge form, a JSON-lines collector for counts and emails, and a `npm run queue` report for manual fulfilment.

**Timeline: 7 days, about a weekend of founder time plus daily checks.**
- **Day 1:** deploy the live preview. Read the rules of r/EtsySellers and r/Etsy. Verify Etsy's current limits against its help pages and update `public/lib/preflight.js` if they changed.
- **Day 2–3:** post once in each subreddit, following its rules, as the builder ("I built a free checker that flags Etsy CSV errors before upload. Want to try it on a batch?"). Reply helpfully to any open "bulk upload" or "CSV error" thread, disclosing that you built the tool.
- **Day 4–6:** answer every reply within a few hours. Fix any bug a user reports. For concierge requests, fix the file by hand and reply within one business day (`npm run queue` lists them).
- **Day 7:** run `npm run queue` and compare against the GO/KILL criteria.

**The exact ask:** "I built a free checker that flags Etsy listing CSV problems (title length, tag count and length, price format, duplicate SKUs) before you upload. Drop in your first 25 rows and tell me if it catches something you missed. If you'd rather not check it yourself, email me the file and I'll fix it by hand, free for your first 10 listings."

**What we measure (all from the app, no personal data beyond emails the user chooses to give):**
- `check_run` events, with rows checked and rows with errors.
- `check_download` events.
- `upgrade_shown` events.
- Unique Pro waitlist emails.
- Concierge requests and their listing counts.
- Replies in the threads: unprompted feature requests, "I'd pay" statements, and questions about what it checks.

## Go/Kill Criteria

Thresholds are measured over the 7-day window. Both sets are required; a plan with only GO criteria is not a validation plan.

**GO (proceed to Architecture / build the real product), all of these:**
1. **≥ 40** `check_run` events (real file checks).
2. **≥ 25%** of those checks had at least one row with an error (`errorRows > 0`). This confirms the pain is real in the files people actually bring.
3. **≥ 10** `check_download` events. A cleaned-file download is the strongest free-tier signal.
4. **≥ 8** unique Pro waitlist emails (≥ 20% of checks), and at least **2** people in replies who say they would pay $9/month.
5. **≥ 5** concierge requests, at least 3 of them for files with **≥ 10 listings**.
6. **≥ 3** unprompted replies from strangers asking for a feature or a different platform.

**KILL (stop or pivot), if any of these hold at day 7:**
1. **< 15** `check_run` events **and** **< 3** concierge requests. Nobody is trying it.
2. **< 15%** of checks had an error. Most files are clean, so the value is weak. Kill, or narrow to a segment with known bulk-upload failures.
3. **0** unique Pro emails after **≥ 20** checks. Price and value are not connecting. Kill the Pro plan. The free tool may still be worth keeping as a lead source.
4. **≥ 2** pieces of feedback saying the same thing: Etsy already catches these errors, or the upload failures they hit are caused by something the checker can't see (categories, shipping profiles, images). Then pivot to the problem they describe, not this one.

**PIVOT (not a kill, try a narrower test):** if checks are high but downloads and concierge requests are low, the tool works but the cleaned file is not the thing sellers want. Test a concierge-only offer aimed at sellers with 50+ listings.

## Risks

- **Platform change.** Etsy can change its listing limits or its CSV format, or add native validation. The limits live in one file and the column mapping is user-correctable, but a native fix would remove the reason to pay. Watch Etsy's help pages and release notes.
- **Accuracy and liability.** A checker that says a file is "Ready" when Etsy rejects it harms users. Mitigation: the copy says Etsy's own rules have final say, the footer disclaims affiliation, and the app checks only rules that are written down. Do not expand claims beyond that.
- **Competition from free tools.** Title and tag generators are already free and widely linked. Our differentiator is validation of a real file. If sellers see the checker as "one more generator," the value proposition fails.
- **Market size.** Bulk CSV uploaders may be a small slice of Etsy sellers. The Signal phase did not size this. The test should estimate it through checks per post, not assume it.
- **Distribution risk.** Self-promotion rules in subreddits can get posts removed or the account banned. Post as a builder, disclose authorship, and help first.
- **Privacy.** Listing data is the seller's business information. The design keeps the CSV in the browser. Concierge requests ask for an email and a count, and the file is sent by email only when the user chooses to. Keep this true as the product grows.
- **Founder time.** Concierge fulfilment is manual and takes real hours. Cap concierge at about 10 requests per week during the test, and say so in the reply.
- **Seasonality.** Q4 holiday listing rushes may inflate early numbers. Read the 7-day result with that in mind.
- **Weak evidence on the trigger.** The strongest verified evidence is for the platform limits, not for seller pain. If the test shows the pain is real but small, the answer is a KILL or a narrow pivot, not a bigger build.

---

## Appendix A — Pattern extraction (verified StarterStory entries)

Sources were read directly from each StarterStory page on the dates the fetch tool returned them. Revenue figures are **self-reported by the founder** and are not verified. Where a field is not in the text we read, it is marked *unknown*.

| Business (source) | Trigger (founder's pain) | Niche specificity | Distribution channel | Build complexity at launch | Monetization | Time to first paying customer | Moat / lack of |
|---|---|---|---|---|---|---|---|
| **Sync2Sheets** — [story](https://www.starterstory.com/stories/sync2sheets-give-notion-the-superpowers-of-google-sheets). $9K/mo self-reported; 400+ paying customers; started May 2021 (listing). | Founder was building a Mercado Libre → Sheets sync; Notion's public API opened, so he reused the code. | Notion databases → Google Sheets. | Reddit (r/Notion) videos, Twitter, Facebook groups; F5Bot keyword monitoring; 72% of Google traffic branded. | MVP in ~2 weeks, Google Workspace Add-on. | Subscription. Removing the free plan went from ~15 to 40+ new paying customers/mo (self-reported). Churn ~7%, LTV ~$300. | *Unknown from the text read.* | Early on the Notion API and the add-on marketplace; founder notes SEO and marketing were neglected early. |
| **Data Fetcher** — [story](https://www.starterstory.com/stories/how-i-built-an-airtable-plugin-will-lets-users-visualize-and-manage-their-data-better-60k-year). Listing shows $23K/mo; story body reports $6,500 MRR at ~1 year. Started Aug 2020. | Founder's "find a growing platform, rebuild a proven tool for it" framework, applied to Airtable (copied the idea of API Connector for Sheets). | Airtable users importing API data: financial, crypto, marketing metrics, a vineyard CRM, Ravelry patterns. | Airtable Marketplace (70–80% of customers, self-reported); Product Hunt; content (~20%). | ~1 month to build, ~3 months marketplace review. Rudimentary v1 with a self-built billing layer still got paying customers. | Freemium with usage limits. ~10% of free users convert (self-reported). | Within the first two weeks after launch (self-reported). | Early in the marketplace with little competition (founder's words); expects more competition. |
| **PriceWell** — [story](https://www.starterstory.com/stories/pricewell). $5K/mo self-reported; 120 customers; ~2,000 sign-ups; started May 2021 (listing). | Founder's own billing integration on a previous project failed its deadline. He then asked how non-technical subscription businesses handle billing. | Non-technical subscription businesses: fitness groups, marketing agencies, social media vendors, private Discord and Telegram groups. | Landing page + IndieHackers, Hacker News, Twitter (50 emails); a deals marketplace (low-quality sign-ups); **Fiverr and Upwork gigs run manually**; later cold email, paid newsletters, programmatic SEO. | Landing page first (no code). Coded MVP took ~2 months of evenings and weekends. | Subscription; pricing tiers *unknown* from the text we read. | **Before the product was live:** a prospective customer paid to speed up delivery (*validation signal, self-reported*). | Weak. Founders say a "launch letdown" hurt them; they describe value as time and money saved. |
| **Speedy Squirrel** — [story](https://www.starterstory.com/stories/speedy-squirrel-meticulously-engineered-shopify-apps). ~$11K/mo self-reported. Start cost ~$200 incl. $99 Shopify developer fee. | Shopify merchants with inaccurate shipping rates. Found by giving a **free app in exchange for 30-minute conversations** with merchants. | Shopify merchants who need custom shipping rates. | Shopify App Store search (top 5 for "Shipping Calculator", 15+ installs/day, self-reported). | 3-day MVP (3–4 features). | Flat monthly subscription with feature tiers; free for the first 3 months to build reviews, then paid. | About 3 months (free period, then first revenue). | Founder claims a well-defined niche with few large competitors. |
| **Better Sheets** — [story](https://www.starterstory.com/stories/on-creating-and-monetising-google-sheets-tutorials). $8.33K/mo listing figure; 134 sales in May 2020 (self-reported). Started Apr 2020. | Founder's own recurring spreadsheet work for ad sales at a previous company. | Scrappy small businesses wanting to use Google Sheets creatively. | Twitter, YouTube, search-driven content. | **Carrd landing page + Gumroad + Loom**; launched on a Friday with 4 free and 4 paid videos. No code. | One-off paid video courses sold on Gumroad; price *not in the text read*. | Sale on the first Monday after launch (self-reported). | Content library: "15 videos each week" after launch. |

**Pattern Synthesis.** Across the five verified entries, one mechanism recurs in at least four, and I'd name it:

> **A recurring glue-work chore inside a platform my buyers already use** (Notion, Airtable, Shopify, Google Sheets, Stripe-based billing) **+ a thin first version (a manual service, a no-code page, or a browser tool) sold where those buyers already search (a marketplace, a subreddit, or a freelance marketplace) + pain the founder or a merchant had already felt** = a repeatable playbook.

Counts (verified entries, N = 5):
- Platform-ecosystem chore with marketplace or community distribution: **5 of 5.**
- Thin, manual, or no-code first version that sold before the software was complete: **4 of 5** (Sync2Sheets is the exception: a 2-week MVP with real code).
- Founder or merchant pain as the trigger: **4 of 5**, counting Better Sheets' recurring ad-sales spreadsheet work as a chore rather than an acute pain. Data Fetcher's trigger was a copied framework, not personal pain.
- Narrow named niche: **5 of 5.**

Data Fetcher adds a second, secondary mechanism: *copy a proven tool from a mature platform onto a new one.* We did not use it, because it leads straight into the same Notion/Airtable/Sheets ground the incumbents already hold.

## Appendix B — Idea justification against the pattern table

Gate (from the master prompt): at least 4 of 6 rows must match. Our pattern table has seven rows (Trigger, Niche, Distribution, Build complexity, Monetization, Time to first paying customer, Moat). We score all seven and apply the gate to the six that have a verifiable answer, excluding Time to first payment, which is the thing the test measures.

- **Trigger match: PARTIAL.** The chore is documented by vendor guides (failed uploads and re-uploads). No founder or seller has confirmed it as personal pain. This needs interviews in the test.
- **Niche specificity match: MATCH (moderate).** "Etsy sellers who bulk-upload by CSV" is narrower than "Etsy sellers." It is not as tight as "wedding photographers," and we have not sized it.
- **Distribution channel available: MATCH (weak evidence).** r/EtsySellers and r/Etsy exist and have had bulk-upload questions. The evidence is one 2018 thread plus current forum mentions in vendor content.
- **Build complexity at launch: MATCH.** A browser-based checker with no backend or auth. Shippable in days, like Better Sheets' and PriceWell's thin v1s.
- **Monetization mechanic: MATCH.** Usage-limited freemium (Data Fetcher's model), with a concierge option (PriceWell's manual model).
- **Time to first paying customer: UNKNOWN.** No evidence either way. The concierge test measures it.
- **Moat: NO.** Free title and tag generators already exist. Our differentiator (file-level validation) is real but small, and a platform could copy it.

**Result across all seven rows: 4 match (Niche, Distribution, Build, Monetization), 1 partial (Trigger), 1 unknown (Time to first payment), 1 no (Moat).** Excluding the unknown row, that is 4 of 6 scored rows, which meets the gate narrowly. Trigger is partial and Moat is weak. This idea should not be treated as a strong candidate. It is the best of the options we could verify without building a copy of an incumbent, and the GO/KILL criteria exist to end it quickly if the pain isn't there.

**Alternatives rejected:**
- *Notion → Sheets or API → Airtable sync:* already held by Sync2Sheets (~$9K/mo self-reported) and Data Fetcher ($23K/mo listing figure). Clones would be late.
- *Shopify merchant tools:* Speedy Squirrel is an example that works, but building a Shopify app needs Shopify API access, which this sandbox cannot reach.
- *Wedding photographers (from the master prompt's example):* no verified StarterStory entry in our sample matched it, so the pattern match would be made up.

---

Signal phase complete. If this hits GO criteria, the next phase is Architecture — hand this SIGNAL.md to a build agent along with the S-A-A-S skill to scaffold the concierge MVP and the real app behind it.
