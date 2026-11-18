// A/B test ShieldBlock against real websites.
//
// For each site in sites.json (or the ids given as arguments), load it in a
// fresh Chrome profile without and with the extension, then compare. A site
// PASSES when, with the extension:
//   - no request to a blocklisted domain completes (no "leaks"),
//   - no new uncaught page errors appear that the baseline run didn't have
//     (errors that are just a site reacting to its blocked requests, such as
//     "Failed to fetch" or "Error loading script", are expected and ignored),
//   - the page keeps >= 70% of the baseline's visible text, and
//   - for sites marked "video", a <video> element plays if it played without
//     the extension.
//
// Usage: node site_test.js [site-id ...]
// Env:   CHROME=/path/to/chrome   CONCURRENCY=3   OUT=./results
const path = require("path");
const fs = require("fs");
const os = require("os");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "..", "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.resolve(process.env.OUT || path.join(__dirname, "results"));
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Blocklist classification (mirrors the DNR rules) ----
const blocked = new Set();
const thirdPartyOnly = new Set();
const excluded = new Set(); // excludedRequestDomains: never blocked (e.g. consent managers)
for (const name of ["ads", "trackers"]) {
  for (const rule of JSON.parse(fs.readFileSync(path.join(ROOT, "rules", `${name}.json`), "utf8"))) {
    const target = rule.condition.domainType === "thirdParty" ? thirdPartyOnly : blocked;
    (rule.condition.requestDomains || []).forEach((d) => target.add(d));
    (rule.condition.excludedRequestDomains || []).forEach((d) => excluded.add(d));
  }
}
const suffixes = (host) => host.split(".").map((_, i, l) => l.slice(i).join(".")).slice(0, -1);
const siteOf = (host) => host.split(".").slice(-2).join(".");
function isBlocklisted(host, pageHost) {
  const sfx = suffixes(host);
  if (sfx.some((s) => excluded.has(s))) return false;
  if (sfx.some((s) => blocked.has(s))) return true;
  return siteOf(host) !== siteOf(pageHost) && sfx.some((s) => thirdPartyOnly.has(s));
}

async function acceptConsent(page) {
  // Same consent choice in both runs so the comparison is fair.
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate(() => {
        const sel = ["#didomi-notice-agree-button", "#onetrust-accept-btn-handler", "button[aria-label*='ccept']",
          "button[data-testid='uc-accept-all-button']", "#sp-cc-accept"];
        for (const s of sel) { const el = document.querySelector(s); if (el) { el.click(); return s; } }
        const btn = [...document.querySelectorAll("button, a[role=button]")].find((b) =>
          /^(accept( all)?( cookies)?|agree( and close)?|i agree|allow all|ok|got it|yes, i agree)$/i.test(b.innerText.trim()));
        if (btn) { btn.click(); return btn.innerText.trim(); }
        return null;
      });
      if (clicked) return clicked;
    } catch (_) {}
  }
  return null;
}

