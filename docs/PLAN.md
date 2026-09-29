# Community App for Apartment Complexes — Plan

## Context
Residents of apartment complexes (many of them older) struggle to: reach unit owners, get complaints tracked, find everyday info (bins, rules, contacts), learn local knowledge, access community documents in their own language, and understand what the community spends on suppliers. Admins lack one place for suppliers/contracts/invoices and meeting records.

Goal: a **simple, large, accessible PWA** backed by **Supabase**, with an **AI assistant** (voice, chat, WhatsApp) that answers from the community's own data and can take a few safe actions. Multi-complex from day one, with a **white-label landing page and login per community** (first sample community: **Oceana Gardens**).

**Standalone product.** The app has its own repository (`community-app`), its own Supabase project and, when hosted, its own Vercel project. It shares no code, database, keys or deployments with any other project. Everything runs **locally first** (Supabase CLI stack in Docker + `npm run dev`, or the app in Docker too); see README.

Decisions so far: Web app/PWA · roles = tenant, owner (landlord), admin, **treasurer** (finance role) (+ platform admin) · multi-community · landlords use the app and can add their own tenants · **incident reporting with photo attachments** (a report is an *incident* or a *complaint*; photos in a private bucket) · meetings are announced/tracked only (the site does not host them; external link + alerts) · **suggested meeting topics** with one upvote per member, which admins move onto a meeting agenda · AI via mic button, typed chat, WhatsApp · AI can answer, log complaints, look up contacts, run admin queries · languages EN/ES/DE/NL/Scandinavian/FR · **Finance is a core pillar** (community supplier costs, contracts, invoices, budgets, reporting **and owner fee tracking**; no online payments for now) · **Clean UI with clear, filterable, sortable tables** · local-first; hosted deployment later on a **new, dedicated** Supabase project + Vercel.

---

## 0. Multi-community and white-label

Each complex gets its **own branded front door**. The platform runs once, and each community looks like its own app.

### How a community is reached
- **Path first:** `app.example.com/oceana-gardens`. This is simple, works immediately, and needs no DNS.
- **Subdomain:** `oceana-gardens.example.com`, via a wildcard domain on Vercel (`<slug>.<ROOT_DOMAIN>`; locally `oceana-gardens.lvh.me:3000`).
- **Custom domain:** e.g. `community.oceanagardens.es`, added in Vercel and mapped in `communities.custom_domain`.
- The Next.js middleware (`src/middleware.ts`) rewrites subdomain/custom-domain requests to `/<slug>/…` and refreshes the session; pages load that community's branding by slug. Unknown slug → a friendly "Community not found" page.

### Community landing page (public, before login)
Content comes from the community's settings, so it needs no code changes:
- Logo, community name, hero photo, short welcome text
- Address with a "Show on map" link (OpenStreetMap), and office/concierge hours
- **Emergency and key numbers** (always visible, even logged out)
- Latest public notices (optional, e.g. "Pool closed Monday")
- Large language picker and text-size buttons right on the landing page
- A big **"Sign in"** button → login screen in the same branding

### Branded login
- Same Supabase Auth underneath (email + password and email magic link now; phone code later), shown inside the community's look ("Sign in to Oceana Gardens")
- After sign-in, the user must have a `membership` in *that* community, otherwise they see "You're not registered here – contact the administrator"
- Someone in more than one community (e.g. an owner with flats in two complexes) picks it on the platform home (`/`, "Your communities"). Everything afterwards is scoped to the chosen community
- Invites are per community: the admin (Admin → People & flats) or a landlord (My flat) invites a person to a specific unit, and the link lands on that community's branded page
- The PWA manifest and icon are per community, so "Add to Home Screen" shows the community's name and logo

