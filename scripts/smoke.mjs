#!/usr/bin/env node
/**
 * End-to-end smoke test against a running app (npm run dev, npm start or the standalone server).
 *
 *   BASE_URL=http://127.0.0.1:3100 npm run test:smoke
 *
 * For each test role it signs in through the real login form, opens every page route found under
 * src/app (dynamic segments filled with real ids from the local database), and records the final
 * URL, HTTP status, console errors, failed requests and any error page. Then it runs the key write
 * flows once as a real browser user, checks anonymous and cross-community access, and saves
 * screenshots.
 *
 * Environment:
 *   BASE_URL           app to test (default http://127.0.0.1:3100)
 *   SMOKE_SLUG         community slug (default oceana-gardens)
 *   SMOKE_PASSWORD     password of the seeded test users (default Password123!)
 *   SCREENSHOT_DIR     where screenshots go (default test-results/screens)
 *   CHROME_PATH        Chromium binary (default: first /opt/pw-browsers/chromium-*\/chrome-linux/chrome)
 *   SMOKE_WRITES=0     skip the write flows (they add rows to the local database)
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  read from .env.local when not set; the
 *                      service key is only used to look up ids and check results (read-only).
 *
 * Exits 1 when anything failed. Results are also written to test-results/smoke-results.json.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(ROOT, ".env.local"));

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const SLUG = process.env.SMOKE_SLUG ?? "oceana-gardens";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Password123!";
const SCREEN_DIR = path.resolve(ROOT, process.env.SCREENSHOT_DIR ?? "test-results/screens");
const RESULTS_FILE = path.join(ROOT, "test-results", "smoke-results.json");
const WRITES = process.env.SMOKE_WRITES !== "0";
const STAMP = Date.now();

const ROLES = [
  { key: "admin", email: "admin@oceanagardens.test", has: ["member", "admin", "finance"] },
  { key: "treasurer", email: "treasurer@oceanagardens.test", has: ["member", "finance", "owner"] },
  { key: "owner", email: "owner4@oceanagardens.test", has: ["member", "owner"] },
  { key: "tenant", email: "tenant1@oceanagardens.test", has: ["member"] },
];

/** Pages worth a full-page screenshot for each role (route pattern -> file suffix). */
const SCREENSHOT_ROUTES = {
  home: "home", report: "report", "report/new": "report-new", "report/[id]": "report-detail",
  meetings: "meetings", "meetings/[id]": "meeting-detail", info: "info", local: "local", documents: "documents",
  "documents/[id]": "document-detail", contacts: "contacts", money: "money", notifications: "notifications",
  settings: "settings", ask: "ask", "my-units": "my-units", finance: "finance", "finance/invoices": "finance-invoices",
  "finance/invoices/[id]": "invoice-detail", "finance/contracts": "finance-contracts", "finance/contracts/[id]": "contract-detail",
  "finance/suppliers": "finance-suppliers", "finance/budget": "finance-budget", "finance/quotes": "finance-quotes",
  "finance/fees": "finance-fees", "finance/fees/units/[unitId]": "fee-statement", "finance/audit": "finance-audit",
  admin: "admin", "admin/people": "admin-people", "admin/people/[id]": "admin-person", "admin/settings": "admin-settings",
};

const ERROR_TEXT = [/Application error/i, /Unhandled Runtime Error/i, /Internal Server Error/i, /server-side exception/i];
const NOT_FOUND_TEXT = /We couldn.t find that (page|community)|This page could not be found/i;

// ---------------------------------------------------------------------------------------------
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const dir = "/opt/pw-browsers";
  if (!fs.existsSync(dir)) return undefined;
  for (const d of fs.readdirSync(dir).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    const p = path.join(dir, d, "chrome-linux", "chrome");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** Tiny valid PNG (solid colour) built in memory, for the photo upload flow. */
function makePng(size = 32, rgb = [220, 38, 38]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Every page route under src/app, as a path relative to the community ("home", "finance/invoices/[id]" …). */
function discoverRoutes() {
  const appDir = path.join(ROOT, "src", "app");
  const out = { community: [], root: [] };
  (function walk(dir, segs) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), [...segs, e.name]);
      else if (e.name === "page.tsx") {
        const clean = segs.filter((s) => !/^\(.*\)$/.test(s));
        if (clean[0] === "[community]") out.community.push(clean.slice(1).join("/"));
        else out.root.push(clean.join("/"));
      }
    }
  })(appDir, []);
  out.community.sort();
  return out;
}