async function runOnce(site, withExt) {
  const label = withExt ? "with" : "without";
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `sb-${site.id}-${label}-`));
  // Branded Chrome ignores --load-extension; load via CDP Extensions.loadUnpacked.
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, userDataDir, pipe: true, enableExtensions: withExt,
    args: ["--window-size=1366,900", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1366, height: 900 },
  });
  const r = { requests: 0, blockedByClient: 0, leaks: new Set(), pageErrors: [] };
  try {
    if (withExt) {
      await browser.installExtension(ROOT);
      await sleep(2500); // initial sync: rulesets + content-script registration
    }
    const page = await browser.newPage();
    await page.setUserAgent((await browser.userAgent()).replace("HeadlessChrome", "Chrome"));
    const pageHost = new URL(site.url).hostname;
    page.on("request", () => r.requests++);
    page.on("requestfailed", (req) => {
      if ((req.failure() || {}).errorText === "net::ERR_BLOCKED_BY_CLIENT") r.blockedByClient++;
    });
    page.on("requestfinished", (req) => {
      try {
        const host = new URL(req.url()).hostname;
        if (withExt && isBlocklisted(host, pageHost)) r.leaks.add(`${host} [${req.resourceType()}]`);
      } catch (_) {}
    });
    page.on("pageerror", (e) => r.pageErrors.push(String(e.message).split("\n")[0].slice(0, 160)));

    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    r.consent = await acceptConsent(page);
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 25000 }).catch(() => {});
    await sleep(site.video ? 12000 : 6000);

    r.health = await page.evaluate(() => ({
      title: document.title,
      textLength: (document.body ? document.body.innerText : "").trim().length,
      images: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
      links: document.links.length,
    }));
    if (site.video) {
      const states = [];
      for (const f of page.frames()) {
        try {
          states.push(...(await f.evaluate(() => [...document.querySelectorAll("video")]
            .map((v) => ({ t: Math.round(v.currentTime), paused: v.paused, duration: Math.round(v.duration || 0) })))));
        } catch (_) {}
      }
      r.videos = states;
      r.videoPlaying = states.some((v) => !v.paused && v.t > 0);
    }
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, `${site.id}-${label}.png`) });
  } catch (e) {
    r.error = String(e.message).slice(0, 200);
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  r.leaks = [...r.leaks];
  return r;
}

// A site's own reaction to a blocked request, not a breakage caused by us.
const NETWORK_INDUCED = /Failed to fetch|Load failed|NetworkError|net::ERR_|Error loading script|ChunkLoadError|Loading chunk|Failed to load|^Uncaught \(in promise\) (undefined|null|Event)$|^undefined$|^\[object (Event|Object)\]$/i;

function evaluate(site, without, withExt) {
  const reasons = [];
  if (withExt.error) reasons.push(`load error: ${withExt.error}`);
  if (withExt.leaks.length) reasons.push(`${withExt.leaks.length} blocklisted request(s) completed: ${withExt.leaks.slice(0, 3).join(", ")}`);
  const baseline = new Set(without.pageErrors);
  const newErrors = [...new Set(withExt.pageErrors.filter((e) => !baseline.has(e) && !NETWORK_INDUCED.test(e)))];
  if (newErrors.length) reasons.push(`new page errors: ${newErrors.slice(0, 3).join(" | ")}`);
  const bt = (without.health || {}).textLength || 0;
  const wt = (withExt.health || {}).textLength || 0;
  if (bt > 200 && wt < bt * 0.7) reasons.push(`visible text dropped ${bt} -> ${wt}`);
  if (site.video && without.videoPlaying && !withExt.videoPlaying) reasons.push("video stopped playing");
  return { pass: reasons.length === 0, reasons, newErrors };
}

async function testSite(site) {
  const without = await runOnce(site, false);
  const withExt = await runOnce(site, true);
  return { site, without, with: withExt, ...evaluate(site, without, withExt) };
}

(async () => {
  const all = JSON.parse(fs.readFileSync(path.join(__dirname, "sites.json"), "utf8"));
  const wanted = process.argv.slice(2);
  const sites = wanted.length ? all.filter((s) => wanted.includes(s.id)) : all;
  const results = [];
  const queue = [...sites];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const site = queue.shift();
      const res = await testSite(site);
      results.push(res);
      console.log(`${res.pass ? "PASS" : "FAIL"} ${site.id.padEnd(14)} requests ${String(res.without.requests).padStart(5)} -> ` +
        `${String(res.with.requests).padStart(5)}, blocked ${String(res.with.blockedByClient).padStart(4)}` +
        `${site.video ? `, video ${res.with.videoPlaying ? "playing" : "NOT playing"}` : ""}` +
        `${res.pass ? "" : `\n     ${res.reasons.join("\n     ")}`}`);
    }
  }));
  fs.mkdirSync(OUT, { recursive: true });
  results.sort((a, b) => a.site.id.localeCompare(b.site.id));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} sites passed. Screenshots and report.json in ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
