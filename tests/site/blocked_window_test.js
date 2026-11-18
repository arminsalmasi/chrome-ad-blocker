// End-to-end test of the "View blocked requests" window on a real website.
//
// 1. Load a site with ShieldBlock and record what Chrome reports as blocked.
// 2. Open the real popup (chrome.action.openPopup) and click the button.
// 3. Check the window: right tab, totals match Chrome's blocked count, only
//    blocklisted hosts, filter works, list resets on navigation, and the log
//    is dropped when the tab closes.
//
// Usage: node blocked_window_test.js [url]
const path = require("path");
const fs = require("fs");
const os = require("os");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..", "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_ = process.argv[2] || "https://www.dailymotion.com/video/xbxrp5y";
const SECOND_URL = "https://en.wikipedia.org/wiki/Ad_blocking";
const OUT = path.resolve(process.env.OUT || path.join(__dirname, "results"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const blocklisted = new Set();
for (const name of ["ads", "trackers"]) {
  for (const rule of JSON.parse(fs.readFileSync(path.join(ROOT, "rules", `${name}.json`), "utf8"))) {
    (rule.condition.requestDomains || []).forEach((d) => blocklisted.add(d));
  }
}
const isListed = (host) => host.split(".").some((_, i, l) => i < l.length - 1 && blocklisted.has(l.slice(i).join(".")));

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

async function acceptConsent(page) {
  for (const frame of page.frames()) {
    try {
      if (await frame.evaluate(() => {
        const b = document.querySelector("#didomi-notice-agree-button, #onetrust-accept-btn-handler, button[aria-label*='ccept']") ||
          [...document.querySelectorAll("button")].find((x) => /^(accept( all)?|agree|i agree)$/i.test(x.innerText.trim()));
        if (b) { b.click(); return true; } return false;
      })) return true;
    } catch (_) {}
  }
  return false;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-blocked-window-"));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, userDataDir, pipe: true, enableExtensions: true,
    args: ["--window-size=1366,900", "--mute-audio"], defaultViewport: { width: 1366, height: 900 },
  });
  try {
    const extId = await browser.installExtension(ROOT);
    await sleep(2500);
    const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().includes(extId));
    const sw = await swTarget.worker();

    // 1. Real site, counting what Chrome reports as blocked.
    const page = await browser.newPage();
    await page.setUserAgent((await browser.userAgent()).replace("HeadlessChrome", "Chrome"));
    let chromeBlocked = 0;
    page.on("requestfailed", (req) => { if ((req.failure() || {}).errorText === "net::ERR_BLOCKED_BY_CLIENT") chromeBlocked++; });
    await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    await acceptConsent(page);
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 25000 }).catch(() => {});
    await sleep(5000);
    await page.bringToFront();

    const tabId = await sw.evaluate(async (host) => {
      const tabs = await chrome.tabs.query({});
      const t = tabs.find((x) => x.url && new URL(x.url).hostname.endsWith(host));
      return t ? t.id : null;
    }, new URL(URL_).hostname.split(".").slice(-2).join("."));
    check("site tab found", tabId !== null, `tabId ${tabId}`);
    check("site blocked requests", chromeBlocked > 0, `${chromeBlocked} reported by Chrome`);

    // 2. Real popup -> click the button.
    let blockedPage = null;
    try {
      await sw.evaluate(async () => { await chrome.action.openPopup(); });
      const popupTarget = await browser.waitForTarget((t) => t.url().includes(`${extId}/popup/popup.html`), { timeout: 8000 });
      const popup = await popupTarget.asPage();
      await popup.waitForSelector("#view-blocked:not([disabled])", { timeout: 8000 });
      const opened = browser.waitForTarget((t) => t.url().includes(`${extId}/blocked/blocked.html`), { timeout: 8000 });
      await popup.click("#view-blocked");
      blockedPage = await (await opened).asPage();
      check("popup button opens blocked window", true, new URL(blockedPage.url()).search);
    } catch (e) {
      check("popup button opens blocked window", false, e.message.slice(0, 120));
      blockedPage = await browser.newPage();
      await blockedPage.goto(`chrome-extension://${extId}/blocked/blocked.html?tabId=${tabId}`);
    }
    check("window targets the site tab", new URL(blockedPage.url()).searchParams.get("tabId") === String(tabId));
    const win = await sw.evaluate(async (id) => {
      const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL("blocked/blocked.html") + "*" });
      const t = tabs.find((x) => x.url.includes(`tabId=${id}`));
      return t ? (await chrome.windows.get(t.windowId)).type : null;
    }, tabId);
    check("opens in a separate popup window", win === "popup", `window type ${win}`);

    // 3. Contents.
    await blockedPage.waitForFunction(() => Number(document.getElementById("total").textContent) > 0, { timeout: 10000 }).catch(() => {});
    await sleep(800);
    const view = await blockedPage.evaluate(() => ({
      total: Number(document.getElementById("total").textContent),
      hosts: [...document.querySelectorAll("details.domain .host")].map((h) => h.textContent),
      counts: [...document.querySelectorAll("details.domain .count")].map((c) => Number(c.textContent)),
      page: document.getElementById("page").textContent,
    }));
    await blockedPage.screenshot({ path: path.join(OUT, "blocked-window.png") });
    const sum = view.counts.reduce((a, b) => a + b, 0);
    check("total matches Chrome's blocked count", Math.abs(view.total - chromeBlocked) <= Math.max(2, chromeBlocked * 0.1),
      `window ${view.total} vs Chrome ${chromeBlocked}`);
    check("group counts add up to total", sum === view.total, `${sum} vs ${view.total}`);
    const unlisted = view.hosts.filter((h) => !isListed(h));
    check("every listed host is on a blocklist", unlisted.length === 0, unlisted.length ? unlisted.slice(0, 5).join(", ") : `${view.hosts.length} domains`);
    check("header shows the site", view.page.includes(new URL(URL_).hostname.replace(/^www\./, "")), view.page.slice(0, 80));

    // Filter.
    const first = view.hosts[0];
    await blockedPage.type("#filter", first);
    await sleep(300);
    const filtered = await blockedPage.evaluate(() => [...document.querySelectorAll("details.domain .host")].map((h) => h.textContent));
    check("filter narrows the list", filtered.length >= 1 && filtered.every((h) => h.includes(first)), `"${first}" -> ${filtered.length} group(s)`);
    await blockedPage.evaluate(() => { const f = document.getElementById("filter"); f.value = ""; f.dispatchEvent(new Event("input")); });

    // Expand a group shows URLs.
    await blockedPage.click("details.domain > summary");
    const urls = await blockedPage.evaluate(() => document.querySelectorAll("details.domain[open] ul.urls li").length);
    check("expanding a domain shows its URLs", urls > 0, `${urls} URL(s)`);

    // Reset on navigation (live update in the open window).
    await page.goto(SECOND_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    const afterNav = await blockedPage.evaluate(() => Number(document.getElementById("total").textContent));
    const stored = await sw.evaluate(async (id) => (await chrome.storage.session.get(`blocked:${id}`))[`blocked:${id}`], tabId);
    check("list resets when the tab navigates", afterNav < view.total && stored && stored.pageUrl.startsWith(SECOND_URL),
      `${view.total} -> ${afterNav}, pageUrl ${stored && stored.pageUrl.slice(0, 50)}`);

    // Dropped when the tab closes.
    await page.close();
    await sleep(1000);
    const gone = await sw.evaluate(async (id) => !(`blocked:${id}` in (await chrome.storage.session.get(`blocked:${id}`))), tabId);
    check("log removed when the tab closes", gone);
  } catch (e) {
    check("test run", false, e.stack ? e.stack.split("\n").slice(0, 2).join(" ") : String(e));
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})();
