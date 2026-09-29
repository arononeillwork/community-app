# Community App for Apartment Complexes — Plan

## Context
Residents of apartment complexes (many of them older) struggle to: reach unit owners, get complaints tracked, find everyday info (bins, rules, contacts), learn local knowledge, access community documents in their own language, and understand what the community spends on suppliers. Admins lack one place for suppliers/contracts/invoices and meeting records.

Goal: a **simple, large, accessible PWA** backed by **Supabase**, with an **AI assistant** (voice, chat, WhatsApp) that answers from the community's own data and can take a few safe actions. Multi-complex from day one, with a **white-label landing page and login per community** (first sample community: **Oceana Gardens**). Repo `business-agent` is empty — greenfield.

Decisions so far: Web app/PWA · roles = tenant, owner (landlord), admin, **treasurer** (finance role) (+ super-admin) · multi-community · landlords use the app and can add their own tenants · meetings are announced/tracked only (the site does not host them) · AI via mic button, typed chat, WhatsApp · AI can answer, log complaints, look up contacts, run admin queries · languages EN/ES/DE/NL/Scandinavian/FR · **Finance is a core pillar** (community supplier costs, contracts, invoices, budgets, reporting **and owner fee tracking**; no online payments for now) · **Clean UI with clear, filterable, sortable tables**.

---

## 0. Multi-community and white-label

Each complex gets its **own branded front door**. The platform runs once, and each community looks like its own app.

### How a community is reached
- **Path first:** `app.example.com/oceana-gardens`. This is simple, works immediately, and needs no DNS.
- **Subdomain:** `oceana-gardens.example.com`, via a wildcard domain on Vercel.
- **Custom domain (later):** e.g. `community.oceanagardens.es`, added in Vercel and mapped in `communities.custom_domain`.
- A Next.js middleware resolves host/path → `community_id` and loads that community's branding before rendering. Unknown slug → a friendly "Community not found" page.

### Community landing page (public, before login)
Content comes from the community's settings, so it needs no code changes:
- Logo, community name, hero photo, short welcome text
- Address with a small map, and office/concierge hours
- **Emergency and key numbers** (always visible, even logged out)
- Latest public notices (optional, e.g. "Pool closed Monday")
- Large language picker and text-size buttons right on the landing page
- A big **"Sign in"** button → login screen in the same branding

### Branded login
- Same Supabase Auth underneath (email magic link / phone code), shown inside the community's look ("Sign in to Oceana Gardens")
- After sign-in, the user must have a `membership` in *that* community, otherwise they see "You're not registered here – contact the administrator"
- Someone in more than one community (e.g. an owner with flats in two complexes) gets a simple "Choose your community" screen. Everything afterwards is scoped to the chosen community
- Invites are per community: the admin invites a resident to a specific unit, and the link lands on that community's branded page
- The PWA manifest and icon are per community, so "Add to Home Screen" shows the community's name and logo

### Landlords and their tenants
- Owners (landlords) have their own login. They see their unit(s), fee statement, documents and complaints about their unit, and they are the contact point for their tenants
- **A landlord can add a tenant to their unit** from "My units → Add tenant": name, email/phone, **tenancy type** (long-term / short-term / family member / holiday let / other + note), start date, optional end date
- The tenant gets a branded invite for that community. **Access ends automatically on the end date** (a daily pg_cron job), and the landlord can end it early or extend it
- Per-community setting: tenants added by a landlord are **active immediately** or **need admin approval**. The admin always sees and can revoke every tenancy
- Short-term / holiday-let guests get a limited profile (building info, bins, local area, AI; no directory or documents), configurable per community
- Tables: `tenancies` (unit, tenant profile, added_by, type, start, end, status: pending/active/ended), which replaces `unit_occupancies`

