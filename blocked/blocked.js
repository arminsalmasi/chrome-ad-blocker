// Blocked-requests window: lists requests blocked on one tab, grouped by
// domain. Opened from the popup as blocked.html?tabId=<id>; reads the log the
// service worker keeps in chrome.storage.session and updates live.

const params = new URLSearchParams(location.search);
const tabId = Number(params.get("tabId"));
const storageKey = `blocked:${tabId}`;

const $ = (id) => document.getElementById(id);
const listEl = $("list");
const emptyEl = $("empty");
const filterEl = $("filter");
const openHosts = new Set(); // keep expanded groups open across re-renders
let current = { pageUrl: "", entries: [] };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // never innerHTML: URLs are untrusted
  return node;
}

function render() {
  const query = filterEl.value.trim().toLowerCase();
  const entries = current.entries.filter((e) =>
    !query || e.host.includes(query) || e.url.toLowerCase().includes(query) || e.type.includes(query));

  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.host)) groups.set(e.host, []);
    groups.get(e.host).push(e);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  $("total").textContent = String(current.entries.length);
  $("summary").textContent = query
    ? `${entries.length} of ${current.entries.length} requests, ${groups.size} domains`
    : `${groups.size} domain${groups.size === 1 ? "" : "s"}`;
  emptyEl.hidden = current.entries.length > 0;

  const fragment = document.createDocumentFragment();
  for (const [host, items] of sorted) {
    const details = el("details", "domain");
    details.open = openHosts.has(host);
    details.addEventListener("toggle", () => {
      if (details.open) openHosts.add(host); else openHosts.delete(host);
    });
    const summary = el("summary");
    summary.append(el("span", "chevron", "▸"), el("span", "host", host),
      el("span", "types", [...new Set(items.map((i) => i.type))].join(", ")),
      el("span", "count", String(items.length)));
    const ul = el("ul", "urls");
    for (const item of items) {
      const li = el("li");
      li.append(el("span", "type", item.type), el("span", "url", item.url));
      ul.append(li);
    }
    details.append(summary, ul);
    fragment.append(details);
  }
  listEl.replaceChildren(fragment);
}

async function load() {
  if (!Number.isInteger(tabId) || tabId < 0) {
    $("page").textContent = "No tab selected.";
    emptyEl.hidden = false;
    return;
  }
  const stored = await chrome.storage.session.get(storageKey);
  current = stored[storageKey] || { pageUrl: "", entries: [] };
  try {
    const tab = await chrome.tabs.get(tabId);
    $("page").textContent = tab.title ? `${tab.title} — ${tab.url || ""}` : tab.url || current.pageUrl;
  } catch (_) {
    $("page").textContent = current.pageUrl ? `${current.pageUrl} (tab closed)` : "Tab closed";
  }
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || !(storageKey in changes)) return;
  current = changes[storageKey].newValue || { pageUrl: "", entries: [] };
  render();
});
filterEl.addEventListener("input", render);
load();
