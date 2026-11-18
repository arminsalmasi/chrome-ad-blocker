// Service Worker for ShieldBlock

const tabBlockCounts = new Map();

// Helper to get or allocate rule ID for allowlisted domain
async function getRuleIdForDomain(domain) {
  const data = await chrome.storage.local.get(["allowlistRuleMap", "nextDynamicRuleId"]);
  const map = data.allowlistRuleMap || {};
  let nextId = data.nextDynamicRuleId || 10000;

  if (map[domain]) {
    return map[domain];
  }

  const allocatedId = nextId++;
  map[domain] = allocatedId;
  await chrome.storage.local.set({ allowlistRuleMap: map, nextDynamicRuleId: nextId });
  return allocatedId;
}

// Sync declarativeNetRequest static rulesets with stored settings
async function syncRulesets() {
  try {
    const settings = await chrome.storage.local.get([
      "masterEnabled",
      "ruleset_ads",
      "ruleset_trackers",
      "ruleset_cookies"
    ]);

    const allRulesets = ["ruleset_ads", "ruleset_trackers", "ruleset_cookies"];
    let enableIds = [];
    let disableIds = [];

    if (settings.masterEnabled === false) {
      disableIds = allRulesets;
    } else {
      for (const id of allRulesets) {
        if (settings[id] !== false) {
          enableIds.push(id);
        } else {
          disableIds.push(id);
        }
      }
    }

    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enableIds,
      disableRulesetIds: disableIds
    });
  } catch (err) {
    console.error("Failed to sync static rulesets:", err);
  }
}

// Sync dynamic allowlist rules from storage
async function syncDynamicAllowlist() {
  try {
    const data = await chrome.storage.local.get(["allowlistedDomains", "allowlistRuleMap"]);
    const domains = data.allowlistedDomains || [];
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
    const currentIds = currentRules.map((r) => r.id);

    const rulesToAdd = [];
    for (const domain of domains) {
      const ruleId = await getRuleIdForDomain(domain);
      rulesToAdd.push({
        id: ruleId,
        priority: 9999,
        action: { type: "allowAllRequests" },
        condition: {
          requestDomains: [domain],
          resourceTypes: ["main_frame"]
        }
      });
      rulesToAdd.push({
        id: ruleId + 500000,
        priority: 9999,
        action: { type: "allow" },
        condition: {
          initiatorDomains: [domain]
        }
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentIds,
      addRules: rulesToAdd
    });
  } catch (err) {
    console.error("Failed to sync dynamic allowlist:", err);
  }
}

// Initialization on install and startup
async function initializeExtension() {
  const current = await chrome.storage.local.get([
    "masterEnabled",
    "ruleset_ads",
    "ruleset_trackers",
    "ruleset_cookies",
    "cosmeticEnabled",
    "allowlistedDomains",
    "allowlistRuleMap",
    "nextDynamicRuleId"
  ]);

  const defaults = {
    masterEnabled: current.masterEnabled ?? true,
    ruleset_ads: current.ruleset_ads ?? true,
    ruleset_trackers: current.ruleset_trackers ?? true,
    ruleset_cookies: current.ruleset_cookies ?? true,
    cosmeticEnabled: current.cosmeticEnabled ?? true,
    allowlistedDomains: current.allowlistedDomains ?? [],
    allowlistRuleMap: current.allowlistRuleMap ?? {},
    nextDynamicRuleId: current.nextDynamicRuleId ?? 10000
  };

  await chrome.storage.local.set(defaults);
  await syncRulesets();
  await syncDynamicAllowlist();
}

chrome.runtime.onInstalled.addListener(initializeExtension);
chrome.runtime.onStartup.addListener(initializeExtension);

// Track blocked rules per tab for badge display
if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    // Only count block actions from ads and trackers rulesets
    const isBlockRuleset = info.rule?.rulesetId === "ruleset_ads" || info.rule?.rulesetId === "ruleset_trackers";
    if (!isBlockRuleset) return;

    const tabId = info.request?.tabId;
    if (tabId && tabId > 0) {
      const current = (tabBlockCounts.get(tabId) || 0) + 1;
      tabBlockCounts.set(tabId, current);

      chrome.action.setBadgeText({ tabId, text: String(current) }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93838" }).catch(() => {});
    }
  });
}

// Reset badge on tab update/refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabBlockCounts.delete(tabId);
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockCounts.delete(tabId);
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "GET_STATS") {
    const count = tabBlockCounts.get(message.tabId) || 0;
    sendResponse({ count });
    return false;
  }

  if (message.type === "SYNC_RULESETS") {
    syncRulesets()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "UPDATE_ALLOWLIST") {
    syncDynamicAllowlist()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