### Branding settings (per community, edited by its admin)
`communities`: `slug`, `name`, `custom_domain`, `status`, `default_language`, `enabled_languages`, `timezone`, `currency`
`community_branding`: `logo_url`, `hero_image_url`, `primary_color`, `accent_color`, `favicon_url`. Colours are **checked for contrast** on save (WCAG AA), and a colour that fails is rejected with a suggested alternative, so white-labelling can't break accessibility
`community_public_info`: welcome text (per language), address, lat/lng, office hours, emergency contacts, public notices
- Feature toggles per community (e.g. WhatsApp on/off, meetings module on/off)

### Platform (super-admin) console
Create a community → set slug and branding → invite its first admin. The console also shows a usage/cost overview per community (AI minutes, WhatsApp messages, storage).

### Sample community: Oceana Gardens (seed data)
A seed script (`supabase/seed.sql` + a TS seeder for files) creates:
- Community `oceana-gardens` with placeholder logo, hero photo, sea-green brand colour, welcome text in EN/ES
- 3 buildings (Blocks A–C), about 36 units, sample owners/tenants, 1 admin, 1 treasurer (test logins documented in README)
- Bin schedule, house rules, pool/parking info, emergency numbers
- 10–15 local places (beach walk, restaurants, pharmacy, health centre)
- Suppliers (gardening, pool, lift, cleaning, concierge, insurance), contracts with varied end/notice dates, about 12 months of invoices, and a budget with some lines over or under
- Sample complaints across categories, one past meeting with minutes, summary and action items, one upcoming meeting with a Zoom link, a fee schedule with charges/payments and a few units in arrears, and a landlord-added long-term tenant, and a few documents
- A second tiny demo community to prove data isolation in tests

---

## 1. Finance (core pillar)

Money is the biggest source of friction in a community, so finance gets its own top-level area, a treasurer role, and the most care in the build.

### Screens
1. **Finance overview** (admin/treasurer home): big number tiles for *Spent this year*, *Budget remaining*, *Invoices awaiting approval*, *Overdue*, *Contracts ending in 90 days*, plus a budget-vs-actual bar per category and a 12-month spend line.
2. **Invoices** table: number, supplier, category, contract, date, due date, net / VAT / total, status (Received → Approved → Paid, or Disputed), attachment. You can filter, sort, see a totals row, and export. Uploading a PDF lets **Claude read the invoice and pre-fill the fields**, which the admin checks and confirms. Likely duplicates (same supplier + number + amount) are flagged.
3. **Contracts** table: supplier, service, start, end, **length**, **notice period and notice deadline**, auto-renew, billing frequency, annual cost (normalised from monthly/quarterly), price-review clause, file. It includes a timeline view of key dates. pg_cron sends reminders at 90/60/30 days before the notice deadline and before the end date.
4. **Suppliers** register: company, service type (maintenance, gardening, concierge, cleaning, pool, lift, insurance, security…), contacts, tax ID, active contracts, total spend this year / all time, and linked complaints (supplier performance).
5. **Budgets**: an annual budget per category (as approved at the AGM), with **budget vs actual and variance** per line. You can copy last year's budget to start the next one.
6. **Quotes**: collect 2–3 quotes per job or contract renewal and compare them side by side, then mark the chosen one, which becomes the contract.
7. **Reserve / bank ledger**: opening balance plus manual entries or **CSV bank statement import**. Payments can be matched to invoices.
8. **Reports**: spend by category, supplier, month and year; year-on-year comparison; an AGM finance pack export (PDF + Excel/CSV).
9. **Resident view, "Where the money goes"**: read-only, plain-language summary (spend per service, budget progress, current contracts and suppliers). Optionally it shows *"Your unit's share ≈ €X/month"* using each unit's participation coefficient. No private supplier bank details are shown.

