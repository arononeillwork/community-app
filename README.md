# Community App

A simple, friendly web app for apartment complexes (Spanish *comunidades de propietarios*). Residents find bin days,
house rules and local tips, report problems with photos, follow community meetings and reach the right person.
Owners see their fees and manage their own tenants. Administrators and the treasurer get one place for people,
suppliers, contracts, invoices, budgets and owner fees.

Many residents are older, so the app is deliberately **large, clear and calm**: big text and buttons, icons
always paired with words, status shown as colour **and** word, one main action per screen, and adjustable text
size, contrast and language.

One installation serves many complexes. Each community gets its own branded front door, like
`/oceana-gardens`, a subdomain or its own domain. The sample community is **Oceana Gardens**.

> **This is a standalone project.** It has its own Git repository, its own Supabase project (database, auth,
> storage) and, when deployed, its own Vercel project. It shares no code, database, keys or deployments with any
> other project. Everything runs locally by default.

---

## Contents

- [Quick start](#quick-start)
- [Local addresses](#local-addresses)
- [Test accounts](#test-accounts)
- [What each role can do](#what-each-role-can-do)
- [Architecture](#architecture)
- [Everyday commands](#everyday-commands)
- [Running everything in Docker](#running-everything-in-docker)
- [Tests](#tests)
- [Project structure](#project-structure)
- [Adding a new community](#adding-a-new-community)
- [Deploying later](#deploying-later)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Quick start

**You need:**

- **Node.js 22** (LTS). Check with `node --version`.
- **Docker**: Docker Desktop on macOS/Windows, Docker Engine on Linux. It must be running. Local Supabase runs as
  Docker containers.
- About 3 GB of free disk space for the Supabase images (the first start downloads them).
- On Windows, use **WSL 2** (Ubuntu) because the helper scripts are bash scripts.

You do **not** need a Supabase account, a local PostgreSQL or `psql` to work locally.

```bash
npm run setup      # installs packages, starts local Supabase, loads the schema + sample data, creates .env.local
npm run dev        # starts the app
```

Then open **http://localhost:3000/oceana-gardens** and sign in with `admin@oceanagardens.test` / `Password123!`.

`npm run setup` is safe to run again. It asks before resetting your local database. Use `SETUP_SKIP_RESET=1 npm run setup`
to keep your data, or `SETUP_YES=1 npm run setup` to skip the question.

When you're done for the day: `npm run db:stop` (your local data is kept).

---

## Local addresses

| What | Address | Notes |
|---|---|---|
| **App** | http://localhost:3000/oceana-gardens | `npm run dev` or `npm run docker:up` |
| Platform home | http://localhost:3000 | Lists the communities |
| Community on a subdomain | http://oceana-gardens.lvh.me:3000 | `lvh.me` always points to your own computer (`ROOT_DOMAIN=lvh.me`) |
| Supabase API | http://127.0.0.1:54321 | REST, Auth and Storage |
| Database | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Any Postgres client |
| **Mailpit** (emails) | http://127.0.0.1:54324 | Magic links, invites and other emails are caught here, nothing is really sent |
| Supabase Studio | http://127.0.0.1:54323 | Only when started with `npm run db:start:full` |

---

## Test accounts

All passwords are **`Password123!`**. These accounts exist only in your local database (created by
`supabase/seed.sql`).

| Email | Name | Role | Flats |
|---|---|---|---|
| `admin@oceanagardens.test` | María López | Administrator | |
| `treasurer@oceanagardens.test` | Peter Johansson | Treasurer **and** owner | Owns A-1A and B-3C (B-3C is rented to tenant1) |
| `owner1@oceanagardens.test` … `owner19@oceanagardens.test` | e.g. James Whitfield | Owner | Most own two flats, e.g. owner1: A-1B, B-4A. owner4, owner9, owner10 and owner16 each have a flat with unpaid fees (A-2B, C-2C, A-4B, B-2B) |
| `tenant1@oceanagardens.test` … `tenant8@oceanagardens.test` | e.g. Lucía Fernández | Tenant | Blocks B and C. tenant1 was added by their landlord; tenant7 is a holiday let ending soon |
| `platform@communityapp.test` | Platform Admin | Platform administrator | Treated as an administrator in every community |
| `admin@demoheights.test` | Dana Demo | Administrator of **Demo Heights** (`/demo-heights`) | Used to prove communities can't see each other's data |

Oceana Gardens has 3 blocks (A–C) and 36 flats labelled like `A-1A` or `C-4C` (block, floor, door). Its timezone is
Europe/Madrid and its currency is EUR.

---

## What each role can do

A person can hold several roles in one community (the treasurer above is also an owner).

| | Tenant | Owner | Treasurer | Administrator |
|---|:-:|:-:|:-:|:-:|
| Home, **Ask a question**, bins & info, local area, meetings, alerts, text size & settings | ✓ | ✓ | ✓ | ✓ |
| **Report a problem** (incident or complaint, with photos) and follow their own reports | ✓ | ✓ | ✓ | ✓ |
| Suggest meeting topics and upvote them (one vote per person per topic), RSVP to meetings | ✓ | ✓ | ✓ | ✓ |
| Contacts (only what each person chose to share; tenants always see their own landlord) | ✓ | ✓ | ✓ | ✓ |
| Documents shared with everyone, "Where the money goes" summary | ✓ | ✓ | ✓ | ✓ |
| Owner-only documents | | ✓ | ✓ | ✓ |
| See reports made about their own flat | | ✓ | | ✓ |
| **My flat & fees**: fee statement, add / end / extend their own tenants | | ✓ | | |
| **Finance**: invoices, contracts, suppliers, budget, quotes, owner fees and arrears, audit log | | | ✓ | ✓ |
| Approve invoices (large ones need two different people) | | | ✓ | ✓ |
| **Administration**: people & flats, invites, roles, community settings and branding | | | | ✓ |
| See and update every report; manage meetings, minutes and the agenda (move suggested topics onto it); upload documents | | | | ✓ |

Tenants never see fee data, invoices or supplier bank details. The **platform administrator** acts as an administrator in
every community and can set up new ones.

---

## Architecture

```
  Phone / tablet / PC browser, installable as an app (PWA)
          │   /oceana-gardens   ·   oceana-gardens.<ROOT_DOMAIN>   ·   community.example.es (custom domain)
          ▼
  Next.js 15 (App Router, React 19, TypeScript)
    • src/middleware.ts works out WHICH community from the path, subdomain or custom domain,
      and refreshes the login session cookie
    • every page checks membership and role first (requireMember / requireFinance / requireAdmin)
    • server components read data; server actions write it (and re-check permissions)
          │   supabase-js as the signed-in user           service-role key: server only, for invites
          ▼
  Supabase
    • Postgres with Row Level Security on every table (the database decides who sees what)
    • Auth: email + password and magic links
    • Storage: private buckets for documents, invoices and report photos (public bucket for logos)
    • pg_cron: nightly jobs, e.g. ending tenancies on their end date
```

**Multi-community, white-label.** Every table has a `community_id`. A community is reached by:

1. **Path**: `http://localhost:3000/oceana-gardens`. Always works and needs no DNS.
2. **Subdomain**: `http://oceana-gardens.lvh.me:3000` locally (`ROOT_DOMAIN=lvh.me`), `oceana-gardens.example.com` when
   hosted with a wildcard domain.
3. **Custom domain**: set `communities.custom_domain` (for example `community.oceanagardens.es`) and point the domain at
   the app. The middleware maps the host to the community.

Each community has its own branding (logo, colours checked for contrast), landing page (welcome text, address,
office hours, emergency numbers, notices), branded login and its own PWA manifest.

**Tech stack:** Next.js 15.5 · React 19 · TypeScript (strict) · Tailwind CSS v4 · lucide-react icons · `@supabase/ssr` +
`supabase-js` v2 · TanStack Table v8 (wrapped in one reusable `<DataTable>` with sorting, filters, search, totals,
CSV export, print and a phone card layout).

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run setup` | First-time setup: `npm install`, start Supabase, create `.env.local`, reset the database with the sample data |
| `npm run dev` | Start the app in development mode on http://localhost:3000 |
| `npm run db:start` | Start local Supabase without the optional heavy services (Studio, logs, edge functions, image proxy, pooler) |
| `npm run db:start:full` | Start everything, including Supabase Studio on http://127.0.0.1:54323 |
| `npm run db:stop` | Stop local Supabase (data is kept) |
| `npm run db:status` | Show local Supabase addresses and keys |
| `npm run db:reset` | Rebuild the local database from `supabase/migrations` and reload `supabase/seed.sql`. **Deletes local changes.** |
| `npm run db:test` | Run the database security tests (`supabase/tests/rls_test.sql`) |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run check` | typecheck + lint + db:test: run this before you commit |
| `npm run build` / `npm start` | Production build and server (without Docker) |
| `npm run docker:up` | Start Supabase and run the app in Docker (see below) |
| `npm run docker:down` | Stop the app container (Supabase keeps running; `npm run db:stop` stops it) |

Local settings live in `.env.local` (created from `.env.example` by `npm run setup`; never committed):

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase address, the same for browser and server (`http://127.0.0.1:54321` locally) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key. Safe in the browser because RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** secret key, used only to invite residents |
| `NEXT_PUBLIC_SITE_URL` | Public address of the site, used in invite and magic-link emails |
| `ROOT_DOMAIN` | Optional: enables `<slug>.<ROOT_DOMAIN>` subdomains (`lvh.me` locally) |

---

## Running everything in Docker

```bash
npm run docker:up     # starts Supabase + builds and runs the app container
npm run docker:down   # stops the app container
```

Then open http://localhost:3000/oceana-gardens.

How it fits together:

- **Supabase** runs as the Supabase CLI's own containers (`supabase_*_community-app`), exactly as with `npm run dev`.
- The **app** is built from the `Dockerfile` in three stages: install packages → `next build` (standalone output) → a small
  `node:22-slim` image that runs `node server.js` as a non-root user.
- `docker-compose.yml` defines the app service `web`. Its settings come from **`.env.docker`**, which `docker:up` creates from
  `.env.docker.example` (only the example is committed).
- `NEXT_PUBLIC_*` values are baked into the app when the image is built, so run `npm run docker:up` again after changing them.
  `SUPABASE_SERVICE_ROLE_KEY` is only given to the running container and never stored in the image.

**Why host networking?** The browser and the Next.js server must reach Supabase at the **same** address, because the login
cookie is named after the Supabase host. The container therefore uses `network_mode: host`, so `http://127.0.0.1:54321`
means the same thing inside and outside the container.

- **Linux:** works out of the box.
- **macOS / Windows (Docker Desktop):** turn on host networking in Docker Desktop **4.34 or newer**: *Settings → Resources →
  Network → Enable host networking*, then restart Docker Desktop. If you can't, run the app outside Docker instead:
  `npm run db:start` and then `npm run dev`.

The first image build needs internet access: it downloads the npm packages and the Google fonts used by the app. If you're
behind a proxy, set it in Docker's proxy settings. Linting is not part of the image build; run `npm run check` for that.

Useful: `docker compose logs -f web` (app logs), `docker compose ps` (health).

---

## Tests

| Command | What it checks |
|---|---|
| `npm run db:test` | **Database security (RLS) and business rules**, run against the local database with the sample data: anonymous visitors, tenants, owners, the treasurer and admins each see exactly what they should; one community can't see another; tenants can't change report status; owners can add tenants only to their own flats; one vote per topic; large invoices need two approvals; payments clear the oldest charges first. Each check runs in a transaction that is rolled back, so your data is untouched. |
| `npm run test:smoke` | **End-to-end smoke test**: signs in with the test accounts and checks that the main pages open for each role. Start the app first (`npm run dev` or `npm run docker:up`). |
| `npm run check` | typecheck + lint + `db:test` in one go. |

`db:test` uses your local `psql` if you have one, and otherwise runs `psql` inside the Supabase database container, so you
don't need PostgreSQL installed. If a test fails, it stops and prints `FAIL: …` with the reason. If the sample data has changed
since the last reset, run `npm run db:reset` first.

---

## Project structure

```
community-app/
├── src/
│   ├── middleware.ts                community lookup (path / subdomain / custom domain) + session refresh
│   ├── app/
│   │   ├── page.tsx                 platform home: list of communities
│   │   └── [community]/
│   │       ├── page.tsx             branded public landing page (emergency numbers always visible)
│   │       ├── login/  auth/        branded sign-in and magic-link callback
│   │       ├── manifest.webmanifest/  per-community PWA manifest
│   │       └── (app)/               signed-in area; layout.tsx checks membership
│   │           ├── home/            big tiles: Ask, Report, Bins & info, Meetings, …
│   │           ├── ask/  info/  local/  contacts/  documents/  money/  notifications/  settings/
│   │           ├── report/          incidents and complaints with photos (reference feature)
│   │           ├── meetings/        meetings, RSVP, calendar file, minutes, suggested topics
│   │           ├── my-units/        owners: flats, fee statement, tenants
│   │           ├── finance/         treasurer + admin: invoices, contracts, suppliers, budget, quotes, fees, audit
│   │           └── admin/           admin: overview, people & flats, community settings
│   ├── components/                  ui.tsx (UI kit), DataTable.tsx, and one folder per area
│   └── lib/                         community.ts (requireMember/…), format.ts (money, dates), color.ts, supabase/
├── supabase/
│   ├── config.toml                  local stack settings (ports, auth)
│   ├── migrations/                  schema, RLS policies, views, functions, storage buckets, pg_cron jobs
│   ├── seed.sql                     sample data for local development only
│   └── tests/rls_test.sql           database security tests
├── public/communities/<slug>/       static branding files (e.g. logo.svg)
├── scripts/                         setup, database and Docker helper scripts (used by npm run …)
├── docs/PLAN.md                     product plan and build status
├── Dockerfile  docker-compose.yml  .env.docker.example
└── .env.example                     template for .env.local
```

Conventions for contributors: money is stored as integer cents; every list uses `<DataTable>`; every page starts with
`requireMember` / `requireFinance` / `requireAdmin`; writes go through server actions that re-check permissions; all
database access goes through the signed-in user's Supabase client so RLS applies.

---

## Adding a new community

1. **Create the community** in SQL. Locally, add a block like this to `supabase/seed.sql` and run `npm run db:reset`, or run it
   once in Studio / `psql`. On a hosted project, run it in the Supabase SQL editor.

   ```sql
   with c as (
     insert into public.communities (slug, name, default_language, enabled_languages, timezone, currency)
     values ('sunset-terraces', 'Sunset Terraces', 'en', '{en,es}', 'Europe/Madrid', 'EUR')
     returning id
   ), b as (
     insert into public.community_branding (community_id, primary_color, accent_color)
     select id, '#1d4ed8', '#b45309' from c
   ), i as (
     insert into public.community_public_info (community_id, welcome, address, emergency_contacts)
     select id, '{"en": "Welcome to Sunset Terraces."}', 'Calle Ejemplo 1, Marbella',
            '[{"label": "Emergencies", "phone": "112"}]' from c
   ), blk as (
     insert into public.buildings (community_id, name, sort) select id, 'Block A', 1 from c returning id, community_id
   )
   insert into public.units (community_id, building_id, label, floor, coefficient)
   select community_id, id, 'A-' || n, 1, 10 from blk, generate_series(1, 10) n;
   ```

   The slug must be lowercase letters, numbers and dashes. It becomes `/<slug>` and `<slug>.<ROOT_DOMAIN>`. Unit
   `coefficient`s are each flat's share of the costs in % (they should add up to about 100). For report categories, expense
   categories, bin days and info pages, copy the matching `insert`s for Oceana Gardens from `supabase/seed.sql`.

2. **Invite its first administrator.** Sign in at `/<slug>/login` as the platform administrator (`platform@communityapp.test`
   locally), open **Admin → People & flats** and add the person as *Administrator*. They get an invite email (locally in
   Mailpit).
3. **Brand it.** The new administrator opens **Admin → Community settings** to upload the logo, choose colours (checked for
   readable contrast), and edit the welcome text, address, office hours, emergency numbers and notices. They then add owners
   and tenants under **People & flats**.
4. Optional: a **custom domain**. Set `communities.custom_domain` and add the domain to the hosting provider.

---

## Deploying later

Everything runs locally today. When it's time to go live, use a **new, dedicated Supabase project and a new Vercel
project for this app**. Do not reuse the database, keys or Vercel project of any other product.

1. **Create a new Supabase project** at https://supabase.com/dashboard (region close to the residents, e.g. EU).
2. **Link this repo to it and push the schema:**
   ```bash
   npx supabase login
   npx supabase projects list               # find the NEW project's reference id
   npx supabase link --project-ref <new-project-ref>
   npx supabase db push --dry-run           # check what will be applied
   npx supabase db push                     # applies supabase/migrations (not the seed)
   ```
   Never run `seed.sql` on a hosted project: its test accounts share a published password.
3. **Configure Auth** in the Supabase dashboard: *Site URL* = your app URL, *Redirect URLs* = `https://<your-domain>/**`
   (plus `https://*.<your-domain>/**` if you use subdomains). Add a real SMTP provider (e.g. Resend) so invites and magic
   links are delivered reliably.
4. **Create a Vercel project** from this repository and set the environment variables (Production and Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; never with a
   `NEXT_PUBLIC_` prefix), `NEXT_PUBLIC_SITE_URL` and, for subdomains, `ROOT_DOMAIN`. Keys are under *Project Settings → API*.
5. **Domains:** add the main domain, a wildcard `*.<your-domain>` for community subdomains, and any community custom
   domains.
6. Create the first community and administrator as described in [Adding a new community](#adding-a-new-community).

The Docker image works for other hosts too: build it with the hosted `NEXT_PUBLIC_*` values as build args and pass
`SUPABASE_SERVICE_ROLE_KEY` and `ROOT_DOMAIN` at runtime.

---

## Security notes

- **Row Level Security everywhere.** Every table has RLS switched on, and policies use small helper functions (`is_member`,
  `is_admin`, `is_finance`, `owns_unit`, `can_see`, …). Reporting views run with the caller's rights (`security_invoker`).
  Even a bug in a page can't show data the database won't return. `npm run db:test` proves the key rules.
- **The service-role key is server-only.** It bypasses RLS, so it is only read in `src/lib/supabase/admin.ts` (marked
  `server-only`), used only to invite users and look people up by email, and only after the code has checked the caller's
  role. It never gets a `NEXT_PUBLIC_` prefix, is never sent to the browser, and is not baked into the Docker image.
- **Permissions are checked twice**: every page and every server action re-checks the user's role, and the database checks
  again through RLS.
- **Private files.** Documents, invoices and report photos are in private storage buckets under `<community_id>/…` and are
  shown through short-lived signed links. Only logos are public.
- **Money rules live in the database.** Invoice approval thresholds and payment allocation are enforced by database
  functions and triggers, and finance changes are written to an audit log that can't be edited.
- **Secrets stay out of Git.** `.env*` files are ignored, except the examples. The keys in `.env.example` and
  `.env.docker.example` are the public demo keys of the *local* Supabase CLI and only work on your own machine.

---

## Troubleshooting

- **Some Docker images won't download** (corporate proxy, slow network): `npm run db:start` already skips the optional
  services. Only the core images are needed.
- **Port 54321/54322 already in use**: another local Supabase project is probably running. Stop it from its own folder
  (`npx supabase stop`) and start this one again.
- **Port 3000 already in use**: stop the other `npm run dev` or the Docker app (`npm run docker:down`).
- **Signed in but bounced back to the login page**: check that `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` is exactly
  `http://127.0.0.1:54321`, then restart `npm run dev`.
- **"You're not registered here"**: that account has no role in this community. For example, Demo Heights accounts can't
  sign in to Oceana Gardens, which is intended.
- **Magic-link email not arriving**: look in Mailpit (http://127.0.0.1:54324). Local Supabase sends at most a few emails per
  hour (see `[auth.rate_limit]` in `supabase/config.toml`). Use password sign-in for the test accounts.
- **Start again from clean sample data**: `npm run db:reset`.
