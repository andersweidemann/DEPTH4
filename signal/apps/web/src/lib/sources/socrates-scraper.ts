/**
 * Armstrong Socrates Playwright scraper (proprietary technical data — not wire headlines).
 *
 * Playwright/Chromium may not run on Vercel serverless (missing browser binary, size limits).
 * Gate with SOCRATES_ENABLED; cron returns gracefully when launch fails. For production scraping,
 * consider cron-job.org hitting a VPS runner or local job that POSTs to this route's ingest path.
 */
import type { Browser, Page } from "playwright";

const SOCRATES_URL = "https://www.armstrongeconomics.com/socrates/";

export interface SocratesArraySnapshot {
  level: string;
  direction: string;
  confidence: string;
  reversalPoints: number[];
}

export interface SocratesEcmTurn {
  date: string;
  target: string;
  direction: "bullish" | "bearish" | "neutral";
}

export interface SocratesCapitalFlow {
  region: string;
  flow: "inflow" | "outflow" | "neutral";
  magnitude: string;
}

export interface SocratesReversal {
  asset: string;
  reversalPrice: number;
  type: "weekly" | "monthly" | "quarterly";
}

export interface SocratesData {
  scrapedAt: string;
  goldArrays: SocratesArraySnapshot;
  usdArrays: SocratesArraySnapshot;
  ecmTurnDates: SocratesEcmTurn[];
  capitalFlows: SocratesCapitalFlow[];
  majorReversals: SocratesReversal[];
}

function isEnabled(): boolean {
  return (process.env.SOCRATES_ENABLED ?? "").trim().toLowerCase() === "true";
}

function credentials(): { email: string; password: string } | null {
  const email = (process.env.SOCRATES_EMAIL ?? "").trim();
  const password = (process.env.SOCRATES_PASSWORD ?? "").trim();
  if (!email || !password) return null;
  return { email, password };
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").textContent().catch(() => "")) ?? "";
}