### Owner fees (community fees): tracking, no online payment
- **Fee schedule** per community: the annual budget is split across units by **participation coefficient** (or a fixed amount per unit). Billing frequency is monthly, quarterly or yearly
- **Charges** are generated per unit per period (pg_cron), plus **extraordinary levies** (derramas) for one-off works, split the same way or by a custom list
- **Payments** are recorded by the treasurer (date, amount, method: bank transfer/direct debit/cash) or **auto-matched from the bank CSV import** using the reference/IBAN. Part payments and overpayments are carried forward as a balance
- **Arrears table**: unit, owner, amount owed, oldest unpaid period, days overdue, last reminder sent. It uses the same filter/sort/export table as everywhere else
- **Owner statement**: each owner sees their own charges, payments and balance per unit, with a downloadable PDF statement. Tenants never see fee data
- **Reminders**: polite automatic reminders at configurable intervals (email / WhatsApp / in-app), with an escalating wording set the admin can edit
- Built so that **online payment (Stripe / SEPA direct debit) can be added later** without changing the data model
- Tables: `fee_schedules`, `unit_coefficients`, `fee_charges`, `levies`, `levy_allocations`, `fee_payments`, `payment_allocations` (payment ↔ charges), `fee_reminders`. Views: `v_unit_balance`, `v_arrears`

### Controls
- **Approval workflow**: invoices over a configurable threshold need approval from a second person (for example admin + treasurer).
- **Audit log**: every create/edit/status change on finance records (who, when, before/after) is stored in `audit_log` and cannot be edited.
- Money is stored as integer cents in EUR, with the VAT (IVA) rate per line and locale-aware formatting.

### Finance tables
`expense_categories`, `suppliers`, `supplier_contacts`, `contracts`, `contract_documents`, `invoices`, `invoice_lines`, `invoice_approvals`, `payments` (invoice ↔ ledger entry), `budgets`, `budget_lines`, `quotes`, `ledger_accounts`, `ledger_entries`, `bank_imports`, `audit_log`, plus the owner-fee tables above. Reporting views: `v_spend_by_category_month`, `v_budget_vs_actual`, `v_contract_key_dates`, `v_supplier_spend`.

### AI and finance
Admin/treasurer-only tools: `finance_spend(query)`, `finance_budget_status`, `finance_contracts_due`, `finance_invoice_lookup`. Examples: "How much have we spent on gardening this year compared to budget?" or "Which contracts can we cancel before March?" Residents get only the "Where the money goes" level of detail.

---

## 2. The AI assistant

### How it works, in one picture
```
 Mic button ─┐  (speech→text)            ┌─> Tools (run AS the user, RLS-enforced)
 Typed chat ─┼──> /api/assistant ──> Claude (tool use) ─┤   search_knowledge   (RAG, pgvector)
 WhatsApp  ──┘  (webhook, voice notes     │             │   get_bin_schedule / get_building_info
                 transcribed)             │             │   search_local_places
                                          │             │   get_meeting_outcomes
                                          │             │   find_contact        (respects privacy prefs)
                                          │             │   draft_complaint     (needs user confirm)
                                          │             │   admin_contracts / admin_complaint_stats / admin_spend (admin only)
                                          └──> answer text ──> screen (large) + text→speech (voice/WhatsApp audio)
```

**One brain, three doors.** Every channel calls the same `assistant core` (a server module used by a Next.js route and a WhatsApp webhook). Channel adapters only convert audio/text in and out.

### Components
| Piece | Choice | Why |
|---|---|---|
| Reasoning | Claude Sonnet (latest) with tool use; Haiku for cheap jobs (classifying, short translations) | Strong multilingual, good tool calling |
| Knowledge search | Supabase **pgvector** table `kb_chunks` + multilingual embeddings (Voyage `voyage-3.5` or OpenAI `text-embedding-3-small`) | Everything stays in Supabase; ask in Spanish, find an English doc |
| Structured facts | Direct SQL tools (bins, contracts, complaints) instead of RAG | Exact answers: "Tuesday", "contract ends 31 Mar" |
| Speech → text | OpenAI `gpt-4o-mini-transcribe` (or Deepgram) | Handles accents and older voices well; multilingual |
| Text → speech | OpenAI TTS (cheap) or ElevenLabs (warmer voices); speed follows the user's speech-rate preference | |
| WhatsApp | Twilio WhatsApp API (or Meta Cloud API directly) → Supabase Edge Function webhook | Voice notes supported; phone number matched to a verified profile |