function requiredAccess(route) {
  if (route.startsWith("finance")) return "finance";
  if (route.startsWith("admin")) return "admin";
  if (route === "my-units") return "owner";
  if (["meetings/new", "meetings/[id]/edit", "documents/new"].includes(route)) return "admin";
  if (route === "" || route === "login") return "public";
  return "member";
}

// ---------------------------------------------------------------------------------------------
const results = { pages: [], flows: [], anonymous: [], endpoints: [], screenshots: [] };
const fail = (msg) => { throw new Error(msg); };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (put them in .env.local).");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const ping = await fetch(`${BASE}/${SLUG}`).catch(() => null);
  if (!ping) fail(`The app is not reachable at ${BASE}. Start it first (npm run dev / npm start).`);

  const ids = await lookupIds(db);
  fs.mkdirSync(SCREEN_DIR, { recursive: true });

  const executablePath = findChrome();
  const browser = await chromium.launch({ executablePath, headless: true });
  const routes = discoverRoutes();

  try {
    for (const role of ROLES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const log = watch(page);
      try {
        await login(page, role.email);
      } catch (e) {
        results.pages.push({ role: role.key, route: "login", ok: false, problems: [`Sign-in failed: ${e.message}`] });
        await ctx.close();
        continue;
      }
      for (const route of routes.community.filter((r) => r !== "" && r !== "login")) {
        await visit(page, log, role, route, ids);
      }
      await checkEndpoints(page, role, ids);
      await ctx.close();
    }

    if (WRITES) await writeFlows(browser, db, ids);
    await anonymousChecks(browser);
    await crossCommunity(browser);
    await mobileShots(browser, ids);
  } finally {
    await browser.close();
  }

  report();
}

async function lookupIds(db) {
  const one = async (q, what) => { const { data, error } = await q; if (error || !data) fail(`Could not find ${what}: ${error?.message ?? "none"}`); return data; };
  const community = await one(db.from("communities").select("id").eq("slug", SLUG).single(), "the community");
  const cid = community.id;
  const users = {};
  for (const r of ROLES) users[r.key] = (await one(db.from("profiles").select("id").eq("email", r.email).single(), r.email)).id;
  const meeting = await one(db.from("meetings").select("id").eq("community_id", cid).order("starts_at", { ascending: false }).limit(1).single(), "a meeting");
  const invoice = await one(db.from("invoices").select("id").eq("community_id", cid).eq("invoice_number", "RR-1229").single(), "invoice RR-1229");
  const contract = await one(db.from("contracts").select("id").eq("community_id", cid).order("title").limit(1).single(), "a contract");
  const supplier = await one(db.from("suppliers").select("id").eq("community_id", cid).order("name").limit(1).single(), "a supplier");
  const unit = await one(db.from("units").select("id").eq("community_id", cid).order("label").limit(1).single(), "a unit");
  const document = await one(db.from("documents").select("id").eq("community_id", cid).eq("visibility", "all").order("created_at").limit(1).single(), "a document");
  const { data: complaints } = await db.from("complaints").select("id, reporter_id, target_owner_id, target_unit_id").eq("community_id", cid).order("created_at", { ascending: false });
  const { data: owns } = await db.from("unit_ownerships").select("owner_id, unit_id").eq("community_id", cid);
  const reports = {};
  for (const r of ROLES) {
    const uid = users[r.key];
    const myUnits = new Set((owns ?? []).filter((o) => o.owner_id === uid).map((o) => o.unit_id));
    const visible = (complaints ?? []).find((c) => r.key === "admin" || c.reporter_id === uid || c.target_owner_id === uid || myUnits.has(c.target_unit_id));
    reports[r.key] = visible ? { id: visible.id, visible: true } : complaints?.[0] ? { id: complaints[0].id, visible: false } : null;
  }
  return { cid, users, meeting: meeting.id, invoice: invoice.id, contract: contract.id, supplier: supplier.id, unit: unit.id, document: document.id, reports, person: users.tenant };
}