### Landlords and their tenants
- Owners (landlords) have their own login. They see their unit(s), fee statement, documents and complaints about their unit, and they are the contact point for their tenants
- **A landlord can add a tenant to their unit** from "My flat → Add tenant": name, email/phone, **tenancy type** (long-term / short-term / family member / holiday let / other + note), start date, optional end date
- The tenant gets a branded invite for that community. **Access ends automatically on the end date** (pg_cron job `expire-tenancies`, daily 02:10 UTC), and the landlord can end it early or extend it
- Per-community setting (`settings.tenant_requires_approval`): tenants added by a landlord are **active immediately** or **need admin approval** (status `pending`). The admin always sees and can revoke every tenancy
- Later: short-term / holiday-let guests get a limited profile (building info, bins, local area, AI; no directory or documents), configurable per community
- Tables: `tenancies` (unit, tenant, added_by, tenancy_type, start_date, end_date, status: pending/active/ended, note). A trigger keeps the tenant's `membership` in sync, so ending the tenancy ends access. RLS lets an owner add tenants only to their own units (tested)

### Branding settings (per community, edited by its admin)
`communities`: `slug`, `name`, `custom_domain`, `status`, `default_language`, `enabled_languages`, `timezone`, `currency`
`community_branding`: `logo_url`, `hero_image_url`, `primary_color`, `accent_color`, `favicon_url`. Colours are **checked for contrast** on save (WCAG AA), and a colour that fails is rejected with a suggested alternative, so white-labelling can't break accessibility
`community_public_info`: tagline and welcome text (per language), address, lat/lng, office hours, emergency contacts, public notices
- Settings per community (`communities.settings`): feature toggles (`features.ai`, `features.whatsapp`, `features.meetings`), `tenant_requires_approval`, `invoice_approval_threshold_cents`. Edited in **Admin → Community settings** together with branding and public info

### Platform (super-admin) console
Later: create a community → set slug and branding → invite its first admin, plus a usage/cost overview per community (AI minutes, WhatsApp messages, storage). **For now:** the platform admin (`profiles.is_platform_admin`) acts as an admin in every community; a new community is created with a short SQL insert and the platform admin invites its first admin from Admin → People & flats (steps in README).

### Sample community: Oceana Gardens (seed data)
`supabase/seed.sql` (local only; logo in `public/communities/oceana-gardens/`) creates:
- Community `oceana-gardens` (Europe/Madrid, EUR, languages en/es/de/nl/sv/fr) with logo, sea-green brand colour, welcome text in EN/ES
- 3 buildings (Blocks A–C), 36 units (`A-1A` … `C-4C`) with coefficients summing to 100 %, 19 owners, 1 treasurer (also an owner), 8 tenants (landlord-added long-term, family, a holiday let ending soon), 1 admin and 1 platform admin. All test logins use `Password123!` (listed in README)
- Bin schedule, house rules, pool/parking/office info, emergency numbers, 12 local places
- 10 suppliers, 7 contracts with varied end/notice dates, 88 invoices over ~12 months (one large invoice waiting for a second approval), an approved budget with some lines over or under, 3 quotes
- A quarterly coefficient-based fee schedule plus one levy, with payments and 4 units in arrears
- 18 reports (incidents and complaints) across categories, one held AGM with minutes, decisions and action items, two upcoming meetings with a video link, 7 suggested topics (one on the agenda, one discussed), 6 documents
- A second tiny community, **Demo Heights**, with its own admin, to prove data isolation in tests

---

## 1. Finance (core pillar)

Money is the biggest source of friction in a community, so finance gets its own top-level area, a treasurer role, and the most care in the build.