### Security model (the important part)
- Tools run with the **user's own Supabase JWT**, so Row Level Security decides what the AI can see. The AI can never show a tenant another resident's hidden phone number, because the database won't return it.
- Admin tools are only *offered* to Claude when the caller's role is admin.
- **Writes need confirmation**: `draft_complaint` creates a `pending_actions` row. The resident sees a big card ("Send this complaint? Lift – Block B – broken again") with **Yes / No**, or says "yes" on voice/WhatsApp. Nothing is submitted silently.
- WhatsApp: unknown numbers get "please link your number in the app". Linking is a one-time code.
- Guardrails in the system prompt: answer only from community data and local knowledge, say "I don't know, I've told the admin" rather than guessing, no legal or medical advice, and escalate emergencies (gas, fire, water) to phone numbers straight away.

### What feeds the knowledge base
An ingestion job (Supabase Edge Function, triggered on insert/update) chunks and embeds: documents (extracted text), building info/FAQ, bin schedules, local places, meeting summaries and action items, and a contract summary (admin-visible only). Every chunk carries `community_id`, `visibility` (all / owners / admins), `language`, and `source_id` so answers can **cite the source** ("From: House Rules 2025, page 3", which opens the document when tapped).

### Older-user voice UX
- One huge **"Ask"** button on the home screen. Hold it or tap once (the user chooses in settings). The transcript shows in large text so they can see they were understood.
- The answer is spoken aloud and shown as large text, with **Repeat** and **Slower** buttons.
- Replies are short: one to three sentences, then "Want more detail?"
- Replies come in the user's preferred language, even if they ask in another.

### Learning loop for admins
`assistant_conversations` / `assistant_messages` are logged (residents can see and delete their own). The admin dashboard has an **"Unanswered questions"** list. The admin writes an answer once, it becomes an FAQ entry, and the AI knows it from then on.

### AI running costs: options to explore
**Rough cost per community** (about 100 active residents, ~20 questions each per month; list prices must be re-checked at build time):
| Item | Approx. unit cost | Monthly (100 users) |
|---|---|---|
| Claude answer with retrieved context (~4k tokens in / 300 out) | ~€0.01–0.02 per question (Sonnet); Haiku ~5× cheaper | €15–35 |
| Speech-to-text | ~€0.003–0.006 per minute | €2–5 |
| Text-to-speech | OpenAI ~€0.015 per 1k characters; ElevenLabs higher | €3–15 |
| WhatsApp | Replies to resident messages are cheap or free; outbound reminder templates ~€0.02–0.05 each + Twilio fee | €5–20 |
| Embeddings / translation (cached, one-off per document) | pennies | €1–3 |
| **Total** | | **≈ €25–80** |

**Who pays: options**
1. **Included in a per-unit subscription** (e.g. €1–3 per unit per month, AI included with fair-use limits). *Simplest for communities and predictable, so this is the recommended starting point.*
2. **Tiered plans**: Basic (no voice/WhatsApp), Standard (chat + voice), Plus (WhatsApp + translation + higher limits).
3. **Base fee + metered AI add-on**: usage billed monthly via Stripe metered billing. Fair, but less predictable for a community budget.
4. **Bring your own key**: a large community or management company plugs in its own Anthropic/OpenAI keys. No margin, no risk.
5. **Free pilot**: Oceana Gardens is free while testing, with costs capped, to gather real usage data before choosing.

**Cost controls (built regardless of option)**
- `ai_usage` table logs tokens, audio minutes and messages per community and user; the platform console shows €/community/month
- Per-community monthly budget cap with a soft alert at 80% and a hard stop at 100% (falls back to "Please contact the office")
- Per-user daily cap; Haiku for routing, short answers and translation, Sonnet only for complex questions; prompt caching of the system prompt and community info
- Cache TTS audio for common answers (bin days, office hours); translations cached forever per document and language
- Voice and WhatsApp can be switched off per community