function fillRoute(route, ids, roleKey) {
  let expectNotFound = false;
  const filled = route.replace(/\[(\w+)\]/g, (_, seg) => {
    if (seg === "unitId") return ids.unit;
    if (route.startsWith("meetings/")) return ids.meeting;
    if (route.startsWith("finance/invoices/")) return ids.invoice;
    if (route.startsWith("finance/contracts/")) return ids.contract;
    if (route.startsWith("finance/suppliers/")) return ids.supplier;
    if (route.startsWith("documents/")) return ids.document;
    if (route.startsWith("admin/people/")) return ids.person;
    if (route.startsWith("report/")) {
      const r = ids.reports[roleKey];
      if (!r) return "00000000-0000-4000-8000-000000000000";
      if (!r.visible) expectNotFound = true;
      return r.id;
    }
    return "unknown";
  });
  return { path: `/${SLUG}/${filled}`, expectNotFound };
}

/** Collect console errors and failed requests between visits. */
function watch(page) {
  const log = { console: [], failed: [] };
  page.on("console", (m) => { if (m.type() === "error") log.console.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => log.console.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "";
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(err)) return; // cancelled prefetches / navigations
    log.failed.push(`${r.method()} ${r.url()} (${err})`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== "document") log.failed.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return log;
}

async function pageProblems(page, status) {
  const text = await page.locator("body").innerText().catch(() => "");
  const problems = [];
  if (status >= 500) problems.push(`HTTP ${status}`);
  for (const re of ERROR_TEXT) if (re.test(text)) problems.push(`error text: ${re.source}`);
  const h1 = await page.locator("h1").count();
  return { text, problems, h1 };
}

async function visit(page, log, role, route, ids) {
  const { path: p, expectNotFound } = fillRoute(route, ids, role.key);
  const need = requiredAccess(route);
  const allowed = role.has.includes(need);
  log.console.length = 0; log.failed.length = 0;
  const rec = { role: role.key, route, url: BASE + p, ok: true, problems: [], notes: [] };
  try {
    const res = await page.goto(BASE + p, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    rec.status = res?.status() ?? 0;
    rec.finalUrl = page.url();
    const finalPath = new URL(rec.finalUrl).pathname;
    const { text, problems, h1 } = await pageProblems(page, rec.status);
    rec.problems.push(...problems);
    const notFound = NOT_FOUND_TEXT.test(text) || rec.status === 404;
    if (!allowed) {
      if (finalPath === new URL(BASE + p).pathname && !notFound) rec.problems.push(`role "${role.key}" should not be able to open this page (needs ${need})`);
      else rec.notes.push(`redirected as expected -> ${finalPath}`);
    } else if (expectNotFound) {
      if (!notFound) rec.problems.push("expected a friendly not-found page (record not visible to this role)");
      else rec.notes.push("not visible to this role: friendly not-found page shown");
    } else {
      if (finalPath !== new URL(BASE + p).pathname) rec.problems.push(`unexpected redirect -> ${finalPath}`);
      if (notFound) rec.problems.push("page shows not-found");
      if (h1 !== 1) rec.problems.push(`expected exactly one h1, found ${h1}`);
    }
    rec.consoleErrors = [...log.console];
    rec.failedRequests = [...log.failed];
    if (rec.consoleErrors.length) rec.problems.push(`${rec.consoleErrors.length} console error(s)`);
    if (rec.failedRequests.length) rec.problems.push(`${rec.failedRequests.length} failed request(s)`);
    if (allowed && !expectNotFound && SCREENSHOT_ROUTES[route] && rec.problems.length === 0) {
      const file = path.join(SCREEN_DIR, `${role.key}-${SCREENSHOT_ROUTES[route]}.png`);
      await page.screenshot({ path: file, fullPage: true });
      results.screenshots.push(file);
    }
  } catch (e) {
    rec.problems.push(`navigation failed: ${e.message.split("\n")[0]}`);
  }
  rec.ok = rec.problems.length === 0;
  results.pages.push(rec);
  process.stdout.write(`${rec.ok ? "ok  " : "FAIL"} ${role.key.padEnd(9)} ${route.padEnd(34)} ${rec.status ?? "-"} ${rec.ok ? rec.notes.join("; ") : rec.problems.join("; ")}\n`);
}

async function login(page, email) {
  await page.goto(`${BASE}/${SLUG}/login`, { waitUntil: "load" });
  await page.getByRole("tab", { name: "Use a password" }).click();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(new RegExp(`/${SLUG}/home$`), { timeout: 30000 });
}

/** Route handlers (non-page URLs) reached with the signed-in session. */
async function checkEndpoints(page, role, ids) {
  const checks = [
    { path: `/${SLUG}/meetings/${ids.meeting}/calendar.ics`, need: "member", expect: (r) => r.status() === 200 && /text\/calendar/.test(r.headers()["content-type"] ?? "") },
    { path: `/${SLUG}/manifest.webmanifest`, need: "public", expect: (r) => r.status() === 200 },
    { path: `/${SLUG}/finance/fees/import/example`, need: "finance", expect: (r, allowed) => (allowed ? r.status() === 200 && /csv/.test(r.headers()["content-type"] ?? "") : r.status() < 500) },
    { path: `/${SLUG}/documents/${ids.document}/download`, need: "member", expect: (r) => r.status() < 500 },
  ];
  for (const c of checks) {
    const allowed = c.need === "public" || role.has.includes(c.need);
    const rec = { role: role.key, url: BASE + c.path };
    try {
      const r = await page.request.get(BASE + c.path, { maxRedirects: 5 });
      rec.status = r.status();
      rec.contentType = r.headers()["content-type"];
      rec.ok = !!c.expect(r, allowed);
    } catch (e) {
      rec.ok = false; rec.error = e.message.split("\n")[0];
    }
    results.endpoints.push(rec);
    process.stdout.write(`${rec.ok ? "ok  " : "FAIL"} ${role.key.padEnd(9)} ${c.path.padEnd(60)} ${rec.status ?? "-"}\n`);
  }
}

// ---------------------------------------------------------------------------------------------
async function signedInPage(browser, email, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const log = watch(page);
  await login(page, email);
  return { ctx, page, log };
}

async function flow(name, fn) {
  const rec = { name, ok: false };
  try {
    const detail = await fn();
    rec.ok = true;
    rec.detail = detail ?? "";
  } catch (e) {
    rec.detail = e.message.split("\n")[0];
  }
  results.flows.push(rec);
  process.stdout.write(`${rec.ok ? "ok  " : "FAIL"} flow: ${name} ${rec.detail ? `(${rec.detail})` : ""}\n`);
}

async function assertNoError(page, log, what) {
  const { problems } = await pageProblems(page, 200);
  const errs = log ? log.console.filter((c) => !/Failed to load resource/.test(c)) : [];
  if (problems.length) fail(`${what}: ${problems.join(", ")}`);
  if (errs.length) fail(`${what}: console error ${errs[0]}`);
}

async function writeFlows(browser, db, ids) {
  // 1 + 2: tenant reports an incident with a photo, proposes a topic and toggles support.
  const tenant = await signedInPage(browser, "tenant1@oceanagardens.test");
  await flow("tenant1 reports an incident with a photo", async () => {
    const { page, log } = tenant;
    log.console.length = 0;
    await page.goto(`${BASE}/${SLUG}/report/new`);
    await page.locator('input[name="kind"][value="incident"]').check();
    const title = `Smoke test: water leak ${STAMP}`;
    await page.getByLabel("Short title").fill(title);
    await page.getByLabel("What happened?").fill("Water is dripping from the ceiling next to the lift in Block B. (Automated smoke test.)");
    await page.locator('input[name="photos"]').setInputFiles({ name: "leak.png", mimeType: "image/png", buffer: makePng() });
    await page.getByRole("button", { name: "Send report" }).click();
    await page.waitForURL(new RegExp(`/${SLUG}/report/[0-9a-f-]{36}`), { timeout: 45000 });
    await page.getByRole("heading", { level: 1 }).filter({ hasText: title }).waitFor({ timeout: 10000 });
    const img = page.locator('img[alt^="Photo 1"]');
    await img.waitFor({ timeout: 10000 });
    await page.waitForFunction((el) => el.complete, await img.elementHandle(), { timeout: 10000 });
    const w = await img.evaluate((el) => el.naturalWidth);
    if (!w) fail("the photo did not load on the detail page");
    await assertNoError(page, log, "report detail");
    await page.screenshot({ path: path.join(SCREEN_DIR, "tenant-report-created.png"), fullPage: true });
    return `detail page ${new URL(page.url()).pathname}, photo ${w}px wide`;
  });

  await flow("tenant1 proposes a meeting topic and supports / un-supports it", async () => {
    const { page, log } = tenant;
    log.console.length = 0;
    await page.goto(`${BASE}/${SLUG}/meetings`);
    const topic = `Smoke test topic ${STAMP}: more shade by the pool`;
    await page.getByLabel("Your topic").fill(topic);
    await page.getByRole("button", { name: "Suggest this topic" }).click();
    const card = page.locator("article").filter({ hasText: topic });
    await card.waitFor({ timeout: 20000 });
    const btn = () => card.locator("button[aria-pressed]").first();
    const before = await btn().getAttribute("aria-pressed");
    const flip = before === "true" ? "false" : "true";
    await btn().click();
    await card.locator(`button[aria-pressed="${flip}"]`).waitFor({ timeout: 20000 });
    await btn().click();
    await card.locator(`button[aria-pressed="${before}"]`).waitFor({ timeout: 20000 });
    const { data: t } = await db.from("v_meeting_topics").select("votes, proposed_by_name").eq("title", topic).single();
    await assertNoError(page, log, "meetings page");
    return `support toggled ${before} -> ${flip} -> ${before}; votes now ${t?.votes}; proposer "${t?.proposed_by_name}"`;
  });

  await flow("settings: text size 150% changes the <html> font size", async () => {
    const { page, log } = tenant;
    log.console.length = 0;
    await page.goto(`${BASE}/${SLUG}/settings`);
    const before = await page.evaluate(() => document.documentElement.style.fontSize);
    await page.locator('input[name="font_scale"][value="150"]').check();
    await page.getByRole("button", { name: "Save display settings" }).click();
    await page.waitForFunction(() => document.documentElement.style.fontSize === "150%", null, { timeout: 20000 });
    await page.reload();
    const afterReload = await page.evaluate(() => document.documentElement.style.fontSize);
    if (afterReload !== "150%") fail(`after reload the font size is ${afterReload}`);
    const px = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    await page.screenshot({ path: path.join(SCREEN_DIR, "tenant-settings-150.png"), fullPage: false });
    // Put it back so later screenshots use the normal size.
    await page.locator('input[name="font_scale"][value="100"]').check();
    await page.getByRole("button", { name: "Save display settings" }).click();
    await page.waitForFunction(() => document.documentElement.style.fontSize === "100%", null, { timeout: 20000 });
    await assertNoError(page, log, "settings page");
    return `${before || "(none)"} -> 150% (${px}) -> back to 100%`;
  });

  await flow("tenant1 saves 'My details' (profile update policy)", async () => {
    const { page } = tenant;
    await page.goto(`${BASE}/${SLUG}/settings`);
    const name = page.getByLabel("Your name");
    const current = await name.inputValue();
    await name.fill(current);
    await page.getByRole("button", { name: "Save my details" }).click();
    await page.getByText("Saved. Your details are up to date.").waitFor({ timeout: 15000 });
    return "saved";
  });
  await tenant.ctx.close();

  // 3: invoice approvals (treasurer, then admin).
  await flow("treasurer approves RR-1229, then admin approves it (becomes approved)", async () => {
    const { data: inv0 } = await db.from("invoices").select("status").eq("id", ids.invoice).single();
    if (inv0.status !== "received") return `skipped: RR-1229 is already '${inv0.status}' (reset the database to rerun)`;
    const t = await signedInPage(browser, "treasurer@oceanagardens.test");
    await t.page.goto(`${BASE}/${SLUG}/finance/invoices/${ids.invoice}`);
    await t.page.getByRole("button", { name: "Approve this invoice" }).click();
    await t.page.getByText(/Waiting for another committee member/i).first().waitFor({ timeout: 20000 });
    await assertNoError(t.page, t.log, "invoice page (treasurer)");
    const { data: mid } = await db.from("invoices").select("status").eq("id", ids.invoice).single();
    if (mid.status !== "received") fail(`after one approval the status is ${mid.status}`);
    await t.ctx.close();

    const a = await signedInPage(browser, "admin@oceanagardens.test");
    await a.page.goto(`${BASE}/${SLUG}/finance/invoices/${ids.invoice}`);
    await a.page.getByRole("button", { name: "Approve this invoice" }).click();
    await a.page.getByRole("button", { name: "Mark as paid" }).waitFor({ timeout: 20000 });
    await assertNoError(a.page, a.log, "invoice page (admin)");
    await a.page.screenshot({ path: path.join(SCREEN_DIR, "admin-invoice-approved.png"), fullPage: true });
    await a.ctx.close();
    const { data: inv } = await db.from("invoices").select("status").eq("id", ids.invoice).single();
    if (inv.status !== "approved") fail(`status is ${inv.status}`);
    return "received -> (1 of 2) -> approved";
  });

  // 4: owner adds a tenant.
  await flow("owner4 adds a new tenant to their flat", async () => {
    const o = await signedInPage(browser, "owner4@oceanagardens.test");
    const email = `newtenant+${STAMP}@example.test`;
    await o.page.goto(`${BASE}/${SLUG}/my-units`);
    await o.page.getByLabel("Tenant's full name").fill("Smoke Test Tenant");
    await o.page.getByLabel("Tenant's email address").fill(email);
    await o.page.getByRole("button", { name: "Add tenant" }).click();
    let tenancy = null;
    for (let i = 0; i < 40 && !tenancy; i++) {
      await o.page.waitForTimeout(500);
      const { data: prof } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
      if (prof) ({ data: tenancy } = await db.from("tenancies").select("id, status, unit_id").eq("tenant_id", prof.id).maybeSingle());
    }
    if (!tenancy) {
      const notice = await o.page.locator('[role="status"]').allInnerTexts();
      fail(`no tenancy was created. Page says: ${notice.join(" | ").slice(0, 200)}`);
    }
    await o.page.getByText("Smoke Test Tenant").first().waitFor({ timeout: 15000 });
    await assertNoError(o.page, o.log, "my-units page");
    await o.page.screenshot({ path: path.join(SCREEN_DIR, "owner-tenant-added.png"), fullPage: true });
    await o.ctx.close();
    return `tenancy ${tenancy.status} for ${email}`;
  });

  // 5: admin creates a meeting.
  await flow("admin creates a meeting", async () => {
    const a = await signedInPage(browser, "admin@oceanagardens.test");
    const title = `Smoke test meeting ${STAMP}`;
    const d = new Date(Date.now() + 21 * 86400000);
    const local = `${d.toISOString().slice(0, 10)}T18:30`;
    await a.page.goto(`${BASE}/${SLUG}/meetings/new`);
    await a.page.getByLabel("Title").fill(title);
    await a.page.getByLabel("Date and start time").fill(local);
    await a.page.getByLabel(/^Place/).fill("Community room, Block A");
    await a.page.getByRole("button", { name: "Save and notify residents" }).click();
    await a.page.waitForURL(new RegExp(`/${SLUG}/meetings/[0-9a-f-]{36}`), { timeout: 30000 });
    await a.page.getByRole("heading", { level: 1 }).filter({ hasText: title }).waitFor({ timeout: 10000 });
    await assertNoError(a.page, a.log, "meeting detail");
    const { data: m } = await db.from("meetings").select("id, starts_at").eq("title", title).single();
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).like("link", `%${m.id}`);
    await a.ctx.close();
    return `meeting ${m.id} at ${m.starts_at}; ${count} residents notified`;
  });
}

async function anonymousChecks(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const log = watch(page);
  const checks = [
    { path: "/", expect: "ok", shot: "anon-platform-home" },
    { path: `/${SLUG}`, expect: "ok", shot: "anon-landing" },
    { path: `/${SLUG}/login`, expect: "ok", shot: "anon-login" },
    { path: "/demo-heights", expect: "ok", shot: "anon-demo-heights" },
    { path: "/this-community-does-not-exist", expect: "notfound", shot: "anon-not-found" },
    { path: `/${SLUG}/no-such-page`, expect: "notfound" },
    { path: `/${SLUG}/home`, expect: "login" },
    { path: `/${SLUG}/finance`, expect: "login" },
  ];
  for (const c of checks) {
    log.console.length = 0; log.failed.length = 0;
    const rec = { url: BASE + c.path, expect: c.expect, problems: [] };
    try {
      const res = await page.goto(BASE + c.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      rec.status = res?.status();
      rec.finalUrl = page.url();
      const { text, problems } = await pageProblems(page, rec.status);
      rec.problems.push(...problems);
      if (c.expect === "ok" && (rec.status !== 200 || NOT_FOUND_TEXT.test(text))) rec.problems.push("expected the page to open");
      if (c.expect === "notfound" && (rec.status !== 404 || !NOT_FOUND_TEXT.test(text))) rec.problems.push("expected the friendly not-found page with status 404");
      if (c.expect === "login" && !/\/login/.test(new URL(rec.finalUrl).pathname)) rec.problems.push("expected a redirect to the login page");
      const consoleErrs = log.console.filter((m) => !(c.expect === "notfound" && /404/.test(m)));
      if (consoleErrs.length) rec.problems.push(`console: ${consoleErrs[0]}`);
      const failed = log.failed.filter((f) => !(c.expect === "notfound" && /^404 /.test(f)));
      if (failed.length) rec.problems.push(`failed request: ${failed[0]}`);
      if (c.shot && rec.problems.length === 0) {
        const file = path.join(SCREEN_DIR, `${c.shot}.png`);
        await page.screenshot({ path: file, fullPage: true });
        results.screenshots.push(file);
      }
    } catch (e) {
      rec.problems.push(e.message.split("\n")[0]);
    }
    rec.ok = rec.problems.length === 0;
    results.anonymous.push(rec);
    process.stdout.write(`${rec.ok ? "ok  " : "FAIL"} anonymous ${c.path.padEnd(34)} ${rec.status ?? "-"} ${rec.problems.join("; ")}\n`);
  }
  await ctx.close();
}

async function crossCommunity(browser) {
  await flow("admin@demoheights.test is refused on /oceana-gardens/login", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${SLUG}/login`);
    await page.getByRole("tab", { name: "Use a password" }).click();
    await page.getByLabel("Email address", { exact: true }).fill("admin@demoheights.test");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText(/not registered in this community/i).waitFor({ timeout: 20000 });
    if (!/\/login/.test(page.url())) fail(`ended on ${page.url()}`);
    // And the session must not have been kept.
    await page.goto(`${BASE}/${SLUG}/home`);
    if (!/\/login/.test(page.url())) fail("after the refusal the user could still open /home");
    await ctx.close();
    return "shows the not-registered message and keeps no session";
  });
}

async function mobileShots(browser, ids) {
  const phone = { width: 390, height: 844 };
  const shot = async (page, name) => {
    const file = path.join(SCREEN_DIR, `mobile-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.screenshots.push(file);
  };
  await flow("phone-size screenshots", async () => {
    const anon = await browser.newContext({ viewport: phone, isMobile: true, hasTouch: true });
    const ap = await anon.newPage();
    await ap.goto(`${BASE}/${SLUG}`);
    await shot(ap, "landing");
    await anon.close();

    const t = await signedInPage(browser, "tenant1@oceanagardens.test", phone);
    for (const [route, name] of [["home", "home"], ["report/new", "report-new"], ["meetings", "meetings"]]) {
      await t.page.goto(`${BASE}/${SLUG}/${route}`);
      await t.page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await shot(t.page, name);
    }
    const overflow = await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await t.ctx.close();

    const f = await signedInPage(browser, "treasurer@oceanagardens.test", phone);
    await f.page.goto(`${BASE}/${SLUG}/finance/invoices`);
    await f.page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await shot(f.page, "finance-invoices");
    const overflow2 = await f.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await f.ctx.close();
    if (overflow > 1 || overflow2 > 1) fail(`horizontal scroll on phone: meetings ${overflow}px, invoices ${overflow2}px`);
    return "5 screenshots, no horizontal scroll";
  });
}

function report() {
  const bad = [
    ...results.pages.filter((r) => !r.ok).map((r) => `page ${r.role} ${r.route}: ${r.problems.join("; ")}`),
    ...results.endpoints.filter((r) => !r.ok).map((r) => `endpoint ${r.role} ${r.url}: ${r.status ?? r.error}`),
    ...results.flows.filter((r) => !r.ok).map((r) => `flow ${r.name}: ${r.detail}`),
    ...results.anonymous.filter((r) => !r.ok).map((r) => `anonymous ${r.url}: ${r.problems.join("; ")}`),
  ];
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ base: BASE, at: new Date().toISOString(), failures: bad, ...results }, null, 2));
  const total = results.pages.length + results.endpoints.length + results.flows.length + results.anonymous.length;
  console.log(`\n${total - bad.length}/${total} checks passed. Screenshots: ${SCREEN_DIR}. Details: ${RESULTS_FILE}`);
  if (bad.length) {
    console.log("\nFailures:");
    for (const b of bad) console.log(`  - ${b}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