**Built first (local):** overview, invoices (attachments, approval workflow), contracts (key dates, timeline), suppliers, budget vs actual, quotes, owner fees (schedule, levies, payments, arrears, reminders log, bank-statement CSV import for fee payments), audit log, and the resident "Where the money goes" page. **Later:** Claude invoice reading, duplicate detection, pg_cron contract/fee reminders, invoice ↔ ledger reconciliation, reports + AGM pack (PDF/Excel).

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
- **Charges** are generated per unit per period by the treasurer (`generate_fee_charges`; automatic pg_cron generation later), plus **extraordinary levies** (derramas) for one-off works, split by coefficient (`allocate_levy`; a custom list later)
- **Payments** are recorded by the treasurer (date, amount, method: bank transfer/direct debit/cash/card/other) or **matched from a bank-statement CSV import** using the bank description (the treasurer picks the flat when there is no match). A trigger allocates each payment to the **oldest open charges first**; part payments leave a charge `partial`, and overpayments are carried forward as credit (`unallocated_cents`)
- **Arrears table**: unit, owner, amount owed, oldest unpaid period, days overdue, last reminder sent. It uses the same filter/sort/export table as everywhere else
- **Owner statement**: each owner sees their own charges, payments and balance per unit (My flat & fees), printable as a statement. Tenants never see fee data (RLS, tested)
- **Reminders**: reminders sent are logged per unit now; polite automatic reminders at configurable intervals (email / WhatsApp / in-app) with editable escalating wording come later
- Built so that **online payment (Stripe / SEPA direct debit) can be added later** without changing the data model
- Tables: `fee_schedules` (per year; coefficient or fixed; monthly/quarterly/yearly), `levies`, `fee_charges` (per unit per period or levy), `fee_payments`, `payment_allocations` (payment ↔ charges), `fee_reminders`. Each unit's participation share is `units.coefficient`. View: `v_unit_balance` (balance and overdue per unit, which drives the arrears table)

### Controls
- **Approval workflow**: invoices over a configurable threshold (`settings.invoice_approval_threshold_cents`, default €1,000) need approval from a second person (for example admin + treasurer). Enforced in the database (`approve_invoice()` + a status trigger), not just the UI.
- **Audit log**: every create/edit/status change on finance records (who, when, before/after) is written by a trigger to `audit_log`, which is append-only and cannot be edited.
- Money is stored as integer cents in EUR (net + VAT per invoice; VAT rate per contract) with locale-aware formatting.

### Finance tables
Built: `expense_categories`, `suppliers`, `contracts`, `invoices`, `invoice_approvals`, `budgets`, `budget_lines`, `quotes`, `ledger_entries` (optionally linked to an invoice), `audit_log`, plus the owner-fee tables above. Later: `supplier_contacts`, `contract_documents`, `invoice_lines`, `ledger_accounts`, `bank_imports`. Reporting views: `v_invoice_list`, `v_spend_by_category_month`, `v_budget_vs_actual`, `v_contract_key_dates`, `v_supplier_spend`, `v_unit_balance` (all `security_invoker`, so RLS applies). The resident view uses `community_spend_summary()` and `community_contracts_public()`, which return aggregates only.

### AI and finance
Admin/treasurer-only tools: `finance_spend(query)`, `finance_budget_status`, `finance_contracts_due`, `finance_invoice_lookup`. Examples: "How much have we spent on gardening this year compared to budget?" or "Which contracts can we cancel before March?" Residents get only the "Where the money goes" level of detail.

---

## 2. The AI assistant

