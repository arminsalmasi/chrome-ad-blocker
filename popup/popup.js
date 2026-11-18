// Popup writes settings to storage.local; background.js reacts to the change
// and reconciles rulesets, allowlist rules and content scripts.

const BLOCKING_RULESETS = new Set(["ruleset_ads", "ruleset_trackers"]);

// Allowlist entries cover the domain and its subdomains (matching DNR
// requestDomains). "www." is dropped so allowlisting www.site.com covers site.com.
const normalizeHost = (host) => host.toLowerCase().replace(/^www\./, "");
const coversHost = (entry, host) => host === entry || host.endsWith("." + entry);

// Same validation as background.js: hosts it would drop (e.g. IPv6 "[::1]")
// can't be allowlisted, so the toggle is disabled for them.
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const HOSTNAME_REGEX = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*(?=[a-z0-9-]*[a-z])[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const isAllowlistable = (host) => IPV4_REGEX.test(host) || HOSTNAME_REGEX.test(host);

document.addEventListener("DOMContentLoaded", async () => {
  const $ = (id) => document.getElementById(id);
  const masterToggle = $("master-toggle");
  const currentDomainEl = $("current-domain");
  const siteAllowToggle = $("site-allow-toggle");
  const siteStatusEl = $("site-status");
  const blockedCountEl = $("blocked-count");
  const reloadBtn = $("reload-tab");
  const modules = {
    ruleset_ads: $("module-ads"),
    ruleset_trackers: $("module-trackers"),
    ruleset_cookies: $("module-cookies"),
    cosmeticEnabled: $("module-cosmetic")
  };

  $("version").textContent = `v${chrome.runtime.getManifest().version} (MV3)`;

  let activeTab = null;
  let currentHost = "";
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      const url = new URL(activeTab.url);
      if (url.protocol === "http:" || url.protocol === "https:") currentHost = url.hostname;
    }
  } catch (_) {
    currentHost = "";
  }
  currentDomainEl.textContent = currentHost || "Internal / Chrome page";

  const data = await chrome.storage.local.get([
    "masterEnabled",
    ...Object.keys(modules),
    "allowlistedDomains"
  ]);

  masterToggle.checked = data.masterEnabled !== false;
  for (const [key, input] of Object.entries(modules)) input.checked = data[key] !== false;
  const allowlist = data.allowlistedDomains || [];
  const canAllowlist = Boolean(currentHost) && isAllowlistable(currentHost);
  const coveringEntry = canAllowlist ? allowlist.find((d) => coversHost(d, currentHost)) : undefined;
  siteAllowToggle.checked = Boolean(coveringEntry);

  updateSiteStatus(Boolean(coveringEntry), coveringEntry);
  updateModuleAvailability(masterToggle.checked);
  loadBlockedCount();

  async function loadBlockedCount() {
    if (!activeTab || !activeTab.id || !currentHost) return;
    try {
      // Opening the popup grants activeTab for this tab, which is what
      // getMatchedRules requires (no declarativeNetRequestFeedback needed).
      const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: activeTab.id });
      const blocked = rulesMatchedInfo.filter((m) => BLOCKING_RULESETS.has(m.rule.rulesetId)).length;
      blockedCountEl.textContent = String(blocked);
    } catch (_) {
      blockedCountEl.textContent = "–";
    }
  }

  function updateSiteStatus(allowed, entry) {
    siteAllowToggle.title = "Allowlist this site and its subdomains";
    if (!canAllowlist) {
      siteStatusEl.textContent = "N/A";
      siteStatusEl.className = "status-tag";
    } else if (allowed) {
      // Turning this off removes the covering entry, which re-protects every
      // subdomain under it — say so when that entry is a parent domain.
      const viaParent = entry && entry !== normalizeHost(currentHost);
      siteStatusEl.textContent = viaParent ? `Allowlisted via ${entry}` : "Allowlisted";
      siteStatusEl.className = "status-tag whitelisted";
      if (viaParent) siteAllowToggle.title = `Turning off removes the allowlist entry for ${entry} and all its subdomains`;
    } else {
      siteStatusEl.textContent = "Protected";
      siteStatusEl.className = "status-tag";
    }
  }

  function updateModuleAvailability(isMasterOn) {
    Object.values(modules).forEach((input) => { input.disabled = !isMasterOn; });
    siteAllowToggle.disabled = !isMasterOn || !canAllowlist;
  }

  masterToggle.addEventListener("change", async () => {
    await chrome.storage.local.set({ masterEnabled: masterToggle.checked });
    updateModuleAvailability(masterToggle.checked);
  });

  siteAllowToggle.addEventListener("change", async () => {
    if (!canAllowlist) return;
    const allow = siteAllowToggle.checked;
    const stored = await chrome.storage.local.get(["allowlistedDomains"]);
    let list = stored.allowlistedDomains || [];

    if (allow) {
      if (!list.some((d) => coversHost(d, currentHost))) list.push(normalizeHost(currentHost));
    } else {
      // Remove every entry that covers this host (e.g. a parent domain).
      list = list.filter((d) => !coversHost(d, currentHost));
    }

    await chrome.storage.local.set({ allowlistedDomains: list });
    updateSiteStatus(allow, list.find((d) => coversHost(d, currentHost)));
  });

  for (const [key, input] of Object.entries(modules)) {
    input.addEventListener("change", () => chrome.storage.local.set({ [key]: input.checked }));
  }

  reloadBtn.addEventListener("click", () => {
    if (activeTab && activeTab.id) {
      chrome.tabs.reload(activeTab.id);
      window.close();
    }
  });
});