Decision: run the Oceana Gardens pilot (option 5) with usage logging, then pick option 1 or 2 from real numbers.

---

## 3. Tech stack
- **Next.js 15 (App Router, TypeScript)** as an installable PWA, hosted on **Vercel**
- **Tailwind + shadcn/ui (Radix)** for accessible primitives (focus, ARIA, keyboard)
- **TanStack Table** for all data tables, with server-side sort/filter/pagination through Supabase queries
- **Recharts** for finance charts; **SheetJS + react-pdf** for Excel/PDF exports
- **next-intl** for UI translations: en, es, de, nl, sv/da/no, fr
- **Supabase**: Auth (email magic link + phone OTP, no passwords to forget), Postgres + RLS, Storage, pgvector, Edge Functions, Realtime, pg_cron (reminders)
- **Anthropic SDK** (assistant, translation, meeting summaries), OpenAI (speech), Twilio (WhatsApp), Resend (email notifications), `ics` package (calendar invites)

## 4. Look and feel: clean UI, clear tables, accessibility
### Visual style
- Clean and calm: white/very light grey background, lots of spacing, one accent colour, a neutral grey scale, and no clutter or decorative imagery on work screens
- Font: **Atkinson Hyperlegible** (designed for low vision) or Inter, with **tabular numbers** so amounts line up
- Cards with a clear title, one key number and one action. Status is always shown as **colour + word** (e.g. green "Paid", amber "Awaiting approval", red "Overdue"), never colour alone
- The same layout on every list page: title → summary tiles → filter bar → table

### Standard data table (one reusable `<DataTable>` component used everywhere)
- **Sorting**: tap any column header. An arrow plus the words "sorted A→Z / newest first" show the current sort
- **Filter bar** above the table using plain dropdowns, not hidden menus: e.g. *Supplier · Category · Status · Date range (This month / This year / Last 12 months / Custom)* plus a search box. Active filters show as removable chips with a **"Clear all"** button
- **Saved views**, e.g. "Unpaid invoices", "Contracts ending soon". Filters are kept in the URL so views can be bookmarked and shared
- Sticky header, zebra rows, generous row height, amounts right-aligned, **totals row** for money columns, and a row count ("Showing 25 of 132")
- Pagination with "Show 25 / 50 / 100" and a large Next/Previous
- **Export** (CSV / Excel / PDF) of exactly the current filtered view
- Clicking a row opens a full detail page (not a small popup) with a clear Back button
- Column chooser for admins. Residents see a simplified set of columns
- On phones, each row becomes a stacked **card** with the key fields, and the filters open in a full-screen panel with big buttons
- Empty states explain what to do next ("No invoices yet – Upload your first invoice")

### Accessibility preferences
- `user_preferences`: font scale (100/125/150/200%), high contrast, dark/light, reduce motion, dyslexia-friendly font, language, speech rate, voice on/off, "simple mode" (hides admin-style detail), preferred notification channel
- Applied through CSS variables on `<html>` (e.g. `--font-scale`), so every screen scales
- 18px minimum base text, 48px+ tap targets, icon **plus** text labels, no swipe-only gestures, one main action per screen, clear "Back" buttons, confirmation for anything destructive
- Home = a grid of 6–8 big tiles: **Ask · Bins & Info · Report a Problem · Contacts · Local Area · Documents · Meetings** (+ Suppliers & Contracts for admins)
- Target WCAG 2.2 AA; checked with axe/Lighthouse in CI
- First-login setup asks two things with live preview: "Is this text easy to read?" and "Which language?"