export async function scrapeSocrates(): Promise<SocratesData | null> {
  if (!isEnabled()) {
    console.info("[socrates] Disabled (SOCRATES_ENABLED != true)");
    return null;
  }

  const creds = credentials();
  if (!creds) {
    console.warn("[socrates] Missing SOCRATES_EMAIL or SOCRATES_PASSWORD");
    return null;
  }

  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(SOCRATES_URL, { waitUntil: "networkidle", timeout: 30_000 });

    const loggedIn = await attemptLogin(page, creds.email, creds.password);
    if (!loggedIn) throw new Error("login_failed");

    console.info("[socrates] Extracting data…");

    const goldArrays = await extractArrayData(page, "gold");
    const usdArrays = await extractArrayData(page, "usd");
    const ecmTurnDates = await extractECMDates(page);
    const capitalFlows = await extractCapitalFlows(page);
    const majorReversals = await extractMajorReversals(page);

    const result: SocratesData = {
      scrapedAt: new Date().toISOString(),
      goldArrays,
      usdArrays,
      ecmTurnDates,
      capitalFlows,
      majorReversals,
    };

    if ((process.env.SOCRATES_DEBUG ?? "").trim() === "true") {
      await page.screenshot({ path: "/tmp/socrates-debug.png", fullPage: true }).catch(() => {});
    }

    return result;
  } catch (err) {
    console.error("[socrates] Scraping failed:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function attemptLogin(page: Page, email: string, password: string): Promise<boolean> {
  const emailSelectors = ['input[type="email"]', 'input[name="email"]', 'input[name="username"]', "#user_login"];
  const passwordSelectors = ['input[type="password"]', 'input[name="password"]', "#user_pass"];
  const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Log")'];

  for (const emailSel of emailSelectors) {
    const emailInput = page.locator(emailSel).first();
    if ((await emailInput.count()) === 0) continue;
    await emailInput.fill(email);

    for (const passSel of passwordSelectors) {
      const passInput = page.locator(passSel).first();
      if ((await passInput.count()) === 0) continue;
      await passInput.fill(password);

      for (const submitSel of submitSelectors) {
        const submitBtn = page.locator(submitSel).first();
        if ((await submitBtn.count()) === 0) continue;
        await submitBtn.click();
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        if (await looksLikeDashboard(page)) return true;
      }
    }
  }

  return looksLikeDashboard(page);
}

async function looksLikeDashboard(page: Page): Promise<boolean> {
  const dashboard = page.getByText(/Dashboard|Arrays|ECM|Account/i).first();
  return (await dashboard.count()) > 0;
}

async function extractArrayData(page: Page, asset: "gold" | "usd"): Promise<SocratesArraySnapshot> {
  try {
    await page.goto(`${SOCRATES_URL}arrays/`, { waitUntil: "networkidle", timeout: 20_000 });
  } catch {
    /* partial page ok */
  }

  const assetLabel = asset === "gold" ? /gold/i : /dollar|usd/i;
  const tab = page.locator("button, a, div").filter({ hasText: assetLabel }).first();
  if ((await tab.count()) > 0) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  const level =
    (await page.locator('.array-level, .level-indicator, [class*="level"]').first().textContent().catch(() => null)) ??
    "unknown";
  const direction =
    (await page.locator('.array-direction, [class*="direction"], .trend').first().textContent().catch(() => null)) ??
    "neutral";
  const confidence =
    (await page.locator('.array-confidence, [class*="confidence"]').first().textContent().catch(() => null)) ??
    "medium";

  const pageText = await bodyText(page);
  const pricePattern = asset === "gold" ? /\$?(\d{3,4}\.\d{2})/g : /\$?(\d{2}\.\d{2,4})/g;
  const matches = Array.from(pageText.matchAll(pricePattern));
  const reversalPoints = matches
    .map((m) => parseFloat(m[1] ?? ""))
    .filter((p) => !Number.isNaN(p))
    .slice(0, 5);

  return {
    level: level.trim() || "unknown",
    direction: direction.trim() || "neutral",
    confidence: confidence.trim() || "medium",
    reversalPoints,
  };
}

async function extractECMDates(page: Page): Promise<SocratesEcmTurn[]> {
  try {
    await page.goto(`${SOCRATES_URL}ecm/`, { waitUntil: "networkidle", timeout: 20_000 });
  } catch {
    /* partial page ok */
  }

  const pageText = await bodyText(page);
  const datePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/gi;
  const dates = Array.from(pageText.matchAll(datePattern)).map((m) => m[0] ?? "");
  return dates.slice(0, 5).map((date) => ({ date, target: "general", direction: "neutral" as const }));
}

async function extractCapitalFlows(page: Page): Promise<SocratesCapitalFlow[]> {
  try {
    await page.goto(`${SOCRATES_URL}capital-flows/`, { waitUntil: "networkidle", timeout: 20_000 });
  } catch {
    /* partial page ok */
  }

  // DOM-specific extraction TBD after first SOCRATES_DEBUG screenshot.
  return [
    { region: "North America", flow: "neutral", magnitude: "medium" },
    { region: "Europe", flow: "neutral", magnitude: "medium" },
    { region: "Asia", flow: "neutral", magnitude: "medium" },
  ];
}

async function extractMajorReversals(page: Page): Promise<SocratesReversal[]> {
  try {
    await page.goto(`${SOCRATES_URL}reversals/`, { waitUntil: "networkidle", timeout: 20_000 });
  } catch {
    /* partial page ok */
  }

  const pageText = await bodyText(page);
  const pricePattern = /\$?(\d{3,4}\.\d{2})/g;
  const matches = Array.from(pageText.matchAll(pricePattern));
  return matches.slice(0, 3).map((m, i) => ({
    asset: i === 0 ? "Gold" : "USD",
    reversalPrice: parseFloat(m[1] ?? "0"),
    type: "weekly" as const,
  }));
}