**Status:** next phase. The tables already exist (`kb_chunks` with `vector(1024)` + `match_kb_chunks()`, `faq_entries`, `assistant_conversations`, `assistant_messages`, `pending_actions`, `ai_usage`, `whatsapp_links`). Until then, the **Ask** page does a plain keyword search over bins, info pages, FAQ, local places and documents, so residents already get answers without AI costs.

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
| Knowledge search | Supabase **pgvector** table `kb_chunks` + multilingual 1024-dimension embeddings (Voyage `voyage-3.5`, or OpenAI `text-embedding-3-small` with `dimensions: 1024`) | Everything stays in Supabase; ask in Spanish, find an English doc |
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
- **Next.js 15.5 (App Router, React 19, TypeScript strict)** as an installable PWA with a per-community manifest. Runs locally (`npm run dev`) or as a Docker image (`output: "standalone"`); hosted later on **Vercel**
- **Tailwind CSS v4** + a small in-house accessible UI kit (`src/components/ui.tsx`: Card, Button, Badge, StatusBadge, PageHeader, Stat, Empty, Notice) + **lucide-react** icons (instead of shadcn/ui)
- **TanStack Table v8**, used only through our `<DataTable>`. Sorting, filtering and pagination run in the browser on rows loaded by the server (fine at community scale), with state in the URL
- Finance charts are simple built-in bars (no chart library yet). **CSV export + print** now; Excel/PDF exports later
- Fonts: Atkinson Hyperlegible (default) and Lexend (reading-ease option)
- **next-intl** for UI translations (later): en, es, de, nl, sv/da/no, fr. Community content already stores text per language (`{"en": …, "es": …}`)
- **Supabase**: Auth (email + password and magic link now; phone OTP later), Postgres + RLS, Storage, pgvector, pg_cron (tenancy expiry; reminders later), Edge Functions + Realtime later. Local development uses the Supabase CLI stack in Docker, and the hosted app gets its **own** Supabase project
- **Anthropic SDK** (assistant, translation, meeting summaries), OpenAI (speech), Twilio (WhatsApp), Resend (email notifications). Calendar files (.ics) and Google Calendar links are generated in our own code

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
- **Export** CSV of exactly the current filtered view, plus **Print** (Excel / PDF later)
- Clicking a row opens a full detail page (not a small popup) with a clear Back button
- Later: column chooser for admins. Residents see a simplified set of columns
- On phones, each row becomes a stacked **card** with the key fields, and the filters open in a full-screen panel with big buttons
- Empty states explain what to do next ("No invoices yet – Upload your first invoice")

### Accessibility preferences
- `user_preferences`: font scale (100/125/150/175/200%), high contrast, dark/light, reduce motion, dyslexia-friendly font, language, speech rate, voice on/off, "simple mode" (hides admin-style detail), preferred notification channel
- Applied on `<html>` (root font size + classes, also as cookies so the logged-out landing page can use them), so every screen scales
- 18px minimum base text, 48px+ tap targets, icon **plus** text labels, no swipe-only gestures, one main action per screen, clear "Back" buttons, confirmation for anything destructive
- Home = a grid of big tiles: **Ask · Report a Problem · Bins & Info · Meetings · Contacts · Local Area · Documents · Where the money goes** (+ My flat & fees for owners, Finance for admin/treasurer, Administration for admins)
- Target WCAG 2.2 AA; checked with axe/Lighthouse in CI
- First-login setup asks two things with live preview: "Is this text easy to read?" and "Which language?"

