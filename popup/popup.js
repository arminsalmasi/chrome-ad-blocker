document.addEventListener("DOMContentLoaded", async () => {
  const masterToggle = document.getElementById("master-toggle");
  const currentDomainEl = document.getElementById("current-domain");
  const siteAllowToggle = document.getElementById("site-allow-toggle");
  const siteStatusEl = document.getElementById("site-status");
  const blockedCountEl = document.getElementById("blocked-count");

  const moduleAds = document.getElementById("module-ads");
  const moduleTrackers = document.getElementById("module-trackers");
  const moduleCookies = document.getElementById("module-cookies");
  const moduleCosmetic = document.getElementById("module-cosmetic");
  const reloadBtn = document.getElementById("reload-tab");

  // Get active tab info
  let activeTab = null;
  let currentHost = "";

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs && tabs[0] ? tabs[0] : null;
    if (activeTab && activeTab.url) {
      const url = new URL(activeTab.url);
      if (url.protocol.startsWith("http")) {
        currentHost = url.hostname;
      }
    }
  } catch (e) {
    currentHost = "";
  }

  currentDomainEl.textContent = currentHost || "Internal / Chrome page";

  // Load storage state
  const data = await chrome.storage.local.get([
    "masterEnabled",
    "ruleset_ads",
    "ruleset_trackers",
    "ruleset_cookies",
    "cosmeticEnabled",
    "allowlistedDomains"
  ]);

  const master = data.masterEnabled !== false;
  const ads = data.ruleset_ads !== false;
  const trackers = data.ruleset_trackers !== false;
  const cookies = data.ruleset_cookies !== false;
  const cosmetic = data.cosmeticEnabled !== false;
  const allowlist = data.allowlistedDomains || [];
  const isAllowlisted = currentHost ? allowlist.includes(currentHost) : false;

  masterToggle.checked = master;
  moduleAds.checked = ads;
  moduleTrackers.checked = trackers;
  moduleCookies.checked = cookies;
  moduleCosmetic.checked = cosmetic;
  siteAllowToggle.checked = isAllowlisted;

  updateSiteStatus(isAllowlisted);
  updateModuleAvailability(master);

  // Fetch blocked stats
  if (activeTab && activeTab.id) {
    chrome.runtime.sendMessage({ type: "GET_STATS", tabId: activeTab.id }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && typeof response.count === "number") {
        blockedCountEl.textContent = response.count;
      }
    });
  }

  function updateSiteStatus(allowed) {
    if (!currentHost) {
      siteStatusEl.textContent = "N/A";
      siteStatusEl.className = "status-tag";
      return;
    }
    if (allowed) {
      siteStatusEl.textContent = "Allowlisted";
      siteStatusEl.className = "status-tag whitelisted";
    } else {
      siteStatusEl.textContent = "Protected";
      siteStatusEl.className = "status-tag";
    }
  }

  function updateModuleAvailability(isMasterOn) {
    [moduleAds, moduleTrackers, moduleCookies, moduleCosmetic].forEach((input) => {
      input.disabled = !isMasterOn;
    });
    siteAllowToggle.disabled = !isMasterOn || !currentHost;
  }

  // Master switch handler
  masterToggle.addEventListener("change", async () => {
    const enabled = masterToggle.checked;
    await chrome.storage.local.set({ masterEnabled: enabled });
    updateModuleAvailability(enabled);
    chrome.runtime.sendMessage({ type: "SYNC_RULESETS" }, () => {
      if (chrome.runtime.lastError) {}
    });
  });

  // Per-site allowlist switch handler
  siteAllowToggle.addEventListener("change", async () => {
    if (!currentHost) return;
    const allow = siteAllowToggle.checked;
    const stored = await chrome.storage.local.get(["allowlistedDomains"]);
    let list = stored.allowlistedDomains || [];

    if (allow) {
      if (!list.includes(currentHost)) list.push(currentHost);
    } else {
      list = list.filter((d) => d !== currentHost);
    }

    await chrome.storage.local.set({ allowlistedDomains: list });
    updateSiteStatus(allow);
    chrome.runtime.sendMessage({ type: "UPDATE_ALLOWLIST" }, () => {
      if (chrome.runtime.lastError) {}
    });
  });

  // Granular module handlers
  async function bindModuleToggle(element, storageKey) {
    element.addEventListener("change", async () => {
      await chrome.storage.local.set({ [storageKey]: element.checked });
      chrome.runtime.sendMessage({ type: "SYNC_RULESETS" }, () => {
        if (chrome.runtime.lastError) {}
      });
    });
  }

  bindModuleToggle(moduleAds, "ruleset_ads");
  bindModuleToggle(moduleTrackers, "ruleset_trackers");
  bindModuleToggle(moduleCookies, "ruleset_cookies");

  moduleCosmetic.addEventListener("change", async () => {
    await chrome.storage.local.set({ cosmeticEnabled: moduleCosmetic.checked });
  });

  // Reload current tab
  reloadBtn.addEventListener("click", () => {
    if (activeTab && activeTab.id) {
      chrome.tabs.reload(activeTab.id);
      window.close();
    }
  });
});