## 5. Data model (Supabase, every table has `community_id` + RLS)
- **Core**: `communities`, `buildings`, `units`, `profiles` (auth user, name, phone, whatsapp_verified), `memberships` (profile ↔ community, role: tenant/owner/admin), `tenancies` (tenant ↔ unit, type, dates, added_by; see §0), `unit_ownerships` (owner ↔ unit), `user_preferences`
- **Contacts**: `contact_preferences` (preferred method phone/WhatsApp/email/letter, best times, visibility: admins-only / my-unit's-parties / all residents). An RLS view `directory` exposes only what each viewer may see. Tenants always see *their* owner's allowed contact details.
- **Complaints**: `complaint_categories` (noise, maintenance, cleanliness, parking, pets, safety, other), `complaints` (reporter, target_type: unit/owner/common_area/supplier, target_id, category, description, photos, status: new/acknowledged/in_progress/resolved, priority), `complaint_updates` (timeline). SQL views produce **tallies by type, by owner, by unit/property, by month** for the admin dashboard.
- **Building info**: `info_pages` (rules, emergency numbers, parking, pool hours…), `bin_schedules` (type, colour, weekday/recurrence, location, notes). "Tomorrow is **green** bin day" reminders go out by push/WhatsApp.
- **Local knowledge**: `local_places` (type: restaurant/walk/route/shop/pharmacy/doctor/sight, description, address, lat/lng, accessibility notes such as step-free, benches, parking, GPX/route link, recommended_by), `place_reviews` (resident tips). Shown as a list first with an optional map (Leaflet + OpenStreetMap).
- **Documents**: `document_folders`, `documents` (Storage path, title, category, visibility, version, original_language, extracted_text), `document_translations` (document_id, language, text/translated file path, status)
- **Suppliers and finance**: see §1 Finance for the full table list.
- **Meetings**: `meetings` (title, type: AGM/extraordinary/committee/informal, date/time, timezone, location text and/or **external meeting link** (Zoom/Teams/Meet), agenda document, status: scheduled/postponed/cancelled/held), `meeting_rsvps`, `meeting_notifications` (channel, sent_at), `meeting_minutes` (uploaded minutes/notes document, optional recording link, AI summary per language), `action_items`
- **AI**: `kb_chunks` (embedding vector, content, source_type, source_id, visibility, language), `assistant_conversations`, `assistant_messages`, `pending_actions`, `faq_entries`, `whatsapp_links`

## 6. Feature notes
- **Meetings (announce and track only; the site does not host meetings)**: the admin creates a meeting with date, location and/or an external link and attaches the agenda. Residents are **alerted** on their chosen channel (push / email / WhatsApp) and see it on the home screen. Reminders go out **1 week, 1 day and 1 hour before**, each with the link. Residents get a big **"Join meeting"** button that opens the external link, **"Add to calendar"** (.ics / Google / Outlook) and RSVP (attending / not attending / online). Changes and cancellations trigger an update alert. Afterwards the admin uploads minutes/notes (and optionally a recording link). Claude produces a plain-language summary with decisions and action items, translated per language and fed to the AI. Fireflies or other auto-transcription can be added later as an optional integration but is not in scope
- **Document translation**: on upload, text is extracted (PDF text layer, OCR fallback for scans). A resident taps "Read in Español", Claude translates, and the result is cached in `document_translations` so each language is paid for only once. It shows as large readable text, with an optional downloadable PDF. A note says "Machine translation – the original is the legal version".
- **Contacting owners**: a tenant sees "Your owner: Mr X – prefers WhatsApp, weekdays 9–6" with big **Call / WhatsApp / Email** buttons (tel:/wa.me/mailto: links). Admins get a full directory with filters and CSV export.
- **Notifications**: each user picks a channel (push, email, WhatsApp).

## 7. Build order (phased)
0. **Foundation**: Next.js + Supabase project, **community resolution middleware, branded landing + login, community branding settings, Oceana Gardens seed**, auth (magic link/OTP), communities/units/memberships, roles (incl. treasurer) + RLS, preferences + accessibility shell, i18n, home tiles, admin invite flow, **design system + reusable `<DataTable>`**, audit log
1. **Finance core**: suppliers, owner fee schedule/charges/payments/arrears/statements, contracts (key dates + reminders), invoices (statuses, attachments, approval workflow), expense categories, budgets + budget-vs-actual, finance overview dashboard, CSV/Excel export
1b. **Landlord tenancies**: add/end/extend tenant, approval setting, automatic expiry
2. **Info modules** (these give the AI something to know): Bins & Info, Local Area, Documents (upload, folders, visibility)
3. **AI v1**: KB ingestion + pgvector, assistant core, typed chat, then the mic button (STT/TTS), sources shown, conversation log, unanswered-questions list, **finance admin tools**
4. **Complaints + Contacts**: reporting flow with photos, statuses, tallies dashboard (built on `<DataTable>`), contact preferences/directory, AI tools `draft_complaint` + `find_contact`
5. **Finance advanced**: AI invoice PDF extraction, quotes comparison, bank CSV import + reconciliation, reports + AGM finance pack, resident "Where the money goes" + unit share
6. **Meetings**: meeting tracker, alerts + reminders with meeting link, RSVP, add-to-calendar, minutes upload + AI summary and action items
7. **Translation + WhatsApp**: document translation cache, WhatsApp number linking, WhatsApp assistant (text + voice notes), WhatsApp reminders

Proposed repo layout: `middleware.ts` (community resolution), `app/[community]/(public)/page.tsx` (landing), `app/[community]/login`, `app/[community]/(resident)/…`, `app/[community]/(admin)/…`, `app/platform/…` (super-admin),, `app/(admin)/…`, `app/api/assistant`, `lib/assistant/{core,tools,prompts}.ts`, `lib/supabase/`, `supabase/migrations/`, `supabase/functions/{ingest,whatsapp-webhook,fireflies-webhook,reminders,translate}/`, `messages/{en,es,de,nl,sv,fr}.json`.

## 8. Verification
- **Finance correctness**: seeded test data checked against hand-calculated totals (budget vs actual, VAT, annualised contract cost). Approval threshold enforced in the database, not just the UI. Audit log written on every change
- **Tables**: Playwright tests for sort, filter, clear-all, URL-restored views, export matching the on-screen rows, and card layout at phone width
- **White-label**: `/oceana-gardens` shows Oceana branding and info. A member of the demo community cannot sign into Oceana. An unknown slug shows the not-found page. The per-community manifest name/icon is correct
- **RLS tests** (pgTAP or SQL scripts against a Supabase branch/local stack): a tenant cannot read other units' hidden contacts or admin-only contracts; users in community A cannot see community B
- **Assistant evals**: a scripted set of about 40 questions per language (bin day, owner contact, house rule, contract end date) with expected facts. Also check that a tenant asking an admin question is refused, and that complaints are never created without confirmation
- **Accessibility**: axe + Lighthouse in CI (AA). Manual checks at 200% font scale on a phone and with a screen reader (VoiceOver/TalkBack)
- **Meetings**: creating a meeting sends alerts on each channel; reminders fire at 1 week/1 day/1 hour; the .ics opens correctly in Google/Apple/Outlook; a cancellation sends an update
- **Owner fees**: charges generated per coefficient add up to the budget; bank CSV auto-match allocates payments to the oldest charges; arrears and statements match hand calculations; tenants cannot read fee data
- **Tenancies**: a landlord can add a tenant only to their own unit; access ends on the end date; the approval setting is respected
- **Integrations**: Twilio WhatsApp sandbox round-trip (text + voice note), translation of a sample PDF
- **Usability**: a 30-minute session with 3–5 older residents before each phase ships

## Open items to confirm later
Oceana Gardens location (seed assumes Costa del Sol, Spain; EUR + IVA) · whether owners who don't live there use the app or only get contacted · branding/name · final AI pricing model (after the pilot data, see §2).