## 5. Data model (Supabase, every table has `community_id` + RLS)
- **Core**: `communities`, `community_branding`, `community_public_info`, `buildings`, `units` (label, floor, coefficient), `profiles` (auth user, name, email, phone, whatsapp_verified, is_platform_admin), `memberships` (profile ↔ community, role: tenant/owner/admin/treasurer, status: pending/active/ended; one person can hold several roles), `tenancies` (tenant ↔ unit, type, dates, added_by; see §0), `unit_ownerships` (owner ↔ unit), `user_preferences`
- **Contacts**: `contact_preferences` (preferred method phone/WhatsApp/email/letter, best times, visibility: admins-only / my-unit's-parties / all residents). A security-definer function `directory(community)` returns only what each viewer may see. Tenants always see *their* owner's allowed contact details.
- **Reports (incidents + complaints)**: `complaint_categories`, `complaints` (reporter, **kind: incident** = something broken or dangerous / **complaint** = about a person, flat or service; target_type: unit/owner/common_area/supplier + target ids, location, title, description, `photo_paths` (up to 5 photos in the private `complaints` bucket, shown via signed URLs), status: new/acknowledged/in_progress/resolved/closed, priority: low/normal/high/urgent), `complaint_updates` (timeline + status changes). Visible to the reporter, admins, and owners of the flat concerned; only admins change the status. View `v_complaint_tallies` gives **tallies by kind, category, target, status and month** for the admin dashboard.
- **Building info**: `info_pages` (rules, emergency numbers, parking, pool hours…), `bin_schedules` (type, colour, weekday/recurrence, location, notes). "Tomorrow is **green** bin day" reminders go out by push/WhatsApp.
- **Local knowledge**: `local_places` (type: restaurant/walk/route/shop/pharmacy/doctor/sight…, description, address, distance, price level, step-free + accessibility notes, phone, website, recommended_by; members can suggest places), later `place_reviews` (resident tips). Shown as a list first, with map links (OpenStreetMap).
- **Documents**: `documents` (`folder`, title, description, storage path in the private `documents` bucket, visibility all/owners/admins, original_language, extracted_text), `document_translations` (document_id, language, text/translated file path, status)
- **Suppliers and finance**: see §1 Finance for the full table list.
- **Meetings**: `meetings` (title, type: AGM/extraordinary/committee/informal, starts_at + duration, location text and/or **external meeting link** (Zoom/Teams/Meet), agenda text or agenda document, status: scheduled/postponed/cancelled/held), `meeting_rsvps` (attending/online/not_attending), `meeting_minutes` (minutes document, optional recording link, summary, decisions), `action_items`, **`meeting_topics`** (suggested topics: status open/on_agenda/discussed/declined, linked meeting, admin note) + **`topic_votes`** (one vote per member per topic) + view `v_meeting_topics` (vote count, "voted by me")
- **Notifications**: `notifications` (in-app now; also the outbound queue for email/WhatsApp/push workers later). A trigger alerts every active member when a meeting is created, moved, relinked or cancelled.
- **AI**: `kb_chunks` (embedding `vector(1024)`, content, source_type, source_id, visibility, language), `assistant_conversations`, `assistant_messages`, `pending_actions`, `faq_entries`, `ai_usage`, `whatsapp_links`
- **Storage**: buckets `branding` (public), `documents`, `finance`, `complaints` (private). Paths start with `<community_id>/`, and storage policies check membership/role for that community.

## 6. Feature notes
- **Reporting a problem (incidents + complaints)**: one big "Report a problem" flow. The resident first says *what kind*: an **incident** (something broken, leaking or dangerous) or a **complaint** (noise, a neighbour, a service), then picks a category, where it is, a short description and up to 5 photos (stored privately; shown through short-lived signed links). The report starts as "New" whatever the form says; only admins change the status, and every change or comment appears in the report's timeline. Residents see their own reports; owners also see reports about their flat
- **Meetings (announce and track only; the site does not host meetings)**: the admin creates a meeting with date, location and/or an external link and attaches the agenda. Residents are **alerted** (in-app now; push / email / WhatsApp on their chosen channel later) and see it on the home screen. Later: reminders **1 week, 1 day and 1 hour before**, each with the link. Residents get a big **"Join meeting"** button that opens the external link, **"Add to calendar"** (.ics file / Google Calendar link) and RSVP (attending / not attending / online). Changes and cancellations trigger an update alert. Afterwards the admin adds minutes/notes, decisions, action items and optionally a recording link. Later: Claude produces a plain-language summary, translated per language and fed to the AI. Fireflies or other auto-transcription can be added later as an optional integration but is not in scope
- **Suggested meeting topics**: any member can suggest a topic for a future meeting and **upvote** others' topics (one vote per member per topic, enforced by the database; members can take their vote back). The list is sorted by votes. Admins move a topic **onto a meeting's agenda** (`on_agenda`, linked to that meeting), mark it **discussed**, or **decline** it with a short note. Members can edit or delete only their own topics while they are still open; voting closes once a topic leaves "open"
- **Document translation**: on upload, text is extracted (PDF text layer, OCR fallback for scans). A resident taps "Read in Español", Claude translates, and the result is cached in `document_translations` so each language is paid for only once. It shows as large readable text, with an optional downloadable PDF. A note says "Machine translation – the original is the legal version".
- **Contacting owners**: a tenant sees "Your owner: Mr X – prefers WhatsApp, weekdays 9–6" with big **Call / WhatsApp / Email** buttons (tel:/wa.me/mailto: links). Admins get a full directory with filters and CSV export.
- **Notifications**: an in-app Alerts page now; each user picks a channel (push, email, WhatsApp) for outbound delivery later.

## 7. Build order (phased)
0. **Foundation**: Next.js + Supabase project, **community resolution middleware, branded landing + login, community branding settings, Oceana Gardens seed**, auth (magic link/OTP), communities/units/memberships, roles (incl. treasurer) + RLS, preferences + accessibility shell, i18n, home tiles, admin invite flow, **design system + reusable `<DataTable>`**, audit log
1. **Finance core**: suppliers, owner fee schedule/charges/payments/arrears/statements, contracts (key dates + reminders), invoices (statuses, attachments, approval workflow), expense categories, budgets + budget-vs-actual, finance overview dashboard, CSV/Excel export
1b. **Landlord tenancies**: add/end/extend tenant, approval setting, automatic expiry
2. **Info modules** (these give the AI something to know): Bins & Info, Local Area, Documents (upload, folders, visibility)
3. **AI v1**: KB ingestion + pgvector, assistant core, typed chat, then the mic button (STT/TTS), sources shown, conversation log, unanswered-questions list, **finance admin tools**
4. **Reports + Contacts**: incident/complaint reporting with photos, statuses, tallies dashboard (built on `<DataTable>`), contact preferences/directory, AI tools `draft_complaint` + `find_contact`
5. **Finance advanced**: AI invoice PDF extraction, quotes comparison, bank CSV import + reconciliation, reports + AGM finance pack, resident "Where the money goes" + unit share
6. **Meetings**: meeting tracker, suggested topics + upvotes → agenda, alerts + reminders with meeting link, RSVP, add-to-calendar, minutes upload + AI summary and action items
7. **Translation + WhatsApp**: document translation cache, WhatsApp number linking, WhatsApp assistant (text + voice notes), WhatsApp reminders
8. **Hosted deployment**: new dedicated Supabase project (`supabase link` + `db push`) + Vercel project, wildcard + custom domains, real SMTP

The local build covers most of phases 0, 1, 1b, 2, 4 and 6 and the non-AI parts of 5 at once (§9 lists what is left, e.g. i18n and reminders); AI (3), 7 and 8 follow.

Repo layout (actual): `src/middleware.ts` (community resolution + session refresh), `src/app/page.tsx` (platform home), `src/app/[community]/page.tsx` (landing), `src/app/[community]/{login,auth,manifest.webmanifest}`, `src/app/[community]/(app)/…` (signed-in area: `home`, `ask`, `report`, `meetings`, `info`, `local`, `contacts`, `documents`, `money`, `notifications`, `settings`, `my-units`, `finance/…`, `admin/…`), `src/components/{ui.tsx,DataTable.tsx,<area>/}`, `src/lib/{community,format,color}.ts`, `src/lib/supabase/`, `supabase/{migrations,tests,seed.sql}`, `scripts/` (setup/db/docker), `Dockerfile` + `docker-compose.yml`. Planned: `src/app/api/assistant`, `src/lib/assistant/{core,tools,prompts}.ts`, `supabase/functions/{ingest,whatsapp-webhook,reminders,translate}/`, `messages/{en,es,de,nl,sv,fr}.json`, `src/app/platform/…` (console).

## 8. Verification
- **Finance correctness**: seeded test data checked against hand-calculated totals (budget vs actual, VAT, annualised contract cost). Approval threshold enforced in the database, not just the UI. Audit log written on every change
- **Tables**: Playwright tests for sort, filter, clear-all, URL-restored views, export matching the on-screen rows, and card layout at phone width
- **White-label**: `/oceana-gardens` shows Oceana branding and info. A member of the demo community cannot sign into Oceana. An unknown slug shows the not-found page. The per-community manifest name/icon is correct
- **RLS tests** (`supabase/tests/rls_test.sql`, run with `npm run db:test` against the local stack; no local psql needed): anon/tenant/owner/treasurer/admin visibility, a tenant cannot read other people's contact details, fees, invoices or admin-only documents, report status is admin-only, one vote per topic, two approvals for large invoices, oldest-first payment allocation, and users in community A cannot see community B
- **Smoke test** (`npm run test:smoke`): the main pages open for each test role
- **Assistant evals**: a scripted set of about 40 questions per language (bin day, owner contact, house rule, contract end date) with expected facts. Also check that a tenant asking an admin question is refused, and that complaints are never created without confirmation
- **Accessibility**: axe + Lighthouse in CI (AA). Manual checks at 200% font scale on a phone and with a screen reader (VoiceOver/TalkBack)
- **Meetings**: creating a meeting sends alerts on each channel; reminders fire at 1 week/1 day/1 hour; the .ics opens correctly in Google/Apple/Outlook; a cancellation sends an update
- **Owner fees**: charges generated per coefficient add up to the budget; bank CSV auto-match allocates payments to the oldest charges; arrears and statements match hand calculations; tenants cannot read fee data
- **Tenancies**: a landlord can add a tenant only to their own unit; access ends on the end date; the approval setting is respected
- **Integrations**: Twilio WhatsApp sandbox round-trip (text + voice note), translation of a sample PDF
- **Usability**: a 30-minute session with 3–5 older residents before each phase ships

## 9. Build status (local)
Everything below runs on a developer machine: `npm run setup` then `npm run dev` (or `npm run docker:up`). Nothing is hosted yet.

**Exists now**
- **Schema** (`supabase/migrations/`): core + white-label, finance + owner fees, community modules (reports, info, local places, documents, meetings + topics, notifications, AI tables), storage buckets + policies, pg_cron tenancy expiry
- **RLS on every table** + `supabase/tests/rls_test.sql` (`npm run db:test`, all passing on the seed)
- **Seed**: Oceana Gardens + Demo Heights with test logins for every role
- **Foundation**: community middleware (path / subdomain / custom domain), branded landing + login (password + magic link), per-community manifest, platform home, accessibility shell (text size, contrast, dyslexia font, language cookie), UI kit, `<DataTable>`
- **Local infrastructure**: npm scripts (`setup`, `db:*`, `typecheck`, `check`, `docker:*`), multi-stage `Dockerfile` (standalone), `docker-compose.yml` next to the Supabase CLI stack, README

**Being built now** (pages under `src/app/[community]/(app)/`): home tiles, Ask (keyword search), Report a problem (incidents/complaints + photos), meetings (RSVP, .ics, minutes, suggested topics + upvotes → agenda), bins & info, local area, contacts/directory, documents, "Where the money goes", alerts, personal settings, My flat & fees (statement, add/end/extend tenants), finance (overview, invoices + approvals, contracts, suppliers, budget, quotes, owner fees + bank CSV import, audit log), administration (overview, people & flats + invites, community settings/branding)

**Next**
1. **AI assistant**: KB ingestion + embeddings into `kb_chunks`, assistant core with tools running as the user, typed chat, then voice (STT/TTS), cited sources, unanswered-questions list, finance admin tools, usage caps
2. **WhatsApp**: number linking, assistant over WhatsApp (text + voice notes), reminders
3. **Translation**: UI translations (next-intl) and cached document translation
4. **Outbound notifications + reminders**: email (Resend) / push / WhatsApp delivery; pg_cron jobs for meeting, contract and fee reminders
5. **Hosted deployment**: a new, dedicated Supabase project (`supabase link` + `db push`, no seed) and a Vercel project with wildcard/custom domains and real SMTP
6. Also pending: Playwright + axe tests in CI, platform console, invoice PDF reading, Excel/PDF exports, bank reconciliation for invoices

## Open items to confirm later
Oceana Gardens location (seed assumes San Pedro de Alcántara, Costa del Sol, Spain; EUR + IVA) · whether owners who don't live there use the app or only get contacted · branding/name · final AI pricing model (after the pilot data, see §2).
